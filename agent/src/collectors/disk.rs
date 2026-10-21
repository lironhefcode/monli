use std::collections::HashSet;
use std::path::PathBuf;

use anyhow::{Result, bail};
use async_trait::async_trait;
use sysinfo::Disks;

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

/// Every real filesystem mounted on this host.
pub fn filesystems() -> Vec<Filesystem> {
    let disks = Disks::new_with_refreshed_list();
    real_filesystems(disks.iter().map(|disk| {
        let filesystem = Filesystem {
            mount_point: disk.mount_point().to_path_buf(),
            total: disk.total_space(),
            available: disk.available_space(),
        };
        (disk.file_system().to_string_lossy().into_owned(), filesystem)
    }))
}

/// Drops pseudo and empty filesystems, and repeat mounts of the same path
/// (the first one listed wins), from `(filesystem type, filesystem)` pairs.
fn real_filesystems(mounts: impl IntoIterator<Item = (String, Filesystem)>) -> Vec<Filesystem> {
    let mut seen = HashSet::new();
    mounts
        .into_iter()
        .filter(|(fs_type, filesystem)| {
            filesystem.total > 0
                && !PSEUDO_FILESYSTEMS.contains(&fs_type.as_str())
                && seen.insert(filesystem.mount_point.clone())
        })
        .map(|(_, filesystem)| filesystem)
        .collect()
}

/// Used space on each real filesystem, in %.
pub struct DiskUsedPct;

#[async_trait]
impl DeviceCollector for DiskUsedPct {
    async fn collect(&self) -> Result<Vec<Sample>> {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mount(fs_type: &str, mount_point: &str, total: u64) -> (String, Filesystem) {
        let filesystem =
            Filesystem { mount_point: PathBuf::from(mount_point), total, available: 0 };
        (fs_type.to_owned(), filesystem)
    }

    #[test]
    fn keeps_only_real_filesystems_once_each() {
        let mounts = vec![
            mount("ext4", "/", 100),
            mount("tmpfs", "/run", 100),
            mount("squashfs", "/snap/core/1", 100),
            mount("ext4", "/home", 200),
            mount("ext4", "/home", 300),
            mount("ext4", "/empty", 0),
        ];

        let kept = real_filesystems(mounts);

        let names: Vec<String> = kept.iter().map(Filesystem::device_name).collect();
        assert_eq!(names, ["/", "/home"]);
        assert_eq!(kept[1].total, 200);
    }
}
