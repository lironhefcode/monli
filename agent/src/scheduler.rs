//! Runs collectors on their intervals and ships readings to the server.
//!
//! One loop ticks every `TICK`. On each tick it:
//! 1. starts every due metric whose previous run has finished (skip while running);
//! 2. starts a send of pending readings, unless a send is still in flight;
//! 3. every `REFRESH`, re-fetches the metric list from the server.
//!
//! Only the latest unsent reading per metric is kept, so an outage costs
//! history but never grows memory.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use anyhow::Result;
use tokio::task::JoinHandle;
use tokio::time::MissedTickBehavior;
use tracing::{debug, info, warn};

use crate::api_client::{ApiClient, ApiError, MetricSpec, Reading};
use crate::collectors::{Collector, Registry};

const TICK: Duration = Duration::from_secs(5);
const REFRESH: Duration = Duration::from_secs(60);

/// Latest unsent reading per `metric_key`, shared with collector and send tasks.
type Pending = Arc<Mutex<HashMap<String, Reading>>>;

struct MetricState {
    interval: Duration,
    collector: Arc<dyn Collector>,
    last_run: Option<Instant>,
    running: Option<JoinHandle<()>>,
}

pub struct Scheduler {
    client: Arc<ApiClient>,
    target_id: i64,
    api_key: Arc<str>,
    registry: Registry,
    metrics: HashMap<String, MetricState>,
    pending: Pending,
    sending: Option<JoinHandle<()>>,
    refreshing: Option<JoinHandle<Result<Vec<MetricSpec>, ApiError>>>,
    last_refresh: Instant,
}

impl Scheduler {
    pub fn new(
        client: ApiClient,
        target_id: i64,
        api_key: &str,
        registry: Registry,
        initial: Vec<MetricSpec>,
    ) -> Self {
        let mut scheduler = Self {
            client: Arc::new(client),
            target_id,
            api_key: Arc::from(api_key),
            registry,
            metrics: HashMap::new(),
            pending: Arc::new(Mutex::new(HashMap::new())),
            sending: None,
            refreshing: None,
            last_refresh: Instant::now(),
        };
        scheduler.apply_metric_list(initial);
        scheduler
    }

    /// Runs until Ctrl-C.
    pub async fn run(mut self) -> Result<()> {
        let mut tick = tokio::time::interval(TICK);
        // If a tick is late (e.g. the machine slept), don't fire a burst to catch up.
        tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

        loop {
            // Use the tick's scheduled time, not the wake-up time: wake-ups
            // jitter by a few ms, which would make a 10s metric look 9.997s
            // old and slip a whole tick.
            let now = tokio::select! {
                scheduled = tick.tick() => scheduled.into_std(),
                _ = tokio::signal::ctrl_c() => {
                    info!("shutting down");
                    return Ok(());
                }
            };

            self.start_due_collectors(now);
            self.start_send();
            self.refresh_metric_list(now).await;
        }
    }

    fn start_due_collectors(&mut self, now: Instant) {
        for (key, metric) in &mut self.metrics {
            if !is_idle(&metric.running) {
                continue; // previous run still going: skip this turn
            }
            let due = metric
                .last_run
                .is_none_or(|last| now.duration_since(last) >= metric.interval);
            if !due {
                continue;
            }

            metric.last_run = Some(now);
            let collector = Arc::clone(&metric.collector);
            let pending = Arc::clone(&self.pending);
            let key = key.clone();
            metric.running = Some(tokio::spawn(async move {
                match collector.collect().await {
                    Ok(value) => {
                        debug!(metric_key = %key, value, "collected");
                        let reading = Reading {
                            metric_key: key.clone(),
                            value,
                            recorded_at: humantime::format_rfc3339_millis(SystemTime::now())
                                .to_string(),
                        };
                        // Replaces any older unsent reading for this metric.
                        lock(&pending).insert(key, reading);
                    }
                    Err(e) => {
                        warn!(metric_key = %key, error = %format!("{e:#}"), "collection failed; nothing sent");
                    }
                }
            }));
        }
    }

