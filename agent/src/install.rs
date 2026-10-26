//! Installs the agent from an exe downloaded from the Monli UI, which carries
//! the server URL and a single-use token (baked.rs). The Windows counterpart
//! of backend/static/install.sh, and likewise safe to re-run with a new download.
//!
//! Enrolling comes first, so a spent or expired token leaves an existing
//! install running untouched.

use std::fs::{self, File};
use std::io::{self, Read};
use std::os::windows::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use tracing::{error, info};
use windows_service::service::{
    Service, ServiceAccess, ServiceAction, ServiceActionType, ServiceErrorControl,
    ServiceFailureActions, ServiceFailureResetPeriod, ServiceInfo, ServiceStartType, ServiceState,
    ServiceType,
};
use windows_service::service_manager::{ServiceManager, ServiceManagerAccess};

use crate::baked::{self, Baked};
use crate::service::{self, SERVICE_NAME};

/// Program Files is writable only by admins, so no user can swap the exe
/// the service runs as LocalSystem.
const INSTALL_PATH: &str = r"C:\Program Files\Monli\monli-agent.exe";
const STOP_TIMEOUT: Duration = Duration::from_secs(30);
const RESTART_DELAY: Duration = Duration::from_secs(5);

// Well-known SIDs, which unlike account names aren't translated on
// non-English Windows.
const SYSTEM: &str = "*S-1-5-18";
const ADMINISTRATORS: &str = "*S-1-5-32-544";

// Win32 constants.
const ERROR_SHARING_VIOLATION: i32 = 32;
const ERROR_SERVICE_DOES_NOT_EXIST: i32 = 1060;
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

/// Installs when this exe carries baked data. `None` means it doesn't, so
/// main carries on as a plain agent.
pub fn run_if_baked(credentials: &Path) -> Option<ExitCode> {
    let result = match baked::read_current_exe() {
        Ok(None) => return None,
        Ok(Some(baked)) => install(&baked, credentials),
        Err(e) => Err(e),
    };

    let code = match result {
        Ok(()) => {
            let logs = service::log_dir(credentials);
            info!("agent installed and running (logs: {})", logs.display());
            ExitCode::SUCCESS
        }
        Err(e) => {
            error!("{e:#}");
            ExitCode::FAILURE
        }
    };
    // Double-clicked, this runs in its own console window, which would close
    // on exit before anyone could read the result.
    println!();
    println!("Press Enter to close this window.");
    let _ = io::stdin().read_line(&mut String::new());
    Some(code)
}

fn install(baked: &Baked, credentials: &Path) -> Result<()> {
    // Lock the folder down before the API key is written into it.
    let data_dir = credentials
        .parent()
        .context("credentials path has no folder")?;
    fs::create_dir_all(data_dir).with_context(|| format!("creating {}", data_dir.display()))?;
    restrict_to_admins(data_dir)?;

    crate::block_on(crate::enroll(&baked.server, &baked.token, credentials))?;

    let manager = ServiceManager::local_computer(
        None::<&str>,
        ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE,
    )
    .context("connecting to the service manager")?;
    let access = ServiceAccess::QUERY_STATUS
        | ServiceAccess::START
        | ServiceAccess::STOP
        | ServiceAccess::CHANGE_CONFIG;

    let existing = match manager.open_service(SERVICE_NAME, access) {
        Ok(service) => Some(service),
        Err(windows_service::Error::Winapi(e))
            if e.raw_os_error() == Some(ERROR_SERVICE_DOES_NOT_EXIST) =>
        {
            None
        }
        Err(e) => return Err(e).context("opening the existing service"),
    };
    if let Some(service) = &existing {
        info!("stopping the running agent");
        stop(service)?;
    }

    info!("copying the agent to {INSTALL_PATH}");
    copy_without_baked_data(Path::new(INSTALL_PATH), baked.exe_len)?;

    let info = service_info(credentials);
    let service = match existing {
        Some(service) => {
            service
                .change_config(&info)
                .context("updating the service")?;
            service
        }
        None => manager
            .create_service(&info, access)
            .context("creating the service")?,
    };
    service
        .set_description("Sends this host's metrics to Monli.")
        .context("describing the service")?;
    // Restart 5s after every failure, like systemd's Restart=always /
    // RestartSec=5. The last action repeats, so one is enough and the
    // failure count never needs resetting.
    service
        .update_failure_actions(ServiceFailureActions {
            reset_period: ServiceFailureResetPeriod::Never,
            reboot_msg: None,
            command: None,
            actions: Some(vec![ServiceAction {
                action_type: ServiceActionType::Restart,
                delay: RESTART_DELAY,
            }]),
        })
        .context("setting restart on failure")?;
    // Also when the agent exits with an error, not only when it crashes.
    service
        .set_failure_actions_on_non_crash_failures(true)
        .context("setting restart on failure")?;

    info!("starting the service");
    service.start::<&str>(&[]).context("starting the service")?;
    Ok(())
}

