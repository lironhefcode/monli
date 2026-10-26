use anyhow::{Context, Result};
use async_trait::async_trait;
use sysinfo::{LoadAvg, System};

use super::Collector;

/// Load average divided by the logical CPU count, so 1.0 means "fully busy"
/// on any host. Raw load is not comparable between hosts with different cores.
pub struct LoadPerCore {
    window: fn(&LoadAvg) -> f64,
}

impl LoadPerCore {
    pub fn one_minute() -> Self {
        Self {
            window: |load| load.one,
        }
    }

    pub fn five_minutes() -> Self {
        Self {
            window: |load| load.five,
        }
    }

    pub fn fifteen_minutes() -> Self {
        Self {
            window: |load| load.fifteen,
        }
    }
}

#[async_trait]
impl Collector for LoadPerCore {
    async fn collect(&self) -> Result<f64> {
        let cores = std::thread::available_parallelism().context("counting CPU cores")?;
        Ok((self.window)(&System::load_average()) / cores.get() as f64)
    }
}
