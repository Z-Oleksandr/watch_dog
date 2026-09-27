//! Maps a monitored disk to the hwmon temperature sensors of the physical
//! drives behind it, by walking the kernel's block device tree once at startup.

use std::fs;
use std::path::{Path, PathBuf};

use log::{debug, info};

/// Deepest chain of stacked block devices followed (partition → LUKS → LVM →
/// RAID → drive). Guards against a malformed or cyclic `slaves` graph.
const MAX_STACK_DEPTH: usize = 8;

/// hwmon attribute holding the drive's temperature, in millidegrees Celsius.
pub const TEMP_INPUT: &str = "temp1_input";

/// hwmon attribute holding the drive's own warning limit (NVMe WCTEMP), in
/// millidegrees Celsius.
pub const TEMP_MAX: &str = "temp1_max";

/// Whether a drive spins, which decides how its warning threshold is chosen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DriveKind {
    Rotational,
    SolidState,
}

/// What discovery learned about one physical drive.
#[derive(Debug, Clone, PartialEq)]
pub struct DriveProbe {
    /// `temp1_input` files of the drive; several for multipath NVMe.
    pub inputs: Vec<PathBuf>,
    pub kind: DriveKind,
    /// Directories holding those inputs, where `temp1_max` is read from.
    pub hwmon_dirs: Vec<PathBuf>,
}

/// Resolves a device path such as `/dev/mapper/vg-root` to its kernel name
/// (`dm-0`). Names outside `/dev` (ZFS datasets, network shares) have no
/// block device behind them.
pub fn kernel_name(device_path: &Path) -> Option<String> {
    if !device_path.starts_with("/dev") {
        return None;
    }
    // /dev/mapper and /dev/disk/by-* entries are symlinks to the kernel node.
    let resolved = fs::canonicalize(device_path).unwrap_or_else(|_| device_path.to_path_buf());
    resolved.file_name()?.to_str().map(str::to_string)
}

/// The whole physical drives a block device lives on, deduplicated.
pub fn physical_drives(block_dir: &Path, name: &str) -> Vec<String> {
    let mut drives = Vec::new();
    collect_drives(block_dir, name, 0, &mut drives);
    drives
}

fn collect_drives(block_dir: &Path, name: &str, depth: usize, drives: &mut Vec<String>) {
    if depth > MAX_STACK_DEPTH {
        debug!(
            "Stopped resolving block device {} after {} levels",
            name, MAX_STACK_DEPTH
        );
        return;
    }
    let dir = block_dir.join(name);
    if !dir.is_dir() {
        return;
    }

    if dir.join("partition").is_file() {
        if let Some(parent) = parent_disk(block_dir, name) {
            collect_drives(block_dir, &parent, depth + 1, drives);
        }
        return;
    }

    // Device-mapper and md devices list the devices they are built on.
    let slaves = list_names(&dir.join("slaves"));
    if slaves.is_empty() {
        if !drives.iter().any(|drive| drive == name) {
            drives.push(name.to_string());
        }
        return;
    }
    for slave in slaves {
        collect_drives(block_dir, &slave, depth + 1, drives);
    }
}

/// The disk a partition belongs to: the one whose directory contains it.
fn parent_disk(block_dir: &Path, partition: &str) -> Option<String> {
    list_names(block_dir)
        .into_iter()
        .find(|disk| disk != partition && block_dir.join(disk).join(partition).is_dir())
}

/// Finds the temperature sensors of a whole drive. `None` when the kernel
/// exposes none (SATA without `drivetemp`, NVMe on kernels before 5.5,
/// virtual devices).
pub fn probe_drive(block_dir: &Path, drive: &str) -> Option<DriveProbe> {
    let dir = block_dir.join(drive);

    // A multipath NVMe namespace head has no controller of its own; each of
    // its paths does, and each controller carries the sensor.
    let multipath = dir.join("multipath");
    let mut device_dirs = vec![dir.join("device")];
    device_dirs.extend(
        list_names(&multipath)
            .into_iter()
            .map(|path| multipath.join(path).join("device")),
    );

    let mut hwmon_dirs: Vec<PathBuf> = device_dirs.iter().flat_map(|d| hwmon_dirs(d)).collect();
    hwmon_dirs.sort();
    hwmon_dirs.dedup();

    if hwmon_dirs.is_empty() {
        if drive.starts_with("sd") {
            info!(
                "No temperature sensor for drive {}; SATA drives need the drivetemp kernel module",
                drive
            );
        } else {
            debug!("No temperature sensor for drive {}", drive);
        }
        return None;
    }

    Some(DriveProbe {
        inputs: hwmon_dirs.iter().map(|h| h.join(TEMP_INPUT)).collect(),
        kind: drive_kind(&dir),
        hwmon_dirs,
    })
}

