use std::path::Path;

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use sysinfo::Disks;

use super::Collector;

#[cfg(windows)]
const ROOT: &str = "C:\\";
#[cfg(not(windows))]
const ROOT: &str = "/";

/// Used space on the root filesystem (`/`, or `C:\` on Windows).
pub struct DiskUsedPct;

#[async_trait]
impl Collector for DiskUsedPct {
    async fn collect(&self) -> Result<f64> {
        let disks = Disks::new_with_refreshed_list();
        let root = disks
            .iter()
            .find(|disk| disk.mount_point() == Path::new(ROOT))
            .with_context(|| format!("no disk mounted at {ROOT}"))?;

        let total = root.total_space();
        if total == 0 {
            bail!("disk at {ROOT} reports 0 total space");
        }
        let used = total.saturating_sub(root.available_space());
        Ok(used as f64 / total as f64 * 100.0)
    }
}
