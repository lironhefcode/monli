use std::sync::{Mutex, MutexGuard};

use anyhow::{Result, anyhow};
use async_trait::async_trait;
use sysinfo::{MINIMUM_CPU_UPDATE_INTERVAL, System};

use super::Collector;

/// CPU usage is a rate (busy time / elapsed time), so it needs two samples
/// with a gap between them. `System` remembers the previous sample.
pub struct CpuPercent {
    system: Mutex<System>,
}

impl CpuPercent {
    pub fn new() -> Self {
        Self {
            system: Mutex::new(System::new()),
        }
    }

    fn lock(&self) -> Result<MutexGuard<'_, System>> {
        // Poisoned means a previous holder panicked mid-update.
        self.system
            .lock()
            .map_err(|_| anyhow!("CPU sampler state is poisoned"))
    }
}

#[async_trait]
impl Collector for CpuPercent {
    async fn collect(&self) -> Result<f64> {
        // Each guard is dropped at the end of its statement: a std Mutex
        // must not be held across `.await`.
        self.lock()?.refresh_cpu_usage();
        tokio::time::sleep(MINIMUM_CPU_UPDATE_INTERVAL).await;

        let mut system = self.lock()?;
        system.refresh_cpu_usage();
        Ok(f64::from(system.global_cpu_usage()))
    }
}
