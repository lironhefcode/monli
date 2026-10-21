//! Bytes read and written per physical disk. /sys/block lists whole disks
//! only (no partitions); those without a `device` link are virtual (loop,
//! ram, LVM/dm) and would count the same bytes twice.

use std::collections::HashMap;

use anyhow::{Context, Result};

use super::sampler::read_kernel_file;

/// Fields of /sys/block/<disk>/stat are counted in 512-byte sectors.
const SECTOR_BYTES: u64 = 512;

/// Field `field` of each physical disk's stat line, in bytes, by disk name.
fn bytes_per_disk(field: usize) -> Result<HashMap<String, u64>> {
    let entries = std::fs::read_dir("/sys/block").context("listing /sys/block (Linux only)")?;
    let mut bytes = HashMap::new();
    for entry in entries {
        let entry = entry?;
        let disk = entry.path();
        if !disk.join("device").exists() {
            continue;
        }
        let stat = read_kernel_file(&disk.join("stat").to_string_lossy())?;
        let sectors = stat
            .split_whitespace()
            .nth(field)
            .with_context(|| format!("short stat line for {}", disk.display()))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        bytes.insert(name, sectors.parse::<u64>()? * SECTOR_BYTES);
    }
    Ok(bytes)
}

pub fn read_bytes() -> Result<HashMap<String, u64>> {
    bytes_per_disk(2)
}

pub fn written_bytes() -> Result<HashMap<String, u64>> {
    bytes_per_disk(6)
}