fn service_info(credentials: &Path) -> ServiceInfo {
    ServiceInfo {
        name: SERVICE_NAME.into(),
        display_name: "Monli monitoring agent".into(),
        service_type: ServiceType::OWN_PROCESS,
        start_type: ServiceStartType::AutoStart,
        error_control: ServiceErrorControl::Normal,
        executable_path: PathBuf::from(INSTALL_PATH),
        launch_arguments: vec![
            "--service".into(),
            "--credentials".into(),
            credentials.into(),
        ],
        dependencies: vec![],
        account_name: None, // LocalSystem
        account_password: None,
    }
}

/// Stops the service and waits until it has, so its exe can be replaced.
fn stop(service: &Service) -> Result<()> {
    let state = service
        .query_status()
        .context("querying the service")?
        .current_state;
    if !matches!(state, ServiceState::Stopped | ServiceState::StopPending) {
        service.stop().context("stopping the service")?;
    }

    let deadline = Instant::now() + STOP_TIMEOUT;
    while service
        .query_status()
        .context("querying the service")?
        .current_state
        != ServiceState::Stopped
    {
        if Instant::now() > deadline {
            bail!(
                "the running agent did not stop within {}s",
                STOP_TIMEOUT.as_secs()
            );
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Ok(())
}

/// Copies this exe without the baked data, so the installed copy is the plain
/// agent and holds no token. A just-stopped service's process can keep the
/// old file open for a moment, so that case is retried briefly.
fn copy_without_baked_data(dest: &Path, exe_len: u64) -> Result<()> {
    let source = std::env::current_exe().context("locating this exe")?;
    let dir = dest.parent().expect("INSTALL_PATH has a folder");
    fs::create_dir_all(dir).with_context(|| format!("creating {}", dir.display()))?;

    let mut attempts = 0;
    loop {
        match copy_prefix(&source, dest, exe_len) {
            Ok(()) => return Ok(()),
            Err(e) if e.raw_os_error() == Some(ERROR_SHARING_VIOLATION) && attempts < 10 => {
                attempts += 1;
                std::thread::sleep(Duration::from_millis(500));
            }
            Err(e) => return Err(e).with_context(|| format!("writing {}", dest.display())),
        }
    }
}

fn copy_prefix(source: &Path, dest: &Path, len: u64) -> io::Result<()> {
    let mut input = File::open(source)?.take(len);
    let mut output = File::create(dest)?;
    io::copy(&mut input, &mut output)?;
    output.sync_all()
}

/// Leaves only SYSTEM and Administrators on `dir` and what it holds. By
/// default every local user can read folders under ProgramData, and the
/// credentials file holds the API key.
///
/// Any user can also create the folder before the first install, and an
/// owner can always change permissions back. So: no links, Administrators
/// own everything, and nothing inside keeps its own permissions. If any step
/// fails, the API key is never written.
fn restrict_to_admins(dir: &Path) -> Result<()> {
    let metadata =
        fs::symlink_metadata(dir).with_context(|| format!("reading {}", dir.display()))?;
    if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
        bail!(
            "{} is a link, not a folder; delete it and run this again",
            dir.display()
        );
    }

    icacls(dir, &["/setowner", ADMINISTRATORS, "/T", "/C", "/Q"])?;
    icacls(
        dir,
        &[
            "/inheritance:r",
            "/grant:r",
            &format!("{SYSTEM}:(OI)(CI)F"),
            &format!("{ADMINISTRATORS}:(OI)(CI)F"),
        ],
    )?;
    // Everything inside drops its own entries and inherits the above.
    icacls(&dir.join("*"), &["/reset", "/T", "/C", "/Q"])?;

    // config::save writes through this temp file; a planted one (or a link)
    // must not be reused.
    let tmp = dir.join("credentials.toml.tmp");
    match fs::remove_file(&tmp) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => {
            Err(e).with_context(|| format!("removing {}", tmp.display()))
        }
        _ => Ok(()),
    }
}

fn icacls(target: &Path, args: &[&str]) -> Result<()> {
    // Full path: this runs elevated, so it must not pick up an icacls.exe
    // planted next to the downloaded exe.
    let windows = std::env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into());
    let output = Command::new(Path::new(&windows).join(r"System32\icacls.exe"))
        .arg(target)
        .args(args)
        .output()
        .context("running icacls")?;
    if !output.status.success() {
        bail!(
            "securing {} failed ({}{}); delete the folder and run this again",
            target.display(),
            String::from_utf8_lossy(&output.stdout).trim(),
            String::from_utf8_lossy(&output.stderr).trim(),
        );
    }
    Ok(())
}
