mod api_client;
mod collectors;
mod config;
mod host;
mod scheduler;

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

/// Monli monitoring agent.
#[derive(Parser)]
#[command(version, about)]
struct Cli {
    /// Server URL. Only needed when enrolling with --token.
    #[arg(long, requires = "token")]
    server: Option<String>,

    /// Single-use enrollment token. Enrolls this host and overwrites any
    /// existing credentials.
    #[arg(long, requires = "server")]
    token: Option<String>,

    /// Where enrollment credentials are stored.
    #[arg(long, default_value = config::DEFAULT_PATH)]
    credentials: PathBuf,
}

#[tokio::main]
async fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    match run(Cli::parse()).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            // `{:#}` prints the whole context chain on one line.
            error!("{e:#}");
            ExitCode::FAILURE
        }
    }
}

async fn run(cli: Cli) -> Result<()> {
    // clap's `requires` guarantees server and token come together.
    let creds = match (cli.server, cli.token) {
        (Some(server), Some(token)) => enroll(&server, &token, &cli.credentials).await?,
        _ => config::load(&cli.credentials)?,
    };

    // Same path for a fresh enrollment and a reboot.
    let client = ApiClient::new(&creds.server_url).context("building HTTP client")?;
    let metrics = with_retry("fetching metric list", || {
        client.get_metrics(creds.target_id, &creds.api_key)
    })
    .await
    .context("fetching metric list")?;

    info!(target_id = creds.target_id, count = metrics.len(), "loaded metric list");

    scheduler::Scheduler::new(
        client,
        creds.target_id,
        &creds.api_key,
        collectors::registry(),
        metrics,
    )
    .run()
    .await
}

async fn enroll(server: &str, token: &str, path: &Path) -> Result<Credentials> {
    let identity = host::identity()?;
    info!(hostname = %identity.hostname, %server, "enrolling");

    let client = ApiClient::new(server).context("building HTTP client")?;
    let resp = with_retry("registering", || client.register(token, &identity))
        .await
        .map_err(|e| match e {
            ApiError::Http { status: StatusCode::UNAUTHORIZED, .. } => {
                anyhow!("{e}; get a new install command from the Monli UI")
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
    Ok(creds)
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
