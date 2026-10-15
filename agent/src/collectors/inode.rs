use anyhow::{Result, bail};
use async_trait::async_trait;

use super::Collector;

/// Inodes used on the root filesystem, in %. A disk can be "full" of small
/// files while space remains.
pub struct InodeUtilization;

#[async_trait]
impl Collector for InodeUtilization {
    #[cfg(unix)]
    async fn collect(&self) -> Result<f64> {
        // SAFETY: statvfs is a plain C struct; all-zero is a valid value.
        let mut stats: libc::statvfs = unsafe { std::mem::zeroed() };
        // SAFETY: the path is a NUL-terminated literal and `stats` is a valid
        // out-pointer that statvfs fills in.
        if unsafe { libc::statvfs(c"/".as_ptr(), &mut stats) } != 0 {
            bail!("statvfs(/) failed: {}", std::io::Error::last_os_error());
        }

        let total = stats.f_files as u64;
        if total == 0 {
            bail!("root filesystem has no fixed inode limit");
        }
        let used = total.saturating_sub(stats.f_ffree as u64);
        Ok(used as f64 / total as f64 * 100.0)
    }

    #[cfg(not(unix))]
    async fn collect(&self) -> Result<f64> {
        bail!("inode utilization is only collected on Linux");
    }
}