    fn start_send(&mut self) {
        if !is_idle(&self.sending) {
            return;
        }
        // Take everything pending; anything that fails to send is put back.
        let batch: Vec<Reading> = std::mem::take(&mut *lock(&self.pending))
            .into_values()
            .collect();
        if batch.is_empty() {
            return;
        }

        let client = Arc::clone(&self.client);
        let api_key = Arc::clone(&self.api_key);
        let pending = Arc::clone(&self.pending);
        let target_id = self.target_id;
        self.sending = Some(tokio::spawn(async move {
            send_batch(&client, target_id, &api_key, batch, &pending).await;
        }));
    }

    async fn refresh_metric_list(&mut self, now: Instant) {
        // A finished refresh: apply its result.
        if self.refreshing.as_ref().is_some_and(|h| h.is_finished()) {
            let handle = self.refreshing.take().expect("checked is_some above");
            match handle.await {
                Ok(Ok(list)) => self.apply_metric_list(list),
                Ok(Err(e)) => warn!(error = %e, "refreshing metric list failed; keeping current list"),
                Err(e) => warn!(error = %e, "metric list refresh task panicked"),
            }
        }

        if self.refreshing.is_none() && now.duration_since(self.last_refresh) >= REFRESH {
            self.last_refresh = now;
            let client = Arc::clone(&self.client);
            let api_key = Arc::clone(&self.api_key);
            let target_id = self.target_id;
            self.refreshing = Some(tokio::spawn(async move {
                client.get_metrics(target_id, &api_key).await
            }));
        }
    }

    /// Adds new metrics, drops removed ones, and updates intervals while
    /// keeping `last_run`, so a refresh doesn't make everything fire at once.
    fn apply_metric_list(&mut self, list: Vec<MetricSpec>) {
        let wanted: HashSet<&str> = list.iter().map(|m| m.metric_key.as_str()).collect();
        self.metrics.retain(|key, _| {
            let keep = wanted.contains(key.as_str());
            if !keep {
                info!(metric_key = %key, "metric no longer assigned; stopped");
            }
            keep
        });

        for spec in list {
            let interval = Duration::from_secs(spec.report_interval_sec.max(1));
            if let Some(metric) = self.metrics.get_mut(&spec.metric_key) {
                metric.interval = interval;
                continue;
            }
            match self.registry.get(spec.metric_key.as_str()) {
                Some(collector) => {
                    info!(metric_key = %spec.metric_key, interval_sec = interval.as_secs(), "metric scheduled");
                    self.metrics.insert(
                        spec.metric_key,
                        MetricState {
                            interval,
                            collector: Arc::clone(collector),
                            last_run: None,
                            running: None,
                        },
                    );
                }
                None => warn!(metric_key = %spec.metric_key, "no collector for this metric; skipping"),
            }
        }
    }
}

/// Sends each reading. Retryable failures put the reading back (unless a
/// newer one arrived meanwhile); 4xx drops it, since the server rejects it.
async fn send_batch(
    client: &ApiClient,
    target_id: i64,
    api_key: &str,
    batch: Vec<Reading>,
    pending: &Pending,
) {
    let mut readings = batch.into_iter();
    while let Some(reading) = readings.next() {
        match client.submit_reading(target_id, api_key, &reading).await {
            Ok(()) => debug!(metric_key = %reading.metric_key, "reading sent"),
            Err(e) if e.is_retryable() => {
                warn!(error = %e, "sending readings failed; will retry next tick");
                // Server unreachable: don't try the rest of the batch now.
                let mut pending = lock(pending);
                for r in std::iter::once(reading).chain(readings) {
                    pending.entry(r.metric_key.clone()).or_insert(r);
                }
                return;
            }
            Err(e) => warn!(metric_key = %reading.metric_key, error = %e, "server rejected reading; dropped"),
        }
    }
}

fn is_idle<T>(handle: &Option<JoinHandle<T>>) -> bool {
    handle.as_ref().is_none_or(|h| h.is_finished())
}

fn lock(pending: &Pending) -> std::sync::MutexGuard<'_, HashMap<String, Reading>> {
    // The map stays valid even if a holder panicked, so recover it.
    pending.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}
