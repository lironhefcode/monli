use anyhow::Result;
use async_trait::async_trait;
use sysinfo::System;

use super::Collector;

/// Swap used, as a percentage. A host without swap reports 0%.
pub struct SwapUtilization;

#[async_trait]
impl Collector for SwapUtilization {
    async fn collect(&self) -> Result<f64> {
        let mut system = System::new();
        system.refresh_memory();

        let total = system.total_swap();
        if total == 0 {
            return Ok(0.0);
        }
        Ok(system.used_swap() as f64 / total as f64 * 100.0)
    }
}
