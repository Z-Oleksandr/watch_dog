//! Drive temperatures for the monitored disks.
//!
//! Sources are discovered once at startup and read without privileges:
//! - Linux: each drive's hwmon sensor, found by walking sysfs (`sysfs`).
//! - macOS: the internal SSD's NAND sensor, which the component temperature
//!   reads already cover, attributed to the system volume (`apple`).
//! - Elsewhere: none.

mod apple;
mod discovery;
mod sysfs;

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use log::{debug, info};

use crate::config;
use crate::temperatures::{is_plausible_temperature, TempSensor};
use discovery::DriveKind;

/// A disk in the monitored set, in `disks_space` order.
pub struct MonitoredDisk {
    /// Device name as sysinfo reports it (`/dev/nvme0n1p2`, `Macintosh HD`).
    pub device: String,
    pub mount_point: PathBuf,
}

/// Where one temperature reading comes from.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum TempSource {
    /// A hwmon `temp1_input` file, read on the disk temperature cadence.
    Hwmon(PathBuf),
    /// An entry of the component `temperatures`, already read by the sampler.
    Sensor(usize),
}

/// Where every monitored disk's temperature comes from.
///
/// Positional like the rest of the topology: entry *i* of `disk_sources` and
/// `warnings` belongs to entry *i* of `disks_space`.
pub struct DiskTempRegistry {
    /// Distinct sources; partitions of one drive share an entry, so each drive
    /// is queried once per read.
    sources: Vec<TempSource>,
    /// Per disk, indices into `sources`; empty when the disk has no sensor.
    disk_sources: Vec<Vec<usize>>,
    /// Per disk warning threshold in °C, `None` when the disk has no sensor.
    /// Empty when no disk has a sensor, so the field is left off the wire.
    pub warnings: Vec<Option<f32>>,
}

impl DiskTempRegistry {
    fn unavailable() -> Self {
        DiskTempRegistry {
            sources: Vec::new(),
            disk_sources: Vec::new(),
            warnings: Vec::new(),
        }
    }
}

/// Assembles a registry disk by disk, deduplicating shared sources.
struct RegistryBuilder {
    sources: Vec<TempSource>,
    source_index: HashMap<TempSource, usize>,
    disk_sources: Vec<Vec<usize>>,
    warnings: Vec<Option<f32>>,
}

impl RegistryBuilder {
    fn with_capacity(disks: usize) -> Self {
        RegistryBuilder {
            sources: Vec::new(),
            source_index: HashMap::new(),
            disk_sources: Vec::with_capacity(disks),
            warnings: Vec::with_capacity(disks),
        }
    }

    /// Adds the next disk. A disk without sources gets no warning.
    fn push_disk(&mut self, sources: Vec<TempSource>, warning: Option<f32>) {
        let mut indices: Vec<usize> = Vec::with_capacity(sources.len());
        for source in sources {
            let index = match self.source_index.get(&source) {
                Some(&index) => index,
                None => {
                    self.sources.push(source.clone());
                    let index = self.sources.len() - 1;
                    self.source_index.insert(source, index);
                    index
                }
            };
            if !indices.contains(&index) {
                indices.push(index);
            }
        }
        let warning = if indices.is_empty() { None } else { warning };
        self.disk_sources.push(indices);
        self.warnings.push(warning);
    }

    fn finish(self) -> DiskTempRegistry {
        let with_sensor = self.warnings.iter().filter(|w| w.is_some()).count();
        info!(
            "Drive temperature sensors found for {} of {} disk(s)",
            with_sensor,
            self.warnings.len()
        );
        if self.sources.is_empty() {
            return DiskTempRegistry::unavailable();
        }
        DiskTempRegistry {
            sources: self.sources,
            disk_sources: self.disk_sources,
            warnings: self.warnings,
        }
    }
}

/// Where the Linux kernel publishes block devices.
const SYSFS_BLOCK_DIR: &str = "/sys/class/block";

