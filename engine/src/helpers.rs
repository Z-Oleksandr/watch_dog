use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::Path;

// System partitions and snap images are not storage worth monitoring
const EXCLUDED_MOUNT_PREFIXES: [&str; 3] = ["/boot", "/var/snap", "/var/lib/snapd"];

fn is_excluded_mount(mount_point: &Path) -> bool {
    match mount_point.to_str() {
        Some(path) => EXCLUDED_MOUNT_PREFIXES
            .iter()
            .any(|prefix| path.starts_with(prefix)),
        None => true,
    }
}

fn clean_disk_name(disk_name: &OsStr) -> Option<String> {
    disk_name
        .to_str()
        .map(|name| name.trim_matches('\"').to_string())
}

/// Decides whether a disk belongs in the monitored set, recording it in
/// `disk_register` the first time it is seen.
///
/// For linux we need to filter non-physical drives.
pub fn is_not_pidor(
    disk_name: &OsStr,
    disk_register: &mut HashSet<String>,
    disk_mount_point: &Path,
) -> bool {
    let pidors = ["tmpfs", "overlay", "devtmpfs"];

    let name = match clean_disk_name(disk_name) {
        Some(name) => name,
        None => return false,
    };
    if pidors.contains(&name.as_str()) || is_excluded_mount(disk_mount_point) {
        return false;
    }
    disk_register.insert(name)
}

/// Decides whether a disk seen this tick is one of the monitored set, and has
/// not already been counted through another mount point.
pub fn is_initialized_disk(
    disk_name: &OsStr,
    disk_register: &HashSet<String>,
    disk_mount_point: &Path,
    seen_this_tick: &mut HashSet<String>,
) -> bool {
    if is_excluded_mount(disk_mount_point) {
        return false;
    }

    let name = match clean_disk_name(disk_name) {
        Some(name) => name,
        None => return false,
    };
    if !disk_register.contains(&name) {
        return false;
    }
    // A device mounted several times (btrfs subvolumes) reports once
    seen_this_tick.insert(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn os(value: &str) -> &OsStr {
        OsStr::new(value)
    }

    #[test]
    fn registers_a_physical_disk_once() {
        let mut register = HashSet::new();
        assert!(is_not_pidor(
            os("/dev/nvme0n1p2"),
            &mut register,
            Path::new("/")
        ));
        assert!(!is_not_pidor(
            os("/dev/nvme0n1p2"),
            &mut register,
            Path::new("/home")
        ));
        assert_eq!(register.len(), 1);
    }

    #[test]
    fn rejects_virtual_filesystems() {
        let mut register = HashSet::new();
        assert!(!is_not_pidor(os("tmpfs"), &mut register, Path::new("/run")));
        assert!(!is_not_pidor(
            os("overlay"),
            &mut register,
            Path::new("/var/lib/docker")
        ));
        assert!(!is_not_pidor(
            os("devtmpfs"),
            &mut register,
            Path::new("/dev")
        ));
        assert!(register.is_empty());
    }

    #[test]
    fn rejects_boot_and_snap_mounts() {
        let mut register = HashSet::new();
        assert!(!is_not_pidor(
            os("/dev/sda1"),
            &mut register,
            Path::new("/boot/efi")
        ));
        assert!(!is_not_pidor(
            os("/dev/loop0"),
            &mut register,
            Path::new("/var/snap/x")
        ));
        assert!(!is_not_pidor(
            os("/dev/loop1"),
            &mut register,
            Path::new("/var/lib/snapd/snaps")
        ));
        assert!(register.is_empty());
    }

    #[test]
    fn strips_quotes_from_disk_names() {
        let mut register = HashSet::new();
        assert!(is_not_pidor(
            os("\"/dev/sda1\""),
            &mut register,
            Path::new("/")
        ));
        assert!(register.contains("/dev/sda1"));
    }

    #[test]
    fn counts_a_registered_disk_once_per_tick() {
        let mut register = HashSet::new();
        is_not_pidor(os("/dev/sda1"), &mut register, Path::new("/"));

        let mut seen = HashSet::new();
        assert!(is_initialized_disk(
            os("/dev/sda1"),
            &register,
            Path::new("/"),
            &mut seen
        ));
        // Same device, second mount point: already accounted for.
        assert!(!is_initialized_disk(
            os("/dev/sda1"),
            &register,
            Path::new("/home"),
            &mut seen
        ));
    }

    #[test]
    fn ignores_disks_that_were_never_registered() {
        let register = HashSet::new();
        let mut seen = HashSet::new();
        assert!(!is_initialized_disk(
            os("/dev/sdb1"),
            &register,
            Path::new("/mnt"),
            &mut seen
        ));
    }

    #[test]
    fn excluded_mounts_are_skipped_per_tick_too() {
        let mut register = HashSet::new();
        register.insert("/dev/sda1".to_string());
        let mut seen = HashSet::new();
        assert!(!is_initialized_disk(
            os("/dev/sda1"),
            &register,
            Path::new("/boot"),
            &mut seen
        ));
    }
}
