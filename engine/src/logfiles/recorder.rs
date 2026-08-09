use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use log::{error, info, warn};
use serde::Serialize;
use serde_json::json;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::broadcast::error::RecvError;
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

use crate::config;
use crate::logfiles::ensure_dir;
use crate::sampler::{StatsSender, StatsSnapshot};

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct SeriesPoint<T> {
    time_stamp: String,
    value: T,
}

/// Averages the per-core readings of one tick.
///
/// Returns 0 for an empty reading rather than a NaN, which would serialize to
/// `null` and break the chart.
fn mean_cpu(per_core: &[f32]) -> f64 {
    if per_core.is_empty() {
        return 0.0;
    }
    let sum: f64 = per_core.iter().map(|usage| *usage as f64).sum();
    sum / per_core.len() as f64
}

/// Collects the ticks that make up a single recorded sample.
///
/// The sampler emits one frame per second while the recorder stores a point
/// every five, so network counters are summed across the window to keep the
/// recorded value a five-second delta.
#[derive(Default)]
struct Accumulator {
    cpu_total: f64,
    ticks: u32,
    network_down: u64,
    network_up: u64,
    ram_used: u64,
}

impl Accumulator {
    fn push(&mut self, snapshot: &StatsSnapshot) {
        self.cpu_total += mean_cpu(&snapshot.stats.cpu_usage);
        self.ticks += 1;
        self.network_down += snapshot.stats.network_received;
        self.network_up += snapshot.stats.network_transmitted;
        self.ram_used = snapshot.stats.ram_used;
    }

    fn is_empty(&self) -> bool {
        self.ticks == 0
    }

    fn cpu(&self) -> f64 {
        if self.ticks == 0 {
            return 0.0;
        }
        self.cpu_total / self.ticks as f64
    }

    fn reset(&mut self) {
        *self = Self::default();
    }
}

/// Guards against more than one recording running at a time. Starting a second
/// one used to double the sampling work and write two competing files.
pub struct Recorder {
    running: AtomicBool,
}

impl Recorder {
    pub fn new() -> Self {
        Self {
            running: AtomicBool::new(false),
        }
    }

    /// Starts a recording unless one is already in progress.
    pub fn try_start(
        self: &Arc<Self>,
        duration_in_hours: u64,
        stats: StatsSender,
        tracker: &TaskTracker,
        shutdown: CancellationToken,
    ) {
        if duration_in_hours == 0 {
            warn!("Ignoring a log request with a zero-hour duration");
            return;
        }

        if self
            .running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            warn!("A recording is already running, ignoring the new request");
            return;
        }

        let recorder = Arc::clone(self);
        tracker.spawn(async move {
            run(duration_in_hours, stats, shutdown).await;
            recorder.running.store(false, Ordering::Release);
        });
    }
}

