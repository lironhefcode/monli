//! Built-in collectors, looked up by the server's `metric_key`.

mod cpu;
mod disk;
mod memory;

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;

/// Measures one metric. `Send + Sync` lets one collector be shared by the
/// tasks the scheduler spawns, which may run on any thread.
#[async_trait]
pub trait Collector: Send + Sync {
    async fn collect(&self) -> Result<f64>;
}

pub type Registry = HashMap<&'static str, Arc<dyn Collector>>;

pub fn registry() -> Registry {
    let mut registry: Registry = HashMap::new();
    registry.insert("cpu_utilization", Arc::new(cpu::CpuPercent::new()));
    registry.insert("memory_utilization", Arc::new(memory::MemoryUsedPct));
    registry.insert("disk_utilization", Arc::new(disk::DiskUsedPct));
    registry
}
