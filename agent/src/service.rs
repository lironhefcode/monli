//! Runs the agent under the Windows service manager (SCM), the Windows
//! counterpart of the systemd unit. The SCM starts `monli-agent.exe --service`;
//! the program must then report that it is running and stop when asked, or
//! the SCM kills it.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use anyhow::{Context, Result};
use tokio::sync::Notify;
use tracing::error;
use tracing_appender::rolling::{self, Rotation};
use windows_service::service::{
    ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::{define_windows_service, service_dispatcher};

pub const SERVICE_NAME: &str = "monli-agent";
const LOG_FILES_KEPT: usize = 7;

/// The SCM calls `service_main` without our arguments, so `run` leaves the
/// credentials path here for it.
static CREDENTIALS: OnceLock<PathBuf> = OnceLock::new();

define_windows_service!(ffi_service_main, service_main);

/// Log files live next to the credentials, e.g. C:\ProgramData\Monli\logs.
pub fn log_dir(credentials: &Path) -> PathBuf {
    credentials.parent().unwrap_or(Path::new(".")).join("logs")
}

/// Hands this thread to the SCM until the service has stopped.
pub fn run(credentials: PathBuf) -> ExitCode {
    CREDENTIALS.set(credentials).expect("run is called once");
    match service_dispatcher::start(SERVICE_NAME, ffi_service_main) {
        Ok(()) => ExitCode::SUCCESS,
        // Usually: started from a console instead of by the SCM.
        Err(e) => {
            eprintln!("monli: could not start as a service: {e}");
            ExitCode::FAILURE
        }
    }
}

fn service_main(_arguments: Vec<OsString>) {
    let credentials = CREDENTIALS.get().expect("set by run");
    init_logging(&log_dir(credentials));
    if let Err(e) = run_service(credentials) {
        error!("{e:#}");
    }
}

fn run_service(credentials: &Path) -> Result<()> {
    let stop = Arc::new(Notify::new());
    let handler_stop = Arc::clone(&stop);
    let status = service_control_handler::register(SERVICE_NAME, move |control| match control {
        ServiceControl::Stop | ServiceControl::Shutdown => {
            handler_stop.notify_one();
            ServiceControlHandlerResult::NoError
        }
        ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
        _ => ServiceControlHandlerResult::NotImplemented,
    })
    .context("registering with the service manager")?;

    let report = |state: ServiceState, exit_code: ServiceExitCode| {
        let controls_accepted = match state {
            ServiceState::Running => ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
            _ => ServiceControlAccept::empty(),
        };
        status.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: state,
            controls_accepted,
            exit_code,
            checkpoint: 0,
            wait_hint: Duration::ZERO,
            process_id: None,
        })
    };

    report(ServiceState::Running, ServiceExitCode::Win32(0)).context("reporting running")?;

    let result = crate::block_on(crate::run_agent(credentials, async move {
        stop.notified().await;
    }));

    // A non-zero exit code counts as a failure, so the SCM's restart action
    // (set by install.rs) applies, like systemd's Restart=always.
    let exit_code = match &result {
        Ok(()) => ServiceExitCode::Win32(0),
        Err(e) => {
            error!("{e:#}");
            ServiceExitCode::ServiceSpecific(1)
        }
    };
    report(ServiceState::Stopped, exit_code).context("reporting stopped")?;
    Ok(())
}

/// Daily files (agent.YYYY-MM-DD.log); older ones beyond LOG_FILES_KEPT are deleted.
fn init_logging(dir: &Path) {
    let appender = rolling::Builder::new()
        .rotation(Rotation::DAILY)
        .filename_prefix("agent")
        .filename_suffix("log")
        .max_log_files(LOG_FILES_KEPT)
        .build(dir);
    // No log folder: keep monitoring without logs rather than not at all.
    if let Ok(appender) = appender {
        tracing_subscriber::fmt()
            .with_env_filter(crate::log_filter())
            .with_writer(appender)
            .with_ansi(false)
            .init();
    }
}