/// hwmon devices of a device directory that expose a temperature. A class
/// parent (NVMe controller) holds `hwmonN` directly; a bus parent (SCSI
/// device) groups them under a `hwmon/` directory.
fn hwmon_dirs(device_dir: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    for name in list_names(device_dir) {
        if name == "hwmon" {
            let group = device_dir.join(&name);
            for inner in list_names(&group) {
                push_if_sensor(&mut found, group.join(inner));
            }
        } else if name.starts_with("hwmon") {
            push_if_sensor(&mut found, device_dir.join(name));
        }
    }
    found
}

fn push_if_sensor(found: &mut Vec<PathBuf>, hwmon_dir: PathBuf) {
    if hwmon_dir.join(TEMP_INPUT).is_file() {
        found.push(hwmon_dir);
    }
}

/// Unknown counts as rotational: the stricter HDD threshold warns early
/// rather than missing a hot spinning disk.
fn drive_kind(drive_dir: &Path) -> DriveKind {
    match fs::read_to_string(drive_dir.join("queue").join("rotational")) {
        Ok(value) if value.trim() == "0" => DriveKind::SolidState,
        Ok(_) => DriveKind::Rotational,
        Err(e) => {
            debug!(
                "Cannot tell whether {} is rotational, assuming it is: {}",
                drive_dir.display(),
                e
            );
            DriveKind::Rotational
        }
    }
}

