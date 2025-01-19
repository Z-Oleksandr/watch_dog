use std::{collections::HashSet, sync::Mutex};
use serde::Serialize;

use crate::demo_system::DemoSystem;

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
}

pub fn get_system_data() -> SystemData {
    let demo_sys = DemoSystem::new();

    return SystemData {
        data_type: 0,
        num_cpus: demo_sys.num_cpus(),
        num_disks: demo_sys.num_disks(),
        disks_space: demo_sys.disks_total_space(),
        init_ram_total: demo_sys.total_memory()
    }
}

pub fn get_system_info() -> SystemInfo {
    let demo_sys = DemoSystem::new();

    return SystemInfo {
        data_type: 2,
        system_name: demo_sys.system_name,
        kernel_version: demo_sys.kernel_version,
        cpu_arch: demo_sys.cpu_arch,
        os_version: demo_sys.os_version,
        host_name: demo_sys.host_name,
        uptime: demo_sys.uptime
    }
}