/// Discovers the temperature source of every monitored disk. `sensors` are
/// the component sensors in `temp_sensors` order. Performs blocking reads.
pub fn probe(disks: &[MonitoredDisk], sensors: &[TempSensor]) -> DiskTempRegistry {
    // cfg! rather than #[cfg] keeps every platform's discovery compiled and
    // tested everywhere, while only the host's runs.
    if cfg!(target_os = "linux") {
        sysfs::build(Path::new(SYSFS_BLOCK_DIR), disks)
    } else if cfg!(target_os = "macos") {
        apple::build(disks, sensors)
    } else {
        info!("Drive temperatures are not available on this platform");
        DiskTempRegistry::unavailable()
    }
}

/// Spinning disks use a fixed threshold: their self-reported limit is the edge
/// of the operating range, too late to warn. Solid-state drives use their own
/// limit less a margin, or a typical SSD rating when they report none.
fn warning_threshold(kind: DriveKind, reported_limit: Option<f32>) -> f32 {
    match kind {
        DriveKind::Rotational => config::HDD_TEMP_WARNING_C,
        DriveKind::SolidState => match reported_limit {
            Some(limit) => limit - config::DRIVE_LIMIT_MARGIN_C,
            None => config::SSD_TEMP_WARNING_FALLBACK_C,
        },
    }
}

/// Range in which a drive-reported limit is believed, in °C. Drives with an
/// unset WCTEMP report 0 or a wrapped Kelvin value.
const MIN_REPORTED_LIMIT_C: f32 = 50.0;
const MAX_REPORTED_LIMIT_C: f32 = 110.0;

fn is_believable_limit(limit: f32) -> bool {
    (MIN_REPORTED_LIMIT_C..=MAX_REPORTED_LIMIT_C).contains(&limit)
}

/// Reads every monitored disk's temperature in °C, `None` where the disk has
/// no sensor or the read failed. A disk spanning several drives reports the
/// hottest. Empty when no disk has a sensor.
///
/// `sensor_temperatures` are the latest component readings, positional with
/// `temp_sensors`. A hwmon read is a command to the drive (~12 ms for NVMe),
/// so this must run on the blocking pool and on the `DISK_TEMP_INTERVAL`
/// cadence.
pub fn read_disk_temperatures(
    registry: &DiskTempRegistry,
    sensor_temperatures: &[f32],
) -> Vec<Option<f32>> {
    if registry.sources.is_empty() {
        return Vec::new();
    }

    let readings: Vec<Option<f32>> = registry
        .sources
        .iter()
        .map(|source| read_source(source, sensor_temperatures))
        .collect();

    registry
        .disk_sources
        .iter()
        .map(|indices| {
            indices
                .iter()
                .filter_map(|&index| readings.get(index).copied().flatten())
                .reduce(f32::max)
        })
        .collect()
}

fn read_source(source: &TempSource, sensor_temperatures: &[f32]) -> Option<f32> {
    let (temperature, origin) = match source {
        TempSource::Hwmon(path) => (read_millidegrees(path)?, path.display().to_string()),
        TempSource::Sensor(index) => (
            sensor_temperatures.get(*index).copied()?,
            format!("component sensor {}", index),
        ),
    };
    if is_plausible_temperature(temperature) {
        Some(temperature)
    } else {
        debug!(
            "Ignoring implausible drive temperature {} from {}",
            temperature, origin
        );
        None
    }
}

/// Reads an hwmon attribute in millidegrees Celsius as °C. Failures are
/// ordinary (a drive in standby, a removed device) and logged at debug.
fn read_millidegrees(path: &Path) -> Option<f32> {
    match fs::read_to_string(path) {
        Ok(raw) => {
            let parsed = parse_millidegrees(&raw);
            if parsed.is_none() {
                debug!("Unparseable hwmon value in {}", path.display());
            }
            parsed
        }
        Err(e) => {
            debug!("Could not read {}: {}", path.display(), e);
            None
        }
    }
}

