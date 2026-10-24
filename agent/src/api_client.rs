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

/// Body of `GET /targets/:id/poll`: the assigned metrics, plus the ones a
/// user asked to collect right away instead of waiting for their interval.
#[derive(Debug, Deserialize)]
pub struct AgentPoll {
    pub metrics: Vec<MetricSpec>,
    /// `default`: a missing field reads as an empty list.
    #[serde(default)]
    pub check_now: Vec<String>,
}

/// Body of `POST /targets/:id/metrics`, matching `submitReadingSchema`.
#[derive(Debug, Clone, Serialize)]
pub struct Reading {
    pub metric_key: String,
    /// `flatten` writes the values' fields straight into this object.
    #[serde(flatten)]
    pub values: ReadingValues,
    /// RFC 3339, stamped when collected so a late send keeps the right time.
    pub recorded_at: String,
}

/// What a reading measured. `untagged` writes only the variant's fields, so
/// `Host` is `"value": 1.5` and `Devices` is `"devices": [...]`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum ReadingValues {
    Host { value: f64 },
    /// One value per interface (mount point, disk, NIC), sent together.
    Devices { devices: Vec<DeviceValue> },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DeviceValue {
    pub device: String,
    pub value: f64,
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

    pub async fn poll(&self, target_id: i64, api_key: &str) -> Result<AgentPoll, ApiError> {
        let resp = self
            .http
            .get(format!("{}/targets/{target_id}/poll", self.base_url))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn reading(values: ReadingValues) -> serde_json::Value {
        let reading =
            Reading { metric_key: "m".to_owned(), values, recorded_at: "t".to_owned() };
        serde_json::to_value(reading).expect("a reading always serializes")
    }

    #[test]
    fn readings_serialize_to_the_server_shape() {
        let host = reading(ReadingValues::Host { value: 1.5 });
        let devices = reading(ReadingValues::Devices {
            devices: vec![DeviceValue { device: "/".to_owned(), value: 2.0 }],
        });

        assert_eq!(host, serde_json::json!({"metric_key": "m", "value": 1.5, "recorded_at": "t"}));
        assert_eq!(
            devices,
            serde_json::json!({
                "metric_key": "m",
                "devices": [{"device": "/", "value": 2.0}],
                "recorded_at": "t"
            })
        );
    }

    #[test]
    fn poll_parses_with_and_without_checks() {
        let with_checks: AgentPoll = serde_json::from_value(serde_json::json!({
            "metrics": [{"metric_key": "cpu", "report_interval_sec": 60}],
            "check_now": ["cpu"]
        }))
        .expect("valid poll body");
        let without_checks: AgentPoll =
            serde_json::from_value(serde_json::json!({"metrics": []})).expect("valid poll body");

        assert_eq!(with_checks.metrics[0].metric_key, "cpu");
        assert_eq!(with_checks.check_now, ["cpu"]);
        assert!(without_checks.check_now.is_empty());
    }
}
