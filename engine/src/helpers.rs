use std::ffi::OsStr;

// For linux we need to filter non-physical drives
pub fn is_not_pidor(disk_name: &OsStr) -> bool {
    let pidors: [&str; 3] = [
        "tmpfs",
        "overlay",
        "devtmpfs"
    ];

    let clean_disk_name = disk_name.to_str().unwrap().trim_matches('\"');
    let not_pidor = !pidors.contains(&clean_disk_name);
    not_pidor
}