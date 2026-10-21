//! HTTP calls to the Monli server.

use std::time::Duration;

use reqwest::{Client, Response, StatusCode};
use serde::{Deserialize, Serialize};

use crate::host::HostIdentity;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("request failed: {0}")]
    Network(#[from] reqwest::Error),
    #[error("server returned {status}: {message}")]
    Http { status: StatusCode, message: String },
}

impl ApiError {
    /// Network trouble and 5xx may clear up on their own; 4xx means the
    /// request itself is wrong (e.g. a used token), so retrying won't help.
    pub fn is_retryable(&self) -> bool {
        match self {
            ApiError::Network(e) => !e.is_decode(),
            ApiError::Http { status, .. } => status.is_server_error(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterResponse {
    pub target: RegisteredTarget,
    pub api_key: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisteredTarget {
    pub id: i64,
}

#[derive(Debug, Deserialize)]
pub struct MetricSpec {
    pub metric_key: String,
    pub report_interval_sec: u64,
}

/// Body of `POST /targets/:id/metrics`, matching `submitReadingSchema`.
#[derive(Debug, Clone, Serialize)]
pub struct Reading {
    pub metric_key: String,
    /// Interface the value belongs to (mount point, disk, NIC); left out of
    /// the JSON for host-wide metrics.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    pub value: f64,
    /// RFC 3339, stamped when collected so a late send keeps the right time.
    pub recorded_at: String,
}

// Shape of the server's errorHandler output.
#[derive(Deserialize)]
struct ErrorBody {
    error: String,
}

pub struct ApiClient {
    http: Client,
    base_url: String,
}

impl ApiClient {
    pub fn new(base_url: &str) -> reqwest::Result<Self> {
        let http = Client::builder().timeout(Duration::from_secs(30)).build()?;
        Ok(Self {
            http,
            base_url: base_url.trim_end_matches('/').to_owned(),
        })
    }

    pub async fn register(
        &self,
        token: &str,
        identity: &HostIdentity,
    ) -> Result<RegisterResponse, ApiError> {
        let resp = self
            .http
            .post(format!("{}/agents/register", self.base_url))
            .header("X-Enrollment-Token", token)
            .json(identity)
            .send()
            .await?;
        Ok(check(resp).await?.json().await?)
    }

    pub async fn get_metrics(
        &self,
        target_id: i64,
        api_key: &str,
    ) -> Result<Vec<MetricSpec>, ApiError> {
        let resp = self
            .http
            .get(format!("{}/targets/{target_id}/metrics", self.base_url))
            .header("X-Api-Key", api_key)
            .send()
            .await?;
        Ok(check(resp).await?.json().await?)
    }

    pub async fn submit_reading(
        &self,
        target_id: i64,
        api_key: &str,
        reading: &Reading,
    ) -> Result<(), ApiError> {
        let resp = self
            .http
            .post(format!("{}/targets/{target_id}/metrics", self.base_url))
            .header("X-Api-Key", api_key)
            .json(reading)
            .send()
            .await?;
        check(resp).await?;
        Ok(())
    }
}

/// Turns a non-2xx response into `ApiError::Http`, keeping the server's message.
async fn check(resp: Response) -> Result<Response, ApiError> {
    let status = resp.status();
    if status.is_success() {
        return Ok(resp);
    }
    let body = resp.text().await.unwrap_or_default();
    let message = serde_json::from_str::<ErrorBody>(&body)
        .map(|b| b.error)
        .unwrap_or(body);
    Err(ApiError::Http { status, message })
}
