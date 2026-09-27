//! Drive temperatures for the monitored disks.
//!
//! Sensors are discovered once at startup (see `discovery`) and afterwards read
//! as plain hwmon files, so reading needs no privileges. Linux only: other
//! platforms offer no unprivileged way to query a drive, and report none.

// Discovery only runs on Linux, but it still compiles and is tested on every
// platform, where its items would otherwise be flagged as unused.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

mod discovery;

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use log::{debug, info};

use crate::config;
use crate::temperatures::is_plausible_temperature;
use discovery::{kernel_name, physical_drives, probe_drive, DriveKind, DriveProbe, TEMP_MAX};

/// Range in which a drive-reported limit is believed, in °C. Drives with an
/// unset WCTEMP report 0 or a wrapped Kelvin value.
const MIN_REPORTED_LIMIT_C: f32 = 50.0;
const MAX_REPORTED_LIMIT_C: f32 = 110.0;

/// Where every monitored disk's temperature comes from.
///
/// Positional like the rest of the topology: entry *i* of `disk_inputs` and
/// `warnings` belongs to entry *i* of `disks_space`.
pub struct DiskTempRegistry {
    /// Distinct sensor files; partitions of one drive share an entry, so each
    /// drive is queried once per read.
    inputs: Vec<PathBuf>,
    /// Per disk, indices into `inputs`; empty when the disk has no sensor.
    disk_inputs: Vec<Vec<usize>>,
    /// Per disk warning threshold in °C, `None` when the disk has no sensor.
    /// Empty when no disk has a sensor, so the field is left off the wire.
    pub warnings: Vec<Option<f32>>,
}

impl DiskTempRegistry {
    fn unavailable() -> Self {
        DiskTempRegistry {
            inputs: Vec::new(),
            disk_inputs: Vec::new(),
            warnings: Vec::new(),
        }
    }
}

