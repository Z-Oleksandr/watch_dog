use std::env;
use std::time::Duration;

use log::warn;

/// Address the WebSocket server binds to. Override with `WATCH_DOG_ADDR`.
pub const DEFAULT_BIND_ADDR: &str = "0.0.0.0:8999";

/// Directory holding recorded stat logs, relative to the engine's working
/// directory (the front_panel npm scripts launch it from `engine/app_*`).
pub const LOG_DIR: &str = "../logs/";

/// How often the shared sampler collects and broadcasts system stats.
pub const STATS_INTERVAL: Duration = Duration::from_secs(1);

/// Temperature sensors are read on a slower cadence than the rest of the stats.
/// Reading an NVMe hwmon sensor issues an admin command to the drive and costs
/// ~12 ms per sensor, which does not belong on the 1 Hz path.
pub const TEMP_INTERVAL: Duration = Duration::from_secs(5);

/// Drive temperatures are read on the slowest cadence of all. A drive's
/// thermal mass makes its temperature change over minutes, and every read is a
/// command to the drive itself: ~12 ms for an NVMe admin command, a SMART
/// query for a SATA drive through `drivetemp`.
pub const DISK_TEMP_INTERVAL: Duration = Duration::from_secs(30);

/// Warning threshold for spinning disks, in °C. HDD datasheets rate operation
/// up to 55-60 °C and failure rates rise well before that, so the drive's own
/// (usually 60-65 °C) limit would warn too late.
pub const HDD_TEMP_WARNING_C: f32 = 55.0;

/// Warning threshold for solid-state drives that do not report their own
/// limit, in °C. SATA SSDs are typically rated for 0-70 °C.
pub const SSD_TEMP_WARNING_FALLBACK_C: f32 = 70.0;

/// Subtracted from the limit a solid-state drive reports (NVMe WCTEMP, where
/// it starts throttling) so the panel warns before the drive is at its limit.
pub const DRIVE_LIMIT_MARGIN_C: f32 = 5.0;

/// Delay between a client receiving its static payloads and the start of its
/// live stats stream. The front-end boot animation runs for 5 s and is
/// interrupted by the first stats frame, so this window must be preserved.
pub const CLIENT_STREAM_DELAY: Duration = Duration::from_secs(5);

/// Bounded per-connection backlog of stats frames. A subscriber that falls
/// further behind than this loses the oldest frames rather than growing memory.
pub const BROADCAST_CAPACITY: usize = 100;

/// Number of dropped-frame events tolerated before a connection is closed.
pub const MAX_LAG_EVENTS: u32 = 3;

/// Interval between keepalive pings sent to each client.
pub const PING_INTERVAL: Duration = Duration::from_secs(30);

/// How long a single outbound frame may take before the client is treated as
/// unreachable. Guards against a peer that stops draining its socket.
pub const SEND_TIMEOUT: Duration = Duration::from_secs(30);

/// Consecutive unanswered pings after which a connection is considered dead.
pub const MAX_MISSED_PONGS: u32 = 3;

/// Largest accepted inbound WebSocket message. Client messages are a small
/// JSON object, so this is generous.
pub const MAX_MESSAGE_SIZE: usize = 64 * 1024;

/// Upper bound on concurrent WebSocket connections.
pub const MAX_CONNECTIONS: usize = 32;

/// How long shutdown waits for connection tasks to finish before giving up.
pub const SHUTDOWN_GRACE: Duration = Duration::from_secs(10);

/// Samples the recorder takes per written batch, and the interval between
/// batch writes. Kept at the historical 5 s sample / 60 s flush cadence.
pub const LOG_SAMPLE_INTERVAL: Duration = Duration::from_secs(5);
pub const LOG_FLUSH_INTERVAL: Duration = Duration::from_secs(60);

/// Resolves the bind address, falling back to the default when the environment
/// override is absent or empty.
pub fn bind_addr() -> String {
    match env::var("WATCH_DOG_ADDR") {
        Ok(addr) if !addr.trim().is_empty() => addr,
        Ok(_) => {
            warn!(
                "WATCH_DOG_ADDR is set but empty, using {}",
                DEFAULT_BIND_ADDR
            );
            DEFAULT_BIND_ADDR.to_string()
        }
        Err(_) => DEFAULT_BIND_ADDR.to_string(),
    }
}

/// Number of stats frames between temperature reads.
pub fn temp_every_n_ticks() -> u32 {
    let stats = STATS_INTERVAL.as_millis().max(1);
    let temps = TEMP_INTERVAL.as_millis().max(1);
    ((temps / stats).max(1)) as u32
}

/// Number of stats frames between drive temperature reads.
pub fn disk_temp_every_n_ticks() -> u32 {
    let stats = STATS_INTERVAL.as_millis().max(1);
    let disk_temps = DISK_TEMP_INTERVAL.as_millis().max(1);
    ((disk_temps / stats).max(1)) as u32
}

/// Number of stats frames between recorder samples.
pub fn log_sample_every_n_ticks() -> u32 {
    let stats = STATS_INTERVAL.as_millis().max(1);
    let sample = LOG_SAMPLE_INTERVAL.as_millis().max(1);
    ((sample / stats).max(1)) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temp_cadence_is_five_stats_ticks() {
        assert_eq!(temp_every_n_ticks(), 5);
    }

    #[test]
    fn disk_temp_cadence_is_thirty_stats_ticks() {
        assert_eq!(disk_temp_every_n_ticks(), 30);
    }

    #[test]
    fn log_sample_cadence_is_five_stats_ticks() {
        assert_eq!(log_sample_every_n_ticks(), 5);
    }
}
