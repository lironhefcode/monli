use anyhow::{Context, Result, bail};
use async_trait::async_trait;

use super::Collector;
use super::sampler::{Sampler, read_kernel_file};

/// Cumulative CPU time counters from the first line of /proc/stat.
#[derive(Clone, Copy)]
pub struct CpuTimes {
    total: u64,
    iowait: u64,
    steal: u64,
}

fn read_cpu_times() -> Result<CpuTimes> {
    let stat = read_kernel_file("/proc/stat")?;
    let line = stat.lines().next().context("/proc/stat is empty")?;
    // cpu  user nice system idle iowait irq softirq steal guest guest_nice
    // Guest time is already included in user, so it is left out of the total.
    let fields: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .take(8)
        .map(str::parse)
        .collect::<Result<_, _>>()
        .context("parsing /proc/stat")?;
    if fields.len() < 8 {
        bail!("/proc/stat cpu line has fewer than 8 fields");
    }
    Ok(CpuTimes { total: fields.iter().sum(), iowait: fields[4], steal: fields[7] })
}

/// Share of CPU time spent in one state since the previous reading, in %.
pub struct CpuTimeShare {
    state: fn(&CpuTimes) -> u64,
    sampler: Sampler<CpuTimes>,
}

impl CpuTimeShare {
    /// Idle while waiting for disk or network I/O.
    pub fn iowait() -> Self {
        Self { state: |times| times.iowait, sampler: Sampler::new() }
    }

    /// Taken by the hypervisor for other VMs.
    pub fn steal() -> Self {
        Self { state: |times| times.steal, sampler: Sampler::new() }
    }
}

#[async_trait]
impl Collector for CpuTimeShare {
    async fn collect(&self) -> Result<f64> {
        let state = self.state;
        let ((spent, total), _) = self
            .sampler
            .change(read_cpu_times, |before, now| {
                Some((state(now).checked_sub(state(before))?, now.total.checked_sub(before.total)?))
            })
            .await?;
        if total == 0 {
            return Ok(0.0);
        }
        Ok(spent as f64 / total as f64 * 100.0)
    }
}
