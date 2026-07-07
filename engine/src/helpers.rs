use std::{
    ffi::OsStr, 
    collections::HashSet, 
    path::Path, 
    fs, 
    io
};

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

// For linux we need to filter non-physical drives
pub fn is_not_pidor(
    disk_name: &OsStr,
    disk_register: &mut HashSet<String>,
    disk_mount_point: &Path
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

pub fn is_initialized_disk(
        disk_name: &OsStr,
        disk_register: &HashSet<String>,
        disk_mount_point: &Path,
        seen_this_tick: &mut HashSet<String>
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

pub fn ensure_dir(dir: &str) -> io::Result<()> {
    let path = Path::new(dir);
    if !path.exists() {
        fs::create_dir(path)?;
    }
    Ok(())
}
