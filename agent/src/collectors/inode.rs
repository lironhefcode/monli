use std::ffi::CString;
use std::os::unix::ffi::OsStrExt;
use std::path::Path;

use anyhow::{Result, bail};
use async_trait::async_trait;
use tracing::debug;

use super::disk::filesystems;
use super::{DeviceCollector, Sample};

/// Inodes used on each real filesystem, in %. A disk can be "full" of small
/// files while space remains.
pub struct InodeUtilization;

#[async_trait]
impl DeviceCollector for InodeUtilization {
    async fn collect(&self) -> Result<Vec<Sample>> {
        let samples: Vec<Sample> = filesystems()
            .iter()
            .filter_map(|filesystem| match used_pct(&filesystem.mount_point) {
                Ok(Some(value)) => Some(Sample { device: Some(filesystem.device_name()), value }),
                // No fixed inode limit (e.g. btrfs): nothing to measure.
                Ok(None) => None,
                Err(e) => {
                    debug!(mount = %filesystem.mount_point.display(), error = %e, "skipping mount");
                    None
                }
            })
            .collect();
        if samples.is_empty() {
            bail!("no mounted filesystem has a fixed inode limit");
        }
        Ok(samples)
    }
}

/// Inodes used at `mount_point` in %, or `None` if it has no fixed limit.
fn used_pct(mount_point: &Path) -> Result<Option<f64>> {
    // C needs a NUL-terminated copy of the path.
    let path = CString::new(mount_point.as_os_str().as_bytes())?;
    // SAFETY: statvfs is a plain C struct; all-zero is a valid value.
    let mut stats: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: `path` is NUL-terminated and outlives the call, and `stats` is a
    // valid out-pointer that statvfs fills in.
    if unsafe { libc::statvfs(path.as_ptr(), &mut stats) } != 0 {
        bail!("statvfs failed: {}", std::io::Error::last_os_error());
    }

    let total = stats.f_files as u64;
    if total == 0 {
        return Ok(None);
    }
    let used = total.saturating_sub(stats.f_ffree as u64);
    Ok(Some(used as f64 / total as f64 * 100.0))
}
