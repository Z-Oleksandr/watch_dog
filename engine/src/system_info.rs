use serde::Serialize;
use sysinfo::System;

/// General system description sent once per connection (`data_type` 2).
///
/// The front-end lays this out by key order, putting the first keys in the left
/// column, so the field order below is part of the wire contract.
#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SystemInfo {
    data_type: u32,
    system_name: String,
    kernel_version: String,
    cpu_arch: String,
    os_version: String,
    host_name: String,
    uptime: u64,
    docker: String,
}

/// The parts of `SystemInfo` that cannot change while the engine runs, read
/// once at startup instead of on every connection.
pub struct SystemInfoTemplate {
    system_name: String,
    kernel_version: String,
    cpu_arch: String,
    os_version: String,
    host_name: String,
    docker: String,
}

impl SystemInfoTemplate {
    pub fn probe(docker_version: &str) -> Self {
        Self {
            system_name: System::name().unwrap_or_else(|| "System name not found".to_string()),
            kernel_version: System::kernel_version()
                .unwrap_or_else(|| "Kernel version not found".to_string()),
            cpu_arch: System::cpu_arch().unwrap_or_else(|| "Unknown CPU architechture".to_string()),
            os_version: System::os_version().unwrap_or_else(|| "Unknown OS version".to_string()),
            host_name: System::host_name().unwrap_or_else(|| "Host name not found".to_string()),
            docker: docker_version.to_string(),
        }
    }

    /// Builds the payload for one connection, reading only the uptime afresh.
    pub fn snapshot(&self) -> SystemInfo {
        SystemInfo {
            data_type: 2,
            system_name: self.system_name.clone(),
            kernel_version: self.kernel_version.clone(),
            cpu_arch: self.cpu_arch.clone(),
            os_version: self.os_version.clone(),
            host_name: self.host_name.clone(),
            uptime: System::uptime(),
            docker: self.docker.clone(),
        }
    }
}