fn parse_millidegrees(raw: &str) -> Option<f32> {
    let millidegrees: i32 = raw.trim().parse().ok()?;
    Some(millidegrees as f32 / 1000.0)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub fn assert_close(actual: Option<f32>, expected: f32) {
        let actual = actual.expect("a value was expected");
        assert!(
            (actual - expected).abs() < 1e-3,
            "{} is not {}",
            actual,
            expected
        );
    }

    #[test]
    fn parses_millidegrees() {
        assert_close(parse_millidegrees("41850\n"), 41.85);
        assert_close(parse_millidegrees("-5000"), -5.0);
    }

    #[test]
    fn rejects_unparseable_millidegrees() {
        assert_eq!(parse_millidegrees(""), None);
        assert_eq!(parse_millidegrees("hot"), None);
        assert_eq!(parse_millidegrees("99999999999"), None);
    }

    #[test]
    fn hdd_threshold_ignores_the_reported_limit() {
        assert_eq!(
            warning_threshold(DriveKind::Rotational, Some(70.0)),
            config::HDD_TEMP_WARNING_C
        );
    }

    #[test]
    fn ssd_threshold_keeps_a_margin_below_the_reported_limit() {
        assert_eq!(
            warning_threshold(DriveKind::SolidState, Some(84.0)),
            84.0 - config::DRIVE_LIMIT_MARGIN_C
        );
    }

    #[test]
    fn ssd_threshold_falls_back_without_a_reported_limit() {
        assert_eq!(
            warning_threshold(DriveKind::SolidState, None),
            config::SSD_TEMP_WARNING_FALLBACK_C
        );
    }

    #[test]
    fn believes_only_plausible_limits() {
        assert!(is_believable_limit(84.85));
        assert!(!is_believable_limit(0.0));
        assert!(!is_believable_limit(65261.85));
    }

    #[test]
    fn shared_sources_are_read_once() {
        let mut builder = RegistryBuilder::with_capacity(2);
        builder.push_disk(vec![TempSource::Sensor(3)], Some(70.0));
        builder.push_disk(vec![TempSource::Sensor(3)], Some(70.0));
        let registry = builder.finish();
        assert_eq!(registry.sources.len(), 1);
        assert_eq!(registry.disk_sources, vec![vec![0], vec![0]]);
    }

    #[test]
    fn a_disk_without_sources_has_no_warning() {
        let mut builder = RegistryBuilder::with_capacity(2);
        builder.push_disk(Vec::new(), Some(70.0));
        builder.push_disk(vec![TempSource::Sensor(0)], Some(70.0));
        assert_eq!(builder.finish().warnings, vec![None, Some(70.0)]);
    }

    #[test]
    fn no_sources_at_all_leaves_the_registry_empty() {
        let mut builder = RegistryBuilder::with_capacity(1);
        builder.push_disk(Vec::new(), None);
        let registry = builder.finish();
        assert!(registry.warnings.is_empty());
        assert!(read_disk_temperatures(&registry, &[]).is_empty());
    }

    #[test]
    fn sensor_sources_read_the_component_temperatures() {
        let mut builder = RegistryBuilder::with_capacity(1);
        builder.push_disk(vec![TempSource::Sensor(1)], Some(70.0));
        let registry = builder.finish();
        assert_eq!(
            read_disk_temperatures(&registry, &[50.0, 38.5]),
            vec![Some(38.5)]
        );
    }

    #[test]
    fn a_missing_or_implausible_sensor_reading_reports_none() {
        let mut builder = RegistryBuilder::with_capacity(2);
        builder.push_disk(vec![TempSource::Sensor(5)], Some(70.0));
        builder.push_disk(vec![TempSource::Sensor(0)], Some(70.0));
        let registry = builder.finish();
        assert_eq!(read_disk_temperatures(&registry, &[0.0]), vec![None, None]);
    }
}
