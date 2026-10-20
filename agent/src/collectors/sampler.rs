//! Turns ever-growing counters into the change between two readings.

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow};
use async_trait::async_trait;

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

/// A single counter reported as a per-second rate (bytes/s, errors/s, ...).
pub struct CounterRate {
    read: fn() -> Result<u64>,
    sampler: Sampler<u64>,
}

impl CounterRate {
    pub fn new(read: fn() -> Result<u64>) -> Self {
        Self { read, sampler: Sampler::new() }
    }
}

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

/// Reads a Linux kernel file under /proc or /sys.
#[cfg(target_os = "linux")]
pub fn read_kernel_file(path: &str) -> Result<String> {
    std::fs::read_to_string(path).with_context(|| format!("reading {path} (Linux only)"))
}