async fn run(duration_in_hours: u64, stats: StatsSender, shutdown: CancellationToken) {
    if let Err(e) = ensure_dir(config::LOG_DIR) {
        error!(
            "Could not prepare the log directory {}: {}",
            config::LOG_DIR,
            e
        );
        return;
    }

    let start_time = chrono::Utc::now();
    let stamp = start_time.format("%Y-%m-%d_%H-%M-%S");
    let cnr_path = format!("{}cnr_log_{}.json", config::LOG_DIR, stamp);
    let net_path = format!("{}net_log_{}.json", config::LOG_DIR, stamp);

    info!("Starting log recording for {} hour(s)", duration_in_hours);

    let mut cpu_points: Vec<SeriesPoint<f64>> = Vec::new();
    let mut ram_points: Vec<SeriesPoint<u64>> = Vec::new();
    let mut down_points: Vec<SeriesPoint<u64>> = Vec::new();
    let mut up_points: Vec<SeriesPoint<u64>> = Vec::new();

    let mut accumulator = Accumulator::default();
    let mut receiver = stats.subscribe();

    let ticks_per_sample = config::log_sample_every_n_ticks();
    let mut ticks_until_sample = ticks_per_sample;
    let mut last_flush = Instant::now();

    let started = Instant::now();
    let duration = Duration::from_secs(duration_in_hours * 3600);

    while started.elapsed() < duration {
        let snapshot = tokio::select! {
            _ = shutdown.cancelled() => {
                info!("Shutdown requested, flushing the recording early");
                break;
            }
            received = receiver.recv() => received,
        };

        match snapshot {
            Ok(snapshot) => accumulator.push(&snapshot),
            Err(RecvError::Lagged(skipped)) => {
                warn!("Recorder fell behind and lost {} stats frame(s)", skipped);
                continue;
            }
            Err(RecvError::Closed) => {
                warn!("Stats stream closed, ending the recording");
                break;
            }
        }

        ticks_until_sample = ticks_until_sample.saturating_sub(1);
        if ticks_until_sample > 0 {
            continue;
        }
        ticks_until_sample = ticks_per_sample;

        let time_stamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
        cpu_points.push(SeriesPoint {
            time_stamp: time_stamp.clone(),
            value: accumulator.cpu(),
        });
        ram_points.push(SeriesPoint {
            time_stamp: time_stamp.clone(),
            value: accumulator.ram_used,
        });
        down_points.push(SeriesPoint {
            time_stamp: time_stamp.clone(),
            value: accumulator.network_down,
        });
        up_points.push(SeriesPoint {
            time_stamp,
            value: accumulator.network_up,
        });
        accumulator.reset();

        if last_flush.elapsed() >= config::LOG_FLUSH_INTERVAL {
            write_batch(
                &cnr_path,
                &net_path,
                &cpu_points,
                &ram_points,
                &down_points,
                &up_points,
            )
            .await;
            last_flush = Instant::now();
        }
    }

    if !accumulator.is_empty() {
        let time_stamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
        cpu_points.push(SeriesPoint {
            time_stamp: time_stamp.clone(),
            value: accumulator.cpu(),
        });
        ram_points.push(SeriesPoint {
            time_stamp: time_stamp.clone(),
            value: accumulator.ram_used,
        });
        down_points.push(SeriesPoint {
            time_stamp: time_stamp.clone(),
            value: accumulator.network_down,
        });
        up_points.push(SeriesPoint {
            time_stamp,
            value: accumulator.network_up,
        });
    }

    write_batch(
        &cnr_path,
        &net_path,
        &cpu_points,
        &ram_points,
        &down_points,
        &up_points,
    )
    .await;

    info!(
        "Finished logging. {} sample(s) written to {}",
        cpu_points.len(),
        cnr_path
    );
}

/// Rewrites both log files from the points held in memory.
///
/// The previous implementation re-read, cloned and re-sorted the whole file on
/// every flush, which grew quadratically over a long recording.
async fn write_batch(
    cnr_path: &str,
    net_path: &str,
    cpu: &[SeriesPoint<f64>],
    ram: &[SeriesPoint<u64>],
    down: &[SeriesPoint<u64>],
    up: &[SeriesPoint<u64>],
) {
    let cnr = json!({ "cpu": cpu, "ram": ram });
    let net = json!({ "network": { "down": down, "up": up } });

    write_json(cnr_path, &cnr).await;
    write_json(net_path, &net).await;
}

async fn write_json(path: &str, value: &serde_json::Value) {
    let body = match serde_json::to_string_pretty(value) {
        Ok(body) => body,
        Err(e) => {
            error!("Failed to serialize log file {}: {}", path, e);
            return;
        }
    };

    let mut file = match File::create(path).await {
        Ok(file) => file,
        Err(e) => {
            error!("Failed to create log file {}: {}", path, e);
            return;
        }
    };

    if let Err(e) = file.write_all(body.as_bytes()).await {
        error!("Failed to write log file {}: {}", path, e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mean_cpu_averages_cores() {
        assert_eq!(mean_cpu(&[0.0, 50.0, 100.0, 50.0]), 50.0);
    }

    #[test]
    fn mean_cpu_of_no_cores_is_zero_not_nan() {
        assert_eq!(mean_cpu(&[]), 0.0);
    }

    #[test]
    fn accumulator_sums_network_across_the_window() {
        let mut accumulator = Accumulator::default();
        for _ in 0..5 {
            accumulator.network_down += 10;
            accumulator.network_up += 4;
            accumulator.ticks += 1;
        }
        assert_eq!(accumulator.network_down, 50);
        assert_eq!(accumulator.network_up, 20);
    }

    #[test]
    fn accumulator_averages_cpu_across_the_window() {
        let accumulator = Accumulator {
            cpu_total: 40.0,
            ticks: 4,
            ..Default::default()
        };
        assert_eq!(accumulator.cpu(), 10.0);
    }

    #[test]
    fn accumulator_cpu_without_ticks_is_zero() {
        let accumulator = Accumulator::default();
        assert_eq!(accumulator.cpu(), 0.0);
        assert!(accumulator.is_empty());
    }

    #[test]
    fn accumulator_resets_between_samples() {
        let mut accumulator = Accumulator {
            cpu_total: 10.0,
            ticks: 2,
            network_down: 7,
            ..Default::default()
        };
        accumulator.reset();
        assert!(accumulator.is_empty());
        assert_eq!(accumulator.network_down, 0);
    }
}
