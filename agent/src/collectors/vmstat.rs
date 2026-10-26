//! Pages moved between memory and swap, from /proc/vmstat. Unlike swap
//! utilization, this shows the host actively swapping right now.

use anyhow::{Context, Result};

use super::sampler::read_kernel_file;

fn counter(vmstat: &str, name: &str) -> Result<u64> {
    let line = vmstat
        .lines()
        .find(|line| line.split_whitespace().next() == Some(name))
        .with_context(|| format!("{name} missing from /proc/vmstat"))?;
    let value = line
        .split_whitespace()
        .nth(1)
        .context("empty /proc/vmstat line")?;
    Ok(value.parse()?)
}

/// Pages swapped in plus pages swapped out.
pub fn swapped_pages() -> Result<u64> {
    let vmstat = read_kernel_file("/proc/vmstat")?;
    Ok(counter(&vmstat, "pswpin")? + counter(&vmstat, "pswpout")?)
}
