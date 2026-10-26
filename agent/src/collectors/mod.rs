//! Built-in collectors, looked up by the server's `metric_key`.

mod cpu;
mod disk;
mod load;
mod memory;
mod network;
mod process;
mod sampler;
mod swap;
mod uptime;

// Disk I/O counters exist on Linux (/sys/block) and Windows (per volume).
#[cfg(any(target_os = "linux", windows))]
mod diskio;
// These read /proc or /sys, so they only exist on Linux.
#[cfg(target_os = "linux")]
mod cpu_time;
#[cfg(target_os = "linux")]
mod inode;
#[cfg(target_os = "linux")]
mod tcp;
#[cfg(target_os = "linux")]
mod vmstat;

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;

use sampler::DeviceCounterRate;

/// One measured value. `device` names the interface it was measured on
/// (mount point, disk or NIC), or is `None` for a host-wide value.
#[derive(Debug, Clone, PartialEq)]
pub struct Sample {
    pub device: Option<String>,
    pub value: f64,
}

/// Measures one host-wide metric. `Send + Sync` lets one collector be shared
/// by the tasks the scheduler spawns, which may run on any thread.
#[async_trait]
pub trait Collector: Send + Sync {
    async fn collect(&self) -> Result<f64>;
}

/// Measures one metric on every device it applies to, one sample each.
#[async_trait]
pub trait DeviceCollector: Send + Sync {
    async fn collect(&self) -> Result<Vec<Sample>>;
}

// Every host-wide collector is also a `DeviceCollector` with a single
// device-less sample, so the scheduler only has to deal with one trait.
// (A "blanket impl": it covers every type `T` that implements `Collector`.)
#[async_trait]
impl<T: Collector> DeviceCollector for T {
    async fn collect(&self) -> Result<Vec<Sample>> {
        // `Collector::collect` picks that trait's method; plain `self.collect()`
        // would be ambiguous here, since `T` has both.
        let value = Collector::collect(self).await?;
        Ok(vec![Sample {
            device: None,
            value,
        }])
    }
}

pub type Registry = HashMap<&'static str, Arc<dyn DeviceCollector>>;

/// The collectors this OS supports. Metrics without one here are never
/// scheduled (the scheduler skips them), so they just show no data.
pub fn registry() -> Registry {
    let mut registry: Registry = HashMap::new();
    registry.insert("cpu_utilization", Arc::new(cpu::CpuPercent::new()));
    registry.insert("memory_utilization", Arc::new(memory::MemoryUsedPct));
    registry.insert("disk_utilization", Arc::new(disk::DiskUsedPct));
    registry.insert("swap_utilization", Arc::new(swap::SwapUtilization));
    registry.insert(
        "load_per_core_1m",
        Arc::new(load::LoadPerCore::one_minute()),
    );
    registry.insert(
        "load_per_core_5m",
        Arc::new(load::LoadPerCore::five_minutes()),
    );
    registry.insert(
        "load_per_core_15m",
        Arc::new(load::LoadPerCore::fifteen_minutes()),
    );
    registry.insert("process_count", Arc::new(process::ProcessCount));
    registry.insert("system_uptime", Arc::new(uptime::SystemUptime));
    let receive_rate = DeviceCounterRate::new(network::received_bytes);
    registry.insert("network_receive_rate", Arc::new(receive_rate));
    let transmit_rate = DeviceCounterRate::new(network::transmitted_bytes);
    registry.insert("network_transmit_rate", Arc::new(transmit_rate));
    registry.insert(
        "network_error_rate",
        Arc::new(DeviceCounterRate::new(network::errors)),
    );

    #[cfg(any(target_os = "linux", windows))]
    {
        registry.insert(
            "disk_read_rate",
            Arc::new(DeviceCounterRate::new(diskio::read_bytes)),
        );
        registry.insert(
            "disk_write_rate",
            Arc::new(DeviceCounterRate::new(diskio::written_bytes)),
        );
    }

    #[cfg(target_os = "linux")]
    {
        // Windows has no zombie process state, so it would always read 0.
        registry.insert("process_zombie_count", Arc::new(process::ZombieCount));
        registry.insert("cpu_iowait", Arc::new(cpu_time::CpuTimeShare::iowait()));
        registry.insert("cpu_steal", Arc::new(cpu_time::CpuTimeShare::steal()));
        registry.insert("disk_inode_utilization", Arc::new(inode::InodeUtilization));
        registry.insert("tcp_established_count", Arc::new(tcp::TcpEstablishedCount));
        let paging_rate = sampler::CounterRate::new(vmstat::swapped_pages);
        registry.insert("swap_paging_rate", Arc::new(paging_rate));
    }
    registry
}

#[cfg(all(test, any(target_os = "linux", windows)))]
mod tests {
    /// Every built-in collector produces finite values on this host.
    #[tokio::test]
    async fn all_collectors_read() {
        let mut failures = Vec::new();
        for (key, collector) in super::registry() {
            match collector.collect().await {
                Ok(samples) => {
                    for sample in samples {
                        let device = sample.device.as_deref().unwrap_or("host");
                        if sample.value.is_finite() {
                            println!("{key} [{device}] = {}", sample.value);
                        } else {
                            failures
                                .push(format!("{key} [{device}]: not finite ({})", sample.value));
                        }
                    }
                }
                Err(e) => failures.push(format!("{key}: {e:#}")),
            }
        }
        assert!(failures.is_empty(), "{failures:#?}");
    }
}
