use serde::Serialize;

use crate::demo_system::DemoSystem;

#[derive(Serialize)]
pub struct SystemStats {
    data_type: u32,
    pub cpu_usage: Vec<f32>,
    ram_total: u64,
    pub ram_used: u64,
    disks_used_space: Vec<u64>,
    pub network_received: u64,
    pub network_transmitted: u64,
    uptime: u64,
}

pub fn get_system_stats(loop_counter: u64) -> SystemStats {
    let mut demo_sys = DemoSystem::new();

    let cpu_usage = demo_sys.cpu_usage();

    let ram_total = demo_sys.total_memory() / 1_000_000;
    let ram_used = demo_sys.used_memory() / 1_000_000;

    let disks_used_space = demo_sys.disks_used_space();

    let network_received = demo_sys.data_received() / 1000;
    let network_transmitted = demo_sys.data_transmitted() / 1000;

    let uptime = demo_sys.uptime + loop_counter;

    return SystemStats {
        data_type: 1,
        cpu_usage,
        ram_total,
        ram_used,
        disks_used_space,
        network_received,
        network_transmitted,
        uptime
    }
}
