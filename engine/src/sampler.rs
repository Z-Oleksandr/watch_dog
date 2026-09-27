use std::sync::Arc;

use log::{debug, error, info};
use tokio::sync::broadcast;
use tokio::time::{interval, MissedTickBehavior};
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

use crate::config;
use crate::disk_temps::read_disk_temperatures;
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

/// Counts stats ticks down to the next run of a slower, more expensive read.
/// Due on the first tick and again after every `every` ticks.
struct Cadence {
    every: u32,
    remaining: u32,
}

impl Cadence {
    fn new(every: u32) -> Self {
        Cadence {
            every: every.max(1),
            remaining: 0,
        }
    }

    /// Whether the read is due on this tick; advances the countdown.
    fn tick(&mut self) -> bool {
        if self.remaining == 0 {
            self.remaining = self.every - 1;
            true
        } else {
            self.remaining -= 1;
            false
        }
    }

    /// Makes the next tick due, so readings cached before an idle period are
    /// never shown to a newly connected client.
    fn reset(&mut self) {
        self.remaining = 0;
    }
}

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

    let mut temp_cadence = Cadence::new(config::temp_every_n_ticks());
    let mut disk_temp_cadence = Cadence::new(config::disk_temp_every_n_ticks());
    let mut handles = Some(handles);
    let mut cached_temperatures: Vec<f32> = Vec::new();
    let mut cached_disk_temperatures: Vec<Option<f32>> = Vec::new();

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
            temp_cadence.reset();
            disk_temp_cadence.reset();
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

        let read_temps = temp_cadence.tick();
        let read_disk_temps = disk_temp_cadence.tick();

        let topology_ref = Arc::clone(&topology);
        let previous_temperatures = cached_temperatures.clone();
        let previous_disk_temperatures = cached_disk_temperatures.clone();

        // sysinfo reads procfs and sysfs synchronously. Reading an NVMe
        // temperature alone blocks for ~12 ms, so this never runs on a runtime
        // worker thread. Drive temperatures are the same kind of read.
        let sampled = tokio::task::spawn_blocking(move || {
            let mut handles = taken;
            let temperatures = if read_temps {
                read_temperatures(&mut handles.components, &topology_ref.temp_registry)
            } else {
                previous_temperatures
            };
            let disk_temperatures = if read_disk_temps {
                read_disk_temperatures(&topology_ref.disk_temp_registry)
            } else {
                previous_disk_temperatures
            };
            let stats = system_stats::collect(
                &mut handles,
                &topology_ref,
                temperatures.clone(),
                disk_temperatures.clone(),
            );
            (handles, stats, temperatures, disk_temperatures)
        })
        .await;

        let (returned_handles, stats, temperatures, disk_temperatures) = match sampled {
            Ok(sampled) => sampled,
            Err(e) => {
                error!("Stats sampling task failed: {}", e);
                shutdown.cancel();
                return;
            }
        };

        handles = Some(returned_handles);
        cached_temperatures = temperatures;
        cached_disk_temperatures = disk_temperatures;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cadence_is_due_on_its_first_tick() {
        let mut cadence = Cadence::new(5);
        assert!(cadence.tick());
    }

    #[test]
    fn a_cadence_is_due_once_every_n_ticks() {
        let mut cadence = Cadence::new(3);
        let due: Vec<bool> = (0..7).map(|_| cadence.tick()).collect();
        assert_eq!(due, vec![true, false, false, true, false, false, true]);
    }

    #[test]
    fn a_reset_cadence_is_due_on_the_next_tick() {
        let mut cadence = Cadence::new(30);
        cadence.tick();
        cadence.tick();
        cadence.reset();
        assert!(cadence.tick());
    }

    #[test]
    fn a_zero_cadence_runs_every_tick() {
        let mut cadence = Cadence::new(0);
        assert!(cadence.tick());
        assert!(cadence.tick());
    }
}
