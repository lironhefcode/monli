//! Bytes read and written, summed over whole physical disks. /sys/block lists
//! whole disks only (no partitions); those without a `device` link are virtual
//! (loop, ram, LVM/dm) and would count the same bytes twice.

use anyhow::{Context, Result};

use super::sampler::read_kernel_file;

/// Fields of /sys/block/<disk>/stat are counted in 512-byte sectors.
const SECTOR_BYTES: u64 = 512;

fn total_sectors(field: usize) -> Result<u64> {
    let entries = std::fs::read_dir("/sys/block").context("listing /sys/block (Linux only)")?;
    let mut sum = 0;
    for entry in entries {
        let disk = entry?.path();
        if !disk.join("device").exists() {
            continue;
        }
        let stat = read_kernel_file(&disk.join("stat").to_string_lossy())?;
        let value = stat
            .split_whitespace()
            .nth(field)
            .with_context(|| format!("short stat line for {}", disk.display()))?;
        sum += value.parse::<u64>()?;
    }
    Ok(sum)
}

pub fn read_bytes() -> Result<u64> {
    Ok(total_sectors(2)? * SECTOR_BYTES)
}

pub fn written_bytes() -> Result<u64> {
    Ok(total_sectors(6)? * SECTOR_BYTES)
}
