use std::{ffi::OsStr, collections::HashSet};

// For linux we need to filter non-physical drives
pub fn is_not_pidor(disk_name: &OsStr, disk_register: &mut HashSet<String>) -> bool {
    let pidors: [String; 3] = [
        String::from("tmpfs"),
        String::from("overlay"),
        String::from("devtmpfs")
    ];

    let clean_disk_name = disk_name
        .to_str()
        .unwrap()
        .trim_matches('\"')
        .to_string();
    let not_pidor = !pidors.contains(&clean_disk_name);
    if not_pidor && disk_register.insert(clean_disk_name) {
        return true
    }
    false
}

pub fn is_initialized_disk(disk_name: &OsStr, disk_register: &HashSet<String>) -> bool {
    let clean_disk_name = disk_name
        .to_str()
        .unwrap()
        .trim_matches('\"')
        .to_string();
    if disk_register.contains(&clean_disk_name) {
        return true
    }
    false
}
