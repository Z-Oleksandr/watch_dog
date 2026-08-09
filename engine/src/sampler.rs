use std::sync::Arc;

use log::{debug, error, info};
use tokio::sync::broadcast;
use tokio::time::{interval, MissedTickBehavior};
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

use crate::config;
use crate::system_stats::{self, SystemStats};
use crate::temperatures::read_temperatures;
use crate::topology::{HardwareHandles, Topology};

/// One tick of readings: the wire payload every connection forwards verbatim,
/// alongside the typed values the recorder aggregates.
pub struct StatsSnapshot {
    pub json: Arc<str>,
    pub stats: SystemStats,
}

pub type StatsSender = broadcast::Sender<Arc<StatsSnapshot>>;
pub type StatsReceiver = broadcast::Receiver<Arc<StatsSnapshot>>;

/// Starts the single sampling task that feeds every consumer.
///
/// Sampling used to run per connection, so cost scaled with the number of open
/// browsers. One task now samples once per tick, serializes once, and hands the
/// same `Arc` to every subscriber.
pub fn spawn(
    topology: Arc<Topology>,
    handles: HardwareHandles,
    tracker: &TaskTracker,
    shutdown: CancellationToken,
) -> StatsSender {
    let (tx, _rx) = broadcast::channel::<Arc<StatsSnapshot>>(config::BROADCAST_CAPACITY);
    let sender = tx.clone();

    tracker.spawn(async move {
        run(topology, handles, tx, shutdown).await;
    });

    sender
}

async fn run(
    topology: Arc<Topology>,
    handles: HardwareHandles,
    tx: StatsSender,
    shutdown: CancellationToken,
) {
    let mut ticker = interval(config::STATS_INTERVAL);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

    let temp_every = config::temp_every_n_ticks();
    let mut handles = Some(handles);
    let mut cached_temperatures: Vec<f32> = Vec::new();
    let mut ticks_until_temps: u32 = 0;

    info!(
        "Stats sampler started at {:?} interval",
        config::STATS_INTERVAL
    );

    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                info!("Stats sampler stopping");
                return;
            }
            _ = ticker.tick() => {}
        }

        // With nobody listening there is nothing to compute. This keeps an idle
        // engine at zero cost, which is how it behaved before the refactor.
        if tx.receiver_count() == 0 {
            continue;
        }

        let taken = match handles.take() {
            Some(handles) => handles,
            None => {
                error!("Sampler lost its hardware handles, stopping engine");
                shutdown.cancel();
                return;
            }
        };

        let read_temps = ticks_until_temps == 0;
        ticks_until_temps = if read_temps {
            temp_every.saturating_sub(1)
        } else {
            ticks_until_temps - 1
        };

        let topology_ref = Arc::clone(&topology);
        let previous_temperatures = cached_temperatures.clone();

        // sysinfo reads procfs and sysfs synchronously. Reading an NVMe
        // temperature alone blocks for ~12 ms, so this never runs on a runtime
        // worker thread.
        let sampled = tokio::task::spawn_blocking(move || {
            let mut handles = taken;
            let temperatures = if read_temps {
                read_temperatures(&mut handles.components, &topology_ref.temp_registry)
            } else {
                previous_temperatures
            };
            let stats = system_stats::collect(&mut handles, &topology_ref, temperatures.clone());
            (handles, stats, temperatures)
        })
        .await;

        let (returned_handles, stats, temperatures) = match sampled {
            Ok(sampled) => sampled,
            Err(e) => {
                error!("Stats sampling task failed: {}", e);
                shutdown.cancel();
                return;
            }
        };

        handles = Some(returned_handles);
        cached_temperatures = temperatures;

        let json = match serde_json::to_string(&stats) {
            Ok(json) => json,
            Err(e) => {
                error!("Failed to serialize system stats: {}", e);
                continue;
            }
        };

        let snapshot = Arc::new(StatsSnapshot {
            json: Arc::from(json.as_str()),
            stats,
        });

        // The only error here is "every subscriber went away between the count
        // check and now", which is ordinary.
        if let Err(e) = tx.send(snapshot) {
            debug!("No stats subscribers remaining: {}", e);
        }
    }
}
