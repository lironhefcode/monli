//! Bytes read and written per disk, as ever-growing counters by disk name.
//!
//! Linux: per physical disk (`sda`, `nvme0n1`) from /sys/block, which lists
//! whole disks only (no partitions); those without a `device` link are virtual
//! (loop, ram, LVM/dm) and would count the same bytes twice.
//!
//! Windows: per volume (`C:\`), from the counters Windows keeps for each one.

use std::collections::HashMap;

use anyhow::Result;

/// Fields of /sys/block/<disk>/stat are counted in 512-byte sectors.
#[cfg(target_os = "linux")]
const SECTOR_BYTES: u64 = 512;

/// Total bytes read from each disk since boot.
pub fn read_bytes() -> Result<HashMap<String, u64>> {
    #[cfg(target_os = "linux")]
    return bytes_per_disk(2);
    #[cfg(windows)]
    return bytes_per_volume(|usage| usage.total_read_bytes);
}

/// Total bytes written to each disk since boot.
pub fn written_bytes() -> Result<HashMap<String, u64>> {
    #[cfg(target_os = "linux")]
    return bytes_per_disk(6);
    #[cfg(windows)]
    return bytes_per_volume(|usage| usage.total_written_bytes);
}

/// Field `field` of each physical disk's stat line, in bytes, by disk name.
#[cfg(target_os = "linux")]
fn bytes_per_disk(field: usize) -> Result<HashMap<String, u64>> {
    use anyhow::Context;

    use super::sampler::read_kernel_file;

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

/// The counter `pick` chooses for each volume, by mount point. A volume whose
/// counters can't be read (sysinfo then leaves both at 0) is left out, rather
/// than reported as idle forever.
#[cfg(windows)]
fn bytes_per_volume(pick: fn(&sysinfo::DiskUsage) -> u64) -> Result<HashMap<String, u64>> {
    use sysinfo::{DiskRefreshKind, Disks};

    let refresh = DiskRefreshKind::nothing().with_io_usage();
    let disks = Disks::new_with_refreshed_list_specifics(refresh);
    let bytes: HashMap<String, u64> = disks
        .iter()
        .filter_map(|disk| {
            let usage = disk.usage();
            let readable = usage.total_read_bytes > 0 || usage.total_written_bytes > 0;
            readable.then(|| (disk.mount_point().display().to_string(), pick(&usage)))
        })
        .collect();
    if bytes.is_empty() {
        anyhow::bail!("no volume reported I/O counters");
    }
    Ok(bytes)
}
