use anyhow::Result;
use async_trait::async_trait;
use sysinfo::System;

use super::Collector;

/// Seconds since boot. A small value means the host just restarted.
pub struct SystemUptime;

#[async_trait]
impl Collector for SystemUptime {
    async fn collect(&self) -> Result<f64> {
        Ok(System::uptime() as f64)
    }
}
