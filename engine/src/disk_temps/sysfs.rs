//! Linux: every monitored disk reads the hwmon sensors of the physical
//! drives beneath it, found once by walking the block device tree.

use std::collections::HashMap;
use std::path::Path;

use super::discovery::{kernel_name, physical_drives, probe_drive, DriveProbe, TEMP_MAX};
use super::{
    is_believable_limit, read_millidegrees, warning_threshold, DiskTempRegistry, MonitoredDisk,
    RegistryBuilder, TempSource,
};

pub fn build(block_dir: &Path, disks: &[MonitoredDisk]) -> DiskTempRegistry {
    let kernel_names: Vec<Option<String>> = disks
        .iter()
        .map(|disk| kernel_name(Path::new(&disk.device)))
        .collect();
    build_from_kernel_names(block_dir, &kernel_names)
}

fn build_from_kernel_names(block_dir: &Path, kernel_names: &[Option<String>]) -> DiskTempRegistry {
    let mut builder = RegistryBuilder::with_capacity(kernel_names.len());
    let mut drives: HashMap<String, Option<(DriveProbe, f32)>> = HashMap::new();

    for name in kernel_names {
        let mut sources: Vec<TempSource> = Vec::new();
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
            sources.extend(probe.inputs.iter().cloned().map(TempSource::Hwmon));
            // A volume spanning several drives warns at its most sensitive one.
            let strictest = warning.map_or(*drive_warning, |w| w.min(*drive_warning));
            warning = Some(strictest);
        }

        builder.push_disk(sources, warning);
    }

    builder.finish()
}

/// The lowest believable limit the drive reports across its controllers.
fn reported_limit(probe: &DriveProbe) -> Option<f32> {
    probe
        .hwmon_dirs
        .iter()
        .filter_map(|dir| read_millidegrees(&dir.join(TEMP_MAX)))
        .filter(|&limit| is_believable_limit(limit))
        .reduce(f32::min)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::super::discovery::tests::FakeBlockDir;
    use super::super::read_disk_temperatures;
    use super::super::tests::assert_close;
    use super::*;
    use crate::config;

    fn names(names: &[&str]) -> Vec<Option<String>> {
        names.iter().map(|name| Some(name.to_string())).collect()
    }

    fn read(registry: &DiskTempRegistry) -> Vec<Option<f32>> {
        read_disk_temperatures(registry, &[])
    }

    #[test]
    fn an_implausible_reported_limit_is_ignored() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "40000", "0");
        let registry = build_from_kernel_names(&tree.root, &names(&["nvme0n1"]));
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
        let registry = build_from_kernel_names(&tree.root, &names(&["nvme0n1p2"]));
        assert_close(registry.warnings[0], 84.85 - config::DRIVE_LIMIT_MARGIN_C);
        assert_close(read(&registry)[0], 41.85);
    }

    #[test]
    fn a_sata_hdd_uses_the_hdd_threshold() {
        let tree = FakeBlockDir::new();
        tree.sata("sda", "38000", true);
        tree.partition("sda", "sda1");
        let registry = build_from_kernel_names(&tree.root, &names(&["sda1"]));
        assert_eq!(registry.warnings, vec![Some(config::HDD_TEMP_WARNING_C)]);
    }

    #[test]
    fn partitions_of_one_drive_share_one_read() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "41000", "84000");
        tree.partition("nvme0n1", "nvme0n1p1");
        tree.partition("nvme0n1", "nvme0n1p2");
        let registry = build_from_kernel_names(&tree.root, &names(&["nvme0n1p1", "nvme0n1p2"]));
        assert_eq!(registry.sources.len(), 1);
        assert_eq!(registry.disk_sources, vec![vec![0], vec![0]]);
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
        let registry = build_from_kernel_names(&tree.root, &names(&["dm-0"]));
        assert_eq!(registry.warnings, vec![Some(config::HDD_TEMP_WARNING_C)]);
        assert_close(read(&registry)[0], 50.0);
    }

    #[test]
    fn a_disk_without_a_sensor_stays_aligned() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "41000", "84000");
        tree.dir("sdb/device");
        let kernel_names = vec![None, Some("sdb".to_string()), Some("nvme0n1".to_string())];
        let registry = build_from_kernel_names(&tree.root, &kernel_names);
        assert_eq!(registry.warnings.len(), 3);
        let temperatures = read(&registry);
        assert_eq!(temperatures.len(), 3);
        assert_eq!(temperatures[0], None);
        assert_eq!(temperatures[1], None);
        assert_close(temperatures[2], 41.0);
    }

    #[test]
    fn no_sensors_at_all_reports_nothing() {
        let tree = FakeBlockDir::new();
        tree.dir("sdb/device");
        let registry = build_from_kernel_names(&tree.root, &names(&["sdb", "tank"]));
        assert!(registry.warnings.is_empty());
        assert!(read(&registry).is_empty());
    }

    #[test]
    fn a_failed_read_reports_none() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "41000", "84000");
        let registry = build_from_kernel_names(&tree.root, &names(&["nvme0n1"]));
        fs::remove_dir_all(tree.root.join("nvme0n1")).expect("tree is removable");
        assert_eq!(read(&registry), vec![None]);
    }

    #[test]
    fn an_implausible_reading_reports_none() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "0", "84000");
        let registry = build_from_kernel_names(&tree.root, &names(&["nvme0n1"]));
        assert_eq!(read(&registry), vec![None]);
    }
}
