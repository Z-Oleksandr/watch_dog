use std::collections::HashSet;
use std::fmt;
use std::sync::Arc;

use log::{info, warn};
use serde::Serialize;
use sysinfo::{
    Components, CpuRefreshKind, Disks, MemoryRefreshKind, Networks, RefreshKind, System,
};

use crate::disk_temps::{self, DiskTempRegistry, MonitoredDisk};
use crate::helpers::{clean_disk_name, is_monitored_disk};
use crate::temperatures::{init_temp_sensors, TempSensor, TempSensorRegistry};

/// Static description of the machine, sent to every client as the first
/// message of a connection (`data_type` 0).
#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SystemData {
    data_type: u32,
    num_cpus: usize,
    num_disks: u32,
    disks_space: Vec<u64>,
    init_ram_total: u64,
    temp_sensors: Vec<TempSensor>,
    /// Per disk warning threshold in °C, positional with `disks_space`;
    /// `null` for a disk without a temperature sensor. Omitted when no disk
    /// has one.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    disks_temp_warning: Vec<Option<f32>>,
}

/// The machine description plus everything the sampler needs to keep producing
/// readings that line up with it positionally.
pub struct Topology {
    /// Names of the disks reported in `disks_space`, used to filter the
    /// per-tick disk list down to the same set.
    pub disk_names: HashSet<String>,
    pub temp_registry: TempSensorRegistry,
    pub disk_temp_registry: DiskTempRegistry,
    /// `data_type` 0 payload, serialized once and shared by every connection.
    pub system_data_json: Arc<str>,
}

/// Live sysinfo handles. These are created together with the topology and must
/// not be rebuilt afterwards: `TempSensorRegistry` stores positional indices
/// into `components`, and the front-end indexes `disks_used_space` against the
/// `disks_space` array produced from `disks`. Re-enumerating either can change
/// the ordering, which would silently attribute readings to the wrong gauge.
pub struct HardwareHandles {
    pub system: System,
    pub networks: Networks,
    pub disks: Disks,
    pub components: Components,
}

#[derive(Debug)]
pub enum TopologyError {
    Serialize(serde_json::Error),
}

impl fmt::Display for TopologyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TopologyError::Serialize(e) => write!(f, "failed to serialize system data: {}", e),
        }
    }
}

/// Enumerates CPUs, memory, disks and temperature sensors exactly once.
///
/// Performs blocking sysfs and procfs reads.
pub fn probe() -> Result<(Topology, HardwareHandles), TopologyError> {
    let system = System::new_with_specifics(
        RefreshKind::new()
            .with_cpu(CpuRefreshKind::new().with_cpu_usage())
            .with_memory(MemoryRefreshKind::new().with_ram()),
    );

    let disks = Disks::new_with_refreshed_list();
    let networks = Networks::new_with_refreshed_list();
    let components = Components::new_with_refreshed_list();

    let mut disk_names: HashSet<String> = HashSet::new();
    let mut disks_space: Vec<u64> = Vec::new();
    let mut monitored_disks: Vec<MonitoredDisk> = Vec::new();
    for disk in disks.list() {
        // For linux we need to filter non-physical drives
        if is_monitored_disk(disk.name(), &mut disk_names, disk.mount_point()) {
            disks_space.push(disk.total_space() / 1_000_000_000);
            monitored_disks.push(MonitoredDisk {
                device: clean_disk_name(disk.name()).unwrap_or_default(),
                mount_point: disk.mount_point().to_path_buf(),
            });
        }
    }
    let num_disks = disks_space.len() as u32;

    let temp_registry = init_temp_sensors(&components);
    if temp_registry.sensors.is_empty() {
        warn!("No temperature sensors available on this platform; reporting none");
    }
    let disk_temp_registry = disk_temps::probe(&monitored_disks, &temp_registry.sensors);

    let system_data = SystemData {
        data_type: 0,
        num_cpus: system.cpus().len(),
        num_disks,
        disks_space,
        init_ram_total: system.total_memory() / 1_000_000,
        temp_sensors: temp_registry.sensors.clone(),
        disks_temp_warning: disk_temp_registry.warnings.clone(),
    };

    let system_data_json = match serde_json::to_string(&system_data) {
        Ok(json) => json,
        Err(e) => {
            return Err(TopologyError::Serialize(e));
        }
    };

    info!(
        "Detected {} cpu(s), {} disk(s), {} temperature sensor(s)",
        system_data.num_cpus,
        num_disks,
        temp_registry.sensors.len()
    );

    let topology = Topology {
        disk_names,
        temp_registry,
        disk_temp_registry,
        system_data_json: Arc::from(system_data_json.as_str()),
    };

    let handles = HardwareHandles {
        system,
        networks,
        disks,
        components,
    };

    Ok((topology, handles))
}