/// Where the kernel publishes block devices; `None` without sysfs.
fn block_class_dir() -> Option<&'static Path> {
    #[cfg(target_os = "linux")]
    {
        Some(Path::new("/sys/class/block"))
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

/// Discovers the sensors of the monitored disks, given their device names in
/// topology order. Performs blocking sysfs reads.
pub fn probe(disk_names: &[String]) -> DiskTempRegistry {
    let block_dir = match block_class_dir() {
        Some(dir) => dir,
        None => {
            info!("Drive temperatures are only available on Linux");
            return DiskTempRegistry::unavailable();
        }
    };
    let kernel_names: Vec<Option<String>> = disk_names
        .iter()
        .map(|name| kernel_name(Path::new(name)))
        .collect();
    build_registry(block_dir, &kernel_names)
}

fn build_registry(block_dir: &Path, kernel_names: &[Option<String>]) -> DiskTempRegistry {
    let mut inputs: Vec<PathBuf> = Vec::new();
    let mut input_index: HashMap<PathBuf, usize> = HashMap::new();
    let mut drives: HashMap<String, Option<(DriveProbe, f32)>> = HashMap::new();
    let mut disk_inputs = Vec::with_capacity(kernel_names.len());
    let mut warnings = Vec::with_capacity(kernel_names.len());

    for name in kernel_names {
        let mut indices: Vec<usize> = Vec::new();
        let mut warning: Option<f32> = None;

        let resolved = match name {
            Some(name) => physical_drives(block_dir, name),
            None => Vec::new(),
        };
        for drive in resolved {
            let probed = drives.entry(drive).or_insert_with_key(|drive| {
                probe_drive(block_dir, drive).map(|probe| {
                    let warning = warning_threshold(probe.kind, reported_limit(&probe));
                    (probe, warning)
                })
            });
            let (probe, drive_warning) = match probed {
                Some(probed) => probed,
                None => continue,
            };
            for input in &probe.inputs {
                let index = *input_index.entry(input.clone()).or_insert_with(|| {
                    inputs.push(input.clone());
                    inputs.len() - 1
                });
                if !indices.contains(&index) {
                    indices.push(index);
                }
            }
            // A volume spanning several drives warns at its most sensitive one.
            let strictest = warning.map_or(*drive_warning, |w| w.min(*drive_warning));
            warning = Some(strictest);
        }

        disk_inputs.push(indices);
        warnings.push(warning);
    }

    let with_sensor = warnings.iter().filter(|w| w.is_some()).count();
    info!(
        "Drive temperature sensors found for {} of {} disk(s)",
        with_sensor,
        kernel_names.len()
    );
    if inputs.is_empty() {
        return DiskTempRegistry::unavailable();
    }

    DiskTempRegistry {
        inputs,
        disk_inputs,
        warnings,
    }
}

/// The lowest believable limit the drive reports across its controllers.
fn reported_limit(probe: &DriveProbe) -> Option<f32> {
    probe
        .hwmon_dirs
        .iter()
        .filter_map(|dir| read_millidegrees(&dir.join(TEMP_MAX)))
        .filter(|limit| (MIN_REPORTED_LIMIT_C..=MAX_REPORTED_LIMIT_C).contains(limit))
        .reduce(f32::min)
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

/// Reads every monitored disk's temperature in °C, `None` where the disk has
/// no sensor or the read failed. A disk spanning several drives reports the
/// hottest. Empty when no disk has a sensor.
///
/// Every sensor read is a command to the drive (~12 ms for NVMe), so this must
/// run on the blocking pool and on the slow `DISK_TEMP_INTERVAL` cadence.
pub fn read_disk_temperatures(registry: &DiskTempRegistry) -> Vec<Option<f32>> {
    if registry.inputs.is_empty() {
        return Vec::new();
    }

    let readings: Vec<Option<f32>> = registry
        .inputs
        .iter()
        .map(|input| read_temperature(input))
        .collect();

    registry
        .disk_inputs
        .iter()
        .map(|indices| {
            indices
                .iter()
                .filter_map(|&index| readings.get(index).copied().flatten())
                .reduce(f32::max)
        })
        .collect()
}

fn read_temperature(input: &Path) -> Option<f32> {
    let temperature = read_millidegrees(input)?;
    if is_plausible_temperature(temperature) {
        Some(temperature)
    } else {
        debug!(
            "Ignoring implausible drive temperature {} from {}",
            temperature,
            input.display()
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
mod tests {
    use super::discovery::tests::FakeBlockDir;
    use super::*;

    fn assert_close(actual: Option<f32>, expected: f32) {
        let actual = actual.expect("a value was expected");
        assert!(
            (actual - expected).abs() < 1e-3,
            "{} is not {}",
            actual,
            expected
        );
    }

    fn names(names: &[&str]) -> Vec<Option<String>> {
        names.iter().map(|name| Some(name.to_string())).collect()
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
    fn an_implausible_reported_limit_is_ignored() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "40000", "0");
        let registry = build_registry(&tree.root, &names(&["nvme0n1"]));
        assert_eq!(
            registry.warnings,
            vec![Some(config::SSD_TEMP_WARNING_FALLBACK_C)]
        );
    }

    #[test]
    fn an_nvme_partition_reads_its_drive() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "41850\n", "84850\n");
        tree.partition("nvme0n1", "nvme0n1p2");
        let registry = build_registry(&tree.root, &names(&["nvme0n1p2"]));
        assert_close(registry.warnings[0], 84.85 - config::DRIVE_LIMIT_MARGIN_C);
        assert_close(read_disk_temperatures(&registry)[0], 41.85);
    }

    #[test]
    fn a_sata_hdd_uses_the_hdd_threshold() {
        let tree = FakeBlockDir::new();
        tree.sata("sda", "38000", true);
        tree.partition("sda", "sda1");
        let registry = build_registry(&tree.root, &names(&["sda1"]));
        assert_eq!(registry.warnings, vec![Some(config::HDD_TEMP_WARNING_C)]);
    }

    #[test]
    fn partitions_of_one_drive_share_one_read() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "41000", "84000");
        tree.partition("nvme0n1", "nvme0n1p1");
        tree.partition("nvme0n1", "nvme0n1p2");
        let registry = build_registry(&tree.root, &names(&["nvme0n1p1", "nvme0n1p2"]));
        assert_eq!(registry.inputs.len(), 1);
        assert_eq!(registry.disk_inputs, vec![vec![0], vec![0]]);
    }

    #[test]
    fn a_stacked_volume_reports_its_hottest_drive_and_strictest_threshold() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "40000", "84000");
        tree.sata("sda", "50000", true);
        tree.partition("nvme0n1", "nvme0n1p1");
        tree.partition("sda", "sda1");
        tree.dir("dm-0/slaves/nvme0n1p1");
        tree.dir("dm-0/slaves/sda1");
        let registry = build_registry(&tree.root, &names(&["dm-0"]));
        assert_eq!(registry.warnings, vec![Some(config::HDD_TEMP_WARNING_C)]);
        assert_close(read_disk_temperatures(&registry)[0], 50.0);
    }

    #[test]
    fn a_disk_without_a_sensor_stays_aligned() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "41000", "84000");
        tree.dir("sdb/device");
        let kernel_names = vec![None, Some("sdb".to_string()), Some("nvme0n1".to_string())];
        let registry = build_registry(&tree.root, &kernel_names);
        assert_eq!(registry.warnings.len(), 3);
        let temperatures = read_disk_temperatures(&registry);
        assert_eq!(temperatures.len(), 3);
        assert_eq!(temperatures[0], None);
        assert_eq!(temperatures[1], None);
        assert_close(temperatures[2], 41.0);
    }

    #[test]
    fn no_sensors_at_all_reports_nothing() {
        let tree = FakeBlockDir::new();
        tree.dir("sdb/device");
        let registry = build_registry(&tree.root, &names(&["sdb", "tank"]));
        assert!(registry.warnings.is_empty());
        assert!(read_disk_temperatures(&registry).is_empty());
    }

    #[test]
    fn a_failed_read_reports_none() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "41000", "84000");
        let registry = build_registry(&tree.root, &names(&["nvme0n1"]));
        fs::remove_dir_all(tree.root.join("nvme0n1")).expect("tree is removable");
        assert_eq!(read_disk_temperatures(&registry), vec![None]);
    }

    #[test]
    fn an_implausible_reading_reports_none() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "0", "84000");
        let registry = build_registry(&tree.root, &names(&["nvme0n1"]));
        assert_eq!(read_disk_temperatures(&registry), vec![None]);
    }
}
