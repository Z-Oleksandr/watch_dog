use std::{collections::HashSet, sync::Mutex};

use sysinfo::{
    Disks, Networks,
    System
};
use serde::Serialize;

use lazy_static::lazy_static;

use crate::helpers::{is_initialized_disk, is_not_pidor};

use crate::docker_mon::init_docker_mon;

#[derive(Serialize)]
pub struct SystemData {
    data_type: u32,
    num_cpus: usize,
    num_disks: u32,
    disks_space: Vec<u64>,
    init_ram_total: u64,
}

#[derive(Serialize)]
pub struct SystemInfo {
    data_type: u32,
    system_name: String,
    kernel_version: String,
    cpu_arch: String,
    os_version: String,
    host_name: String,
    uptime: u64,
    docker: bool,
}

lazy_static! {
    pub static ref DISK_REGISTER: Mutex<HashSet<String>> = Mutex::new(HashSet::new());
}

pub fn get_system_data() -> SystemData {
    let mut sys = System::new_all();

    // Get disk data
    let disks = Disks::new_with_refreshed_list();

    {
        DISK_REGISTER.lock().unwrap().clear();
    }

    let (disks_space, disk_count) = {
        let mut disks_space = Vec::new();
        let mut disk_count: u32 = 0;

        let mut disk_register = DISK_REGISTER.lock().unwrap();

        for disk in disks.list() {
            // For linux we need to filter non-physical drives
            if is_not_pidor(disk.name(), &mut disk_register) {
                disks_space.push(disk.total_space() / 1_000_000_000);
                disk_count += 1;
            }
        }

        (disks_space, disk_count)
    };

    return SystemData {
        data_type: 0,
        num_cpus: sys.cpus().len(),
        num_disks: disk_count,
        disks_space,
        init_ram_total: sys.total_memory() / 1_000_000,
    }
}

pub fn get_system_info() -> SystemInfo {
    let system_name = System::name()
        .unwrap_or("System name not found".to_string());

    let kernel_version = System::kernel_version()
        .unwrap_or("Kernel version not found".to_string());

    let cpu_arch = System::cpu_arch()
        .unwrap_or("Unknown CPU architechture".to_string());

    let os_version = System::os_version()
        .unwrap_or("Unknown OS version".to_string());

    let host_name = System::host_name()
        .unwrap_or("Host name not found".to_string());

    let uptime = System::uptime();

    let docker = init_docker_mon();

    return SystemInfo {
        data_type: 2,
        system_name,
        kernel_version,
        cpu_arch,
        os_version,
        host_name,
        uptime,
        docker
    }
}

