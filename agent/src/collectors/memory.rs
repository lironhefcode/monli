use anyhow::{Result, bail};
use async_trait::async_trait;
use sysinfo::System;

use super::Collector;

/// Memory is a snapshot, not a rate, so no state is kept between calls.
pub struct MemoryUsedPct;

#[async_trait]
impl Collector for MemoryUsedPct {
    async fn collect(&self) -> Result<f64> {
        let mut system = System::new();
        system.refresh_memory();

        let total = system.total_memory();
        if total == 0 {
            bail!("total memory reported as 0");
        }
        Ok(system.used_memory() as f64 / total as f64 * 100.0)
    }
}
