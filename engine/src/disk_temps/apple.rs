//! macOS: Apple silicon publishes the internal SSD's temperature as HID
//! sensors named "NAND CHn temp", which sysinfo reads as components without
//! privileges. The internal SSD holds the system volume, so that volume gets
//! the reading. External drives offer no unprivileged sensor and report none.

use std::path::Path;

use log::info;

use super::discovery::DriveKind;
use super::{
    is_believable_limit, warning_threshold, DiskTempRegistry, MonitoredDisk, RegistryBuilder,
    TempSource,
};
use crate::temperatures::TempSensor;

/// Label fragment shared by the internal SSD's NAND channel sensors.
const NAND_LABEL: &str = "nand";

/// Mount points of the sealed system volume and its data volume, both on the
/// internal SSD's APFS container.
const SYSTEM_VOLUME_MOUNTS: [&str; 2] = ["/", "/System/Volumes/Data"];

pub fn build(disks: &[MonitoredDisk], sensors: &[TempSensor]) -> DiskTempRegistry {
    let nand = nand_sensors(sensors);
    if nand.is_empty() {
        info!("No internal SSD temperature sensor found");
    }

    // Apple reports no limit for these sensors today; honour one if it appears.
    let reported_limit = nand
        .iter()
        .filter_map(|&index| sensors.get(index).and_then(|sensor| sensor.critical))
        .filter(|&limit| is_believable_limit(limit))
        .reduce(f32::min);
    let warning = warning_threshold(DriveKind::SolidState, reported_limit);

    let mut builder = RegistryBuilder::with_capacity(disks.len());
    for disk in disks {
        if is_system_volume(&disk.mount_point) {
            let sources = nand
                .iter()
                .map(|&index| TempSource::Sensor(index))
                .collect();
            builder.push_disk(sources, Some(warning));
        } else {
            builder.push_disk(Vec::new(), None);
        }
    }
    builder.finish()
}

/// Positions in `temp_sensors` of the internal SSD's NAND sensors.
fn nand_sensors(sensors: &[TempSensor]) -> Vec<usize> {
    sensors
        .iter()
        .enumerate()
        .filter(|(_, sensor)| sensor.label.to_lowercase().contains(NAND_LABEL))
        .map(|(index, _)| index)
        .collect()
}

fn is_system_volume(mount_point: &Path) -> bool {
    SYSTEM_VOLUME_MOUNTS
        .iter()
        .any(|mount| mount_point == Path::new(mount))
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::super::read_disk_temperatures;
    use super::*;
    use crate::config;

    fn sensor(label: &str, critical: Option<f32>) -> TempSensor {
        TempSensor {
            label: label.to_string(),
            critical,
        }
    }

    fn disk(mount: &str) -> MonitoredDisk {
        MonitoredDisk {
            device: "Macintosh HD".to_string(),
            mount_point: PathBuf::from(mount),
        }
    }

    #[test]
    fn the_system_volume_reads_the_nand_sensor() {
        let sensors = vec![sensor("PMU tdie1", None), sensor("NAND CH0 temp", None)];
        let registry = build(&[disk("/")], &sensors);
        assert_eq!(
            registry.warnings,
            vec![Some(config::SSD_TEMP_WARNING_FALLBACK_C)]
        );
        assert_eq!(
            read_disk_temperatures(&registry, &[45.0, 31.5]),
            vec![Some(31.5)]
        );
    }

    #[test]
    fn the_data_volume_counts_as_the_system_volume() {
        assert!(is_system_volume(Path::new("/System/Volumes/Data")));
    }

    #[test]
    fn an_external_volume_has_no_temperature() {
        let sensors = vec![sensor("NAND CH0 temp", None)];
        let registry = build(&[disk("/"), disk("/Volumes/Backup")], &sensors);
        assert_eq!(
            read_disk_temperatures(&registry, &[33.0]),
            vec![Some(33.0), None]
        );
    }

    #[test]
    fn several_nand_channels_report_the_hottest() {
        let sensors = vec![sensor("NAND CH0 temp", None), sensor("NAND CH1 temp", None)];
        let registry = build(&[disk("/")], &sensors);
        assert_eq!(
            read_disk_temperatures(&registry, &[33.0, 36.0]),
            vec![Some(36.0)]
        );
    }

    #[test]
    fn a_believable_reported_limit_sets_the_threshold() {
        let sensors = vec![sensor("NAND CH0 temp", Some(85.0))];
        let registry = build(&[disk("/")], &sensors);
        assert_eq!(
            registry.warnings,
            vec![Some(85.0 - config::DRIVE_LIMIT_MARGIN_C)]
        );
    }

    #[test]
    fn without_a_nand_sensor_nothing_is_reported() {
        let sensors = vec![sensor("PMU tdie1", None)];
        let registry = build(&[disk("/")], &sensors);
        assert!(registry.warnings.is_empty());
    }
}
