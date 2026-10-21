//! Turns ever-growing counters into the change between two readings.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow};
use async_trait::async_trait;

use super::{DeviceCollector, Sample};

/// Gap between the two samples taken when there is no earlier one to compare to.
const FIRST_GAP: Duration = Duration::from_secs(1);

/// Remembers the previous sample, so each reading covers the whole time since
/// the last one (normally the report interval) instead of a short snapshot.
pub struct Sampler<T> {
    last: Mutex<Option<(Instant, T)>>,
}

impl<T: Clone + Send> Sampler<T> {
    pub fn new() -> Self {
        Self { last: Mutex::new(None) }
    }

    fn lock(&self) -> Result<MutexGuard<'_, Option<(Instant, T)>>> {
        // Poisoned means a previous holder panicked mid-update.
        self.last.lock().map_err(|_| anyhow!("sampler state is poisoned"))
    }

    /// The change since the previous sample (computed by `diff`) and the
    /// seconds it covers. `diff` returns `None` when a counter went backwards
    /// (reset or wrap); the baseline is then thrown away and sampled again.
    pub async fn change<D>(
        &self,
        read: impl Fn() -> Result<T> + Send + Sync,
        diff: impl Fn(&T, &T) -> Option<D> + Send + Sync,
    ) -> Result<(D, f64)> {
        let (before, now, secs) = self.pair(&read).await?;
        if let Some(change) = diff(&before, &now) {
            return Ok((change, secs));
        }

        self.lock()?.take();
        let (before, now, secs) = self.pair(&read).await?;
        let change = diff(&before, &now).context("counter went backwards twice in a row")?;
        Ok((change, secs))
    }

    /// Previous sample, current sample, and the seconds between them. With no
    /// previous sample (first call, or after a reset), samples twice.
    async fn pair(&self, read: &(impl Fn() -> Result<T> + Send + Sync)) -> Result<(T, T, f64)> {
        // Taken out, so a failed read below starts over from a fresh baseline.
        // Each guard is dropped at the end of its statement: a std Mutex must
        // not be held across `.await`.
        let previous = self.lock()?.take();
        let (then, before) = match previous {
            Some(previous) => previous,
            None => {
                let sample = read()?;
                let then = Instant::now();
                tokio::time::sleep(FIRST_GAP).await;
                (then, sample)
            }
        };

        let current = read()?;
        let now = Instant::now();
        *self.lock()? = Some((now, current.clone()));
        Ok((before, current, now.duration_since(then).as_secs_f64()))
    }
}

/// A single host-wide counter reported as a per-second rate. Only swap paging
/// (Linux) uses it; device counters go through `DeviceCounterRate`.
#[cfg(target_os = "linux")]
pub struct CounterRate {
    read: fn() -> Result<u64>,
    sampler: Sampler<u64>,
}

#[cfg(target_os = "linux")]
impl CounterRate {
    pub fn new(read: fn() -> Result<u64>) -> Self {
        Self { read, sampler: Sampler::new() }
    }
}

#[cfg(target_os = "linux")]
#[async_trait]
impl super::Collector for CounterRate {
    async fn collect(&self) -> Result<f64> {
        let (change, secs) = self
            .sampler
            .change(self.read, |before, now| now.checked_sub(*before))
            .await?;
        Ok(change as f64 / secs)
    }
}

/// One counter per device (disk, NIC), each reported as a per-second rate.
pub struct DeviceCounterRate {
    read: fn() -> Result<HashMap<String, u64>>,
    sampler: Sampler<HashMap<String, u64>>,
}

impl DeviceCounterRate {
    pub fn new(read: fn() -> Result<HashMap<String, u64>>) -> Self {
        Self { read, sampler: Sampler::new() }
    }
}

#[async_trait]
impl DeviceCollector for DeviceCounterRate {
    async fn collect(&self) -> Result<Vec<Sample>> {
        // Never `None`: one device's reset mustn't throw away every baseline.
        let (changes, secs) = self
            .sampler
            .change(self.read, |before, now| Some(device_changes(before, now)))
            .await?;
        Ok(changes
            .into_iter()
            .map(|(device, change)| Sample { device: Some(device), value: change as f64 / secs })
            .collect())
    }
}

/// Change per device present in both samples. A device that just appeared
/// has no baseline yet, and one whose counter went backwards (reset or wrap)
/// is left out; either way its current value is the baseline next time.
fn device_changes(before: &HashMap<String, u64>, now: &HashMap<String, u64>) -> Vec<(String, u64)> {
    now.iter()
        .filter_map(|(device, &value)| {
            // `?` inside a closure returning Option: skip this device on None.
            let change = value.checked_sub(*before.get(device)?)?;
            Some((device.clone(), change))
        })
        .collect()
}

/// Reads a Linux kernel file under /proc or /sys.
#[cfg(target_os = "linux")]
pub fn read_kernel_file(path: &str) -> Result<String> {
    std::fs::read_to_string(path).with_context(|| format!("reading {path} (Linux only)"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn counters(pairs: &[(&str, u64)]) -> HashMap<String, u64> {
        pairs.iter().map(|&(device, value)| (device.to_owned(), value)).collect()
    }

    #[test]
    fn device_changes_cover_only_devices_with_a_valid_baseline() {
        let before = counters(&[("eth0", 100), ("eth1", 500)]);
        let now = counters(&[("eth0", 160), ("eth1", 20), ("eth2", 7)]);

        let mut changes = device_changes(&before, &now);
        changes.sort();

        // eth1 was reset and eth2 is new: neither has a usable baseline.
        assert_eq!(changes, [("eth0".to_owned(), 60)]);
    }
}
