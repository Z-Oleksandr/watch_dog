use std::collections::HashSet;

use serde::Serialize;
use sysinfo::System;

use crate::helpers::is_initialized_disk;
use crate::topology::{HardwareHandles, Topology};

/// Live readings, broadcast to every connected client once per tick
/// (`data_type` 1).
///
/// `disks_used_space`, `disks_temperatures` and `temperatures` are
/// positional: entry *i* corresponds to entry *i* of `disks_space` (the first
/// two) and `temp_sensors` in the `data_type` 0 payload. The front-end indexes
/// them that way, so their order and length must track the topology for the
/// lifetime of the process.
#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SystemStats {
    data_type: u32,
    pub cpu_usage: Vec<f32>,
    ram_total: u64,
    pub ram_used: u64,
    disks_used_space: Vec<u64>,
    pub network_received: u64,
    pub network_transmitted: u64,
    uptime: u64,
    temperatures: Vec<f32>,
    /// Drive temperature per disk in °C, positional with `disks_space`;
    /// `null` where a disk has no sensor or the read failed. Refreshed every
    /// `DISK_TEMP_INTERVAL`. Omitted when no disk has a sensor.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    disks_temperatures: Vec<Option<f32>>,
}

/// Refreshes only what the payload actually contains.
///
/// Deliberately avoids `System::refresh_all()`: that also walks every process
/// and thread on the machine collecting command lines, environments and I/O
/// counters, none of which appear in `SystemStats`.
///
/// This performs synchronous sysfs and procfs reads and must be called from a
/// blocking context, never directly on a runtime worker.
pub fn collect(
    handles: &mut HardwareHandles,
    topology: &Topology,
    temperatures: Vec<f32>,
    disks_temperatures: Vec<Option<f32>>,
) -> SystemStats {
    handles.system.refresh_cpu_usage();
    handles.system.refresh_memory();

    let cpu_usage = handles
        .system
        .cpus()
        .iter()
        .map(|cpu| cpu.cpu_usage())
        .collect();

    let ram_total = handles.system.total_memory() / 1_000_000;
    let ram_used = handles.system.used_memory() / 1_000_000;

    // Refreshes usage of the disks enumerated at startup; the list itself is
    // intentionally not re-enumerated, so ordering stays aligned with
    // `disks_space`.
    handles.disks.refresh();
    let mut disks_used_space = Vec::with_capacity(topology.disk_names.len());
    let mut seen_this_tick = HashSet::new();

    for disk in handles.disks.list() {
        if is_initialized_disk(
            disk.name(),
            &topology.disk_names,
            disk.mount_point(),
            &mut seen_this_tick,
        ) {
            let used = disk.total_space().saturating_sub(disk.available_space());
            disks_used_space.push(used / 1_000_000);
        }
    }

    handles.networks.refresh();
    let mut network_received = 0;
    let mut network_transmitted = 0;

    for data in handles.networks.values() {
        network_received += data.received() / 1000;
        network_transmitted += data.transmitted() / 1000;
    }

    let uptime = System::uptime();

    SystemStats {
        data_type: 1,
        cpu_usage,
        ram_total,
        ram_used,
        disks_used_space,
        network_received,
        network_transmitted,
        uptime,
        temperatures,
        disks_temperatures,
    }
}
