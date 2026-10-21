use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::path::PathBuf;

use anyhow::{Result, bail};
use async_trait::async_trait;
use sysinfo::{Disk, Disks};

use super::{DeviceCollector, Sample};

/// Filesystem types that hold no data of their own: memory-backed, container
/// layers, and read-only snap images (always 100% full).
const PSEUDO_FILESYSTEMS: [&str; 5] = ["tmpfs", "devtmpfs", "ramfs", "overlay", "squashfs"];

/// A mounted filesystem that stores real data.
#[derive(Debug, Clone, PartialEq)]
pub struct Filesystem {
    pub mount_point: PathBuf,
    pub total: u64,
    pub available: u64,
}

impl Filesystem {
    /// The interface name the server sees: the mount point (`/home`, `C:\`).
    pub fn device_name(&self) -> String {
        self.mount_point.display().to_string()
    }
}

/// One entry of the mount table, before filtering.
struct Mount {
    fs_type: String,
    /// What is mounted; mounts with the same source show the same filesystem.
    source: String,
    filesystem: Filesystem,
}

/// Every real filesystem mounted on this host, each once.
///
/// Blocks on every mount (indefinitely on a hung network mount), so callers
/// run it on a blocking thread.
pub fn filesystems() -> Vec<Filesystem> {
    let disks = Disks::new_with_refreshed_list();
    real_filesystems(disks.iter().map(|disk| Mount {
        fs_type: disk.file_system().to_string_lossy().into_owned(),
        source: source(disk),
        filesystem: Filesystem {
            mount_point: disk.mount_point().to_path_buf(),
            total: disk.total_space(),
            available: disk.available_space(),
        },
    }))
}

/// On Unix, the device or export behind the mount (`/dev/sda1`,
/// `server:/export`), which bind mounts of it share. On Windows `name()` is
/// only the volume label, so the drive itself identifies it.
fn source(disk: &Disk) -> String {
    let source = if cfg!(unix) { disk.name() } else { disk.mount_point().as_os_str() };
    source.to_string_lossy().into_owned()
}

/// Drops pseudo and empty filesystems, then keeps one mount per source: the
/// shallowest path (`/` over a bind mount like `/var/lib/docker/...`), the
/// first listed on a tie. Sorted by mount point, each mount point once.
fn real_filesystems(mounts: impl IntoIterator<Item = Mount>) -> Vec<Filesystem> {
    let depth = |filesystem: &Filesystem| filesystem.mount_point.components().count();
    let mut by_source: HashMap<String, Filesystem> = HashMap::new();
    for mount in mounts {
        if mount.filesystem.total == 0 || PSEUDO_FILESYSTEMS.contains(&mount.fs_type.as_str()) {
            continue;
        }
        // `entry` looks the key up once, for both the insert and the compare.
        match by_source.entry(mount.source) {
            Entry::Vacant(slot) => {
                slot.insert(mount.filesystem);
            }
            Entry::Occupied(mut slot) => {
                if depth(&mount.filesystem) < depth(slot.get()) {
                    slot.insert(mount.filesystem);
                }
            }
        }
    }

    let mut kept: Vec<Filesystem> = by_source.into_values().collect();
    kept.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
    // Two sources stacked on one path: only the top one is visible there.
    kept.dedup_by(|a, b| a.mount_point == b.mount_point);
    kept
}

/// Used space on each real filesystem, in %.
pub struct DiskUsedPct;

#[async_trait]
impl DeviceCollector for DiskUsedPct {
    async fn collect(&self) -> Result<Vec<Sample>> {
        // Runs the blocking mount scan on tokio's thread pool for blocking
        // work, so it can't stall the async workers. The first `?` is a
        // panic in the closure, the second its own error.
        tokio::task::spawn_blocking(used_pct_samples).await?
    }
}

fn used_pct_samples() -> Result<Vec<Sample>> {
    let samples: Vec<Sample> = filesystems()
        .iter()
        .map(|filesystem| {
            let used = filesystem.total.saturating_sub(filesystem.available);
            Sample {
                device: Some(filesystem.device_name()),
                value: used as f64 / filesystem.total as f64 * 100.0,
            }
        })
        .collect();
    if samples.is_empty() {
        bail!("no real filesystem mounted");
    }
    Ok(samples)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mount(fs_type: &str, source: &str, mount_point: &str, total: u64) -> Mount {
        Mount {
            fs_type: fs_type.to_owned(),
            source: source.to_owned(),
            filesystem: Filesystem { mount_point: PathBuf::from(mount_point), total, available: 0 },
        }
    }

    #[test]
    fn keeps_only_real_filesystems_once_each() {
        let mounts = vec![
            mount("ext4", "/dev/sda1", "/var/lib/docker/volumes/data", 100),
            mount("ext4", "/dev/sda1", "/", 100),
            mount("tmpfs", "tmpfs", "/run", 100),
            mount("squashfs", "/dev/loop0", "/snap/core/1", 100),
            mount("ext4", "/dev/sdb1", "/home", 200),
            mount("ext4", "/dev/sdc1", "/home", 300),
            mount("ext4", "/dev/sdd1", "/empty", 0),
        ];

        let kept = real_filesystems(mounts);

        let names: Vec<String> = kept.iter().map(Filesystem::device_name).collect();
        assert_eq!(names, ["/", "/home"]);
    }
}