/// Entry names of a directory, sorted for deterministic results; empty when
/// the directory is missing or unreadable.
fn list_names(dir: &Path) -> Vec<String> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };
    let mut names: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.file_name().to_str().map(str::to_string))
        .collect();
    names.sort();
    names
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT_TREE: AtomicUsize = AtomicUsize::new(0);

    /// A throwaway directory tree shaped like `/sys/class/block`, built from
    /// plain directories so it works on every platform.
    pub struct FakeBlockDir {
        pub root: PathBuf,
    }

    impl FakeBlockDir {
        pub fn new() -> Self {
            let id = NEXT_TREE.fetch_add(1, Ordering::Relaxed);
            let root =
                std::env::temp_dir().join(format!("watch_dog_block_{}_{}", std::process::id(), id));
            let _ = fs::remove_dir_all(&root); // leftovers of an aborted run
            fs::create_dir_all(&root).expect("temp dir is writable");
            FakeBlockDir { root }
        }

        pub fn dir(&self, relative: &str) -> PathBuf {
            let path = self.root.join(relative);
            fs::create_dir_all(&path).expect("temp dir is writable");
            path
        }

        pub fn file(&self, relative: &str, contents: &str) {
            let path = self.root.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("temp dir is writable");
            }
            fs::write(path, contents).expect("temp dir is writable");
        }

        /// NVMe drive whose controller holds `hwmonN` directly.
        pub fn nvme(&self, drive: &str, millidegrees: &str, limit: &str) {
            self.file(&format!("{drive}/device/hwmon2/{TEMP_INPUT}"), millidegrees);
            self.file(&format!("{drive}/device/hwmon2/{TEMP_MAX}"), limit);
            self.file(&format!("{drive}/queue/rotational"), "0\n");
        }

        /// SATA drive with `drivetemp`, grouped under `device/hwmon/`.
        pub fn sata(&self, drive: &str, millidegrees: &str, rotational: bool) {
            self.file(
                &format!("{drive}/device/hwmon/hwmon3/{TEMP_INPUT}"),
                millidegrees,
            );
            let flag = if rotational { "1\n" } else { "0\n" };
            self.file(&format!("{drive}/queue/rotational"), flag);
        }

        pub fn partition(&self, drive: &str, partition: &str) {
            self.dir(&format!("{drive}/{partition}"));
            self.file(&format!("{partition}/partition"), "1\n");
        }
    }

    impl Drop for FakeBlockDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root); // best-effort cleanup
        }
    }

    #[test]
    fn a_partition_resolves_to_its_drive() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "41850\n", "84850\n");
        tree.partition("nvme0n1", "nvme0n1p2");
        assert_eq!(physical_drives(&tree.root, "nvme0n1p2"), vec!["nvme0n1"]);
    }

    #[test]
    fn a_stacked_volume_resolves_to_every_drive_beneath_it() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "40000", "84850");
        tree.sata("sda", "50000", true);
        tree.partition("nvme0n1", "nvme0n1p1");
        tree.partition("sda", "sda1");
        tree.dir("md0/slaves/nvme0n1p1");
        tree.dir("md0/slaves/sda1");
        tree.dir("dm-0/slaves/md0");
        assert_eq!(physical_drives(&tree.root, "dm-0"), vec!["nvme0n1", "sda"]);
    }

    #[test]
    fn cyclic_slaves_terminate() {
        let tree = FakeBlockDir::new();
        tree.dir("dm-0/slaves/dm-1");
        tree.dir("dm-1/slaves/dm-0");
        assert!(physical_drives(&tree.root, "dm-0").is_empty());
    }

    #[test]
    fn an_unknown_device_resolves_to_nothing() {
        let tree = FakeBlockDir::new();
        assert!(physical_drives(&tree.root, "sdz1").is_empty());
    }

    #[test]
    fn finds_an_nvme_sensor_on_the_controller() {
        let tree = FakeBlockDir::new();
        tree.nvme("nvme0n1", "41850", "84850");
        let probe = probe_drive(&tree.root, "nvme0n1").expect("sensor was created");
        assert_eq!(probe.inputs.len(), 1);
        assert_eq!(probe.kind, DriveKind::SolidState);
    }

    #[test]
    fn finds_a_sata_sensor_under_the_hwmon_group() {
        let tree = FakeBlockDir::new();
        tree.sata("sda", "35000", true);
        let probe = probe_drive(&tree.root, "sda").expect("sensor was created");
        assert!(probe.inputs[0].ends_with(format!("hwmon/hwmon3/{TEMP_INPUT}")));
        assert_eq!(probe.kind, DriveKind::Rotational);
    }

    #[test]
    fn finds_sensors_on_every_multipath_controller() {
        let tree = FakeBlockDir::new();
        tree.file(
            &format!("nvme0n1/multipath/nvme0c0n1/device/hwmon1/{TEMP_INPUT}"),
            "40000",
        );
        tree.file(
            &format!("nvme0n1/multipath/nvme0c1n1/device/hwmon4/{TEMP_INPUT}"),
            "42000",
        );
        let probe = probe_drive(&tree.root, "nvme0n1").expect("sensors were created");
        assert_eq!(probe.inputs.len(), 2);
    }

    #[test]
    fn a_drive_without_hwmon_has_no_sensor() {
        let tree = FakeBlockDir::new();
        tree.dir("sdb/device");
        tree.file("sdb/queue/rotational", "1");
        assert_eq!(probe_drive(&tree.root, "sdb"), None);
    }

    #[test]
    fn an_unreadable_rotational_flag_counts_as_rotational() {
        let tree = FakeBlockDir::new();
        tree.file(&format!("sdc/device/hwmon/hwmon5/{TEMP_INPUT}"), "30000");
        let probe = probe_drive(&tree.root, "sdc").expect("sensor was created");
        assert_eq!(probe.kind, DriveKind::Rotational);
    }

    #[test]
    fn names_outside_dev_have_no_block_device() {
        assert_eq!(kernel_name(Path::new("tank/data")), None);
        assert_eq!(kernel_name(Path::new("server:/export")), None);
    }

    #[test]
    fn an_unresolvable_dev_path_keeps_its_own_name() {
        assert_eq!(
            kernel_name(Path::new("/dev/watch-dog-test-missing")),
            Some("watch-dog-test-missing".to_string())
        );
    }
}
