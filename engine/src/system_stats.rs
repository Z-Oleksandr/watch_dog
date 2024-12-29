use sysinfo::{
    Disks, Networks,
    System
};

use serde::Serialize;

use crate::helpers::is_initialized_disk;
use crate::system_info::DISK_REGISTER;

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

pub fn get_system_stats(sys: &mut System, networks: &mut Networks) -> SystemStats {
    sys.refresh_all();

    // CPU usage data
    let cpu_usage = sys.cpus()
        .iter()
        .map(|cpu| cpu.cpu_usage())
        .collect();

    // RAM data
    let ram_total = sys.total_memory() / 1_000_000;
    let ram_used = sys.used_memory() / 1_000_000;

    // Disk data
    let disks = Disks::new_with_refreshed_list();
    let mut disks_used_space = Vec::new();

    {
        let mut disk_register = DISK_REGISTER.lock().unwrap();

        for disk in disks.list() {
            if is_initialized_disk(
                disk.name(), 
                &disk_register, 
                disk.mount_point()
            ) {
                disks_used_space.push(
                    (disk.total_space() - disk.available_space()) / 1_000_000
                );
            }
        }
    }

    networks.refresh();
    let mut interfaces = Vec::new();
    let mut network_received = 0;
    let mut network_transmitted = 0;

    for (iface, data) in networks.iter() {
        interfaces.push(iface);
        network_received += data.received() / 1000;
        network_transmitted += data.transmitted() / 1000;

    }

    let uptime = System::uptime();

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
