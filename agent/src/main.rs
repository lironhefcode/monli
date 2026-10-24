mod api_client;
#[cfg(windows)]
mod baked;
mod collectors;
mod config;
mod host;
#[cfg(windows)]
mod install;
mod scheduler;
#[cfg(windows)]
mod service;

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Duration;

use anyhow::{Context, Result, anyhow};
use clap::Parser;
use reqwest::StatusCode;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

use api_client::{ApiClient, ApiError};
use config::Credentials;

const MAX_BACKOFF: Duration = Duration::from_secs(60);

// Shown when the server rejects the enrollment token.
#[cfg(not(windows))]
const NEW_TOKEN_HINT: &str = "get a new install command from the Monli UI";
#[cfg(windows)]
const NEW_TOKEN_HINT: &str = "download the agent again from the Monli UI";

/// Monli monitoring agent.
#[derive(Parser)]
#[command(version, about)]
struct Cli {
    /// Server URL. Only needed when enrolling with --token.
    #[arg(long, requires = "token")]
    server: Option<String>,

    /// Single-use enrollment token. Enrolls this host, overwrites any
    /// existing credentials, and exits; run again without it to start.
    #[arg(long, requires = "server")]
    token: Option<String>,

    /// Where enrollment credentials are stored.
    #[arg(long, default_value = config::DEFAULT_PATH)]
    credentials: PathBuf,

    /// Run under the Windows service manager. Set by the installed service.
    #[cfg(windows)]
    #[arg(long, hide = true, conflicts_with = "token")]
    service: bool,
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    // The service logs to files, so it sets up its own logging.
    #[cfg(windows)]
    if cli.service {
        return service::run(cli.credentials);
    }

    tracing_subscriber::fmt()
        .with_env_filter(log_filter())
        // A double-clicked exe may get the old Windows console, which prints
        // colour codes as text.
        .with_ansi(!cfg!(windows))
        .init();

    // An exe downloaded from the UI carries its server URL and token, so
    // double-clicking it installs the agent.
    #[cfg(windows)]
    if cli.token.is_none() {
        if let Some(code) = install::run_if_baked(&cli.credentials) {
            return code;
        }
    }

    match block_on(run(cli, ctrl_c())) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            // `{:#}` prints the whole context chain on one line.
            error!("{e:#}");
            ExitCode::FAILURE
        }
    }
}

fn log_filter() -> EnvFilter {
    EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"))
}

/// What `#[tokio::main]` sets up. Built by hand because the Windows service
/// starts from a plain thread the service manager hands us.
fn block_on<F: Future>(future: F) -> F::Output {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("building the tokio runtime")
        .block_on(future)
}

/// Completes on Ctrl-C (or if the handler can't be installed).
async fn ctrl_c() {
    let _ = tokio::signal::ctrl_c().await;
}

async fn run(cli: Cli, shutdown: impl Future<Output = ()>) -> Result<()> {
    // clap's `requires` guarantees server and token come together.
    // Enrolling is a one-shot step: install.sh (or the Windows installer)
    // runs it, then the service starts the long-running agent without a token.
    if let (Some(server), Some(token)) = (cli.server, cli.token) {
        enroll(&server, &token, &cli.credentials).await?;
        return Ok(());
    }

    run_agent(&cli.credentials, shutdown).await
}

/// Runs the agent with saved credentials until `shutdown` completes.
async fn run_agent(credentials: &Path, shutdown: impl Future<Output = ()>) -> Result<()> {
    let mut shutdown = std::pin::pin!(shutdown);

    let creds = config::load(credentials)?;
    let client = ApiClient::new(&creds.server_url).context("building HTTP client")?;
    // Retries until the server answers (e.g. it's down at boot), so a stop
    // has to be able to cut it short. Check requests are moot here: every
    // metric runs on the first tick anyway.
    let metrics = tokio::select! {
        poll = with_retry("fetching metric list", || {
            client.poll(creds.target_id, &creds.api_key)
        }) => poll.context("fetching metric list")?.metrics,
        () = &mut shutdown => {
            info!("shutting down");
            return Ok(());
        }
    };

    info!(target_id = creds.target_id, count = metrics.len(), "loaded metric list");

    scheduler::Scheduler::new(
        client,
        creds.target_id,
        &creds.api_key,
        collectors::registry(),
        metrics,
    )
    .run(shutdown)
    .await
}

async fn enroll(server: &str, token: &str, path: &Path) -> Result<()> {
    let identity = host::identity()?;
    info!(hostname = %identity.hostname, %server, "enrolling");

    let client = ApiClient::new(server).context("building HTTP client")?;
    let resp = with_retry("registering", || client.register(token, &identity))
        .await
        .map_err(|e| match e {
            ApiError::Http { status: StatusCode::UNAUTHORIZED, .. } => {
                anyhow!("{e}; {NEW_TOKEN_HINT}")
            }
            e => anyhow!(e).context("registering with server"),
        })?;

    // The token is spent now: if this save fails, recovery is a new token.
    let creds = Credentials {
        server_url: server.to_owned(),
        target_id: resp.target.id,
        api_key: resp.api_key,
    };
    config::save(path, &creds)?;
    info!(target_id = creds.target_id, path = %path.display(), "enrolled; credentials saved");
    Ok(())
}

/// Retries `op` with exponential backoff (1s, 2s, 4s, ... capped at 60s)
/// while the error is retryable; returns the first non-retryable error.
async fn with_retry<T, F, Fut>(what: &str, mut op: F) -> Result<T, ApiError>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, ApiError>>,
{
    let mut delay = Duration::from_secs(1);
    loop {
        match op().await {
            Ok(value) => return Ok(value),
            Err(e) if e.is_retryable() => {
                warn!(error = %e, retry_in_secs = delay.as_secs(), "{what} failed; retrying");
                tokio::time::sleep(delay).await;
                delay = (delay * 2).min(MAX_BACKOFF);
            }
            Err(e) => return Err(e),
        }
    }
}
