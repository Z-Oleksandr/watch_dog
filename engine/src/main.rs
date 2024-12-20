use std::{collections:: HashSet, net::SocketAddr, time::Duration};
use sysinfo::{
    Disks,
    Networks, System
};
use tokio::{net::{TcpListener, TcpStream}, time};
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};
use serde::Serialize;
use futures::{StreamExt, SinkExt};

mod helpers;
use helpers::{is_initialized_disk, is_not_pidor};

#[derive(Serialize)]
struct SystemStats {
    data_type: u32,
    cpu_usage: Vec<f32>,
    ram_total: u64,
    ram_used: u64,
    disks_used_space: Vec<u64>,
    network_received: u64,
    network_transmitted: u64,
    uptime: u64,
}

#[derive(Serialize)]
struct SystemData {
    data_type: u32,
    num_cpus: usize,
    num_disks: u32,
    disks_space: Vec<u64>,
    init_ram_total: u64,
}

#[derive(Serialize)]
struct SystemInfo {
    data_type: u32,
    system_name: String,
    kernel_version: String,
    cpu_arch: String,
    os_version: String,
    host_name: String,
    uptime: u64,
}

async fn handle_connection(raw_stream: TcpStream, addr: SocketAddr) {
    println!("New Socket connection: {}", addr);

    let ws_stream = accept_async(raw_stream)
        .await
        .expect("Failed to accept");

    // Split ws stream into sender and receiver
    let (mut write, _) = ws_stream.split();

    let mut sys = System::new_all();

    // Get static disks data
    let disks = Disks::new_with_refreshed_list();
    let mut disks_space = Vec::new();
    let mut disk_count: u32 = 0;

    let mut disk_register: HashSet<String> = HashSet::new();

    for disk in disks.list() {
        // For linux we need to filter non-physical drives
        if is_not_pidor(disk.name(), &mut disk_register) {
            disks_space.push(disk.total_space() / 1000000000);
            disk_count += 1;
        }
    }

    // Init Network data
    let mut networks = Networks::new_with_refreshed_list();

    // Send static system data
    let system_data = SystemData {
        data_type: 0,
        num_cpus: sys.cpus().len(),
        num_disks: disk_count,
        disks_space,
        init_ram_total: sys.total_memory() / 1000000000,
    };

    let system_data_json = serde_json::to_string(&system_data).unwrap();
    write.send(Message::Text(system_data_json))
        .await.expect("Error sending static data");

    // Prepare SystemInfo
    let system_name = System::name()
        .unwrap_or("System name not found".to_string());

    let kernel_version = System::kernel_version()
        .unwrap_or("Kernel version not available".to_string());

    let cpu_arch = System::cpu_arch()
        .unwrap_or("cpu_arch not found".to_string());

    let os_version = System::os_version()
        .unwrap_or("x.x.x".to_string());

    let host_name = System::host_name()
        .unwrap_or("Host name not found".to_string());

    let uptime = System::uptime();

    let system_info = SystemInfo {
        data_type: 2,
        system_name,
        kernel_version,
        cpu_arch,
        os_version,
        host_name,
        uptime
    };

    let system_info_json = serde_json::to_string(&system_info).unwrap();
    write.send(Message::Text(system_info_json))
        .await.expect("Error sending system info");

    time::sleep(Duration::from_secs(5)).await;

    loop {
        sys.refresh_all();

        // CPU data
        let cpu_usage = sys.cpus()
            .iter()
            .map(|cpu| cpu.cpu_usage())
            .collect();

        // RAM data
        let ram_total = sys.total_memory() / 1000000000;
        let ram_used = sys.used_memory() / 1000000; // In MB

        // Disk data
        let disks = Disks::new_with_refreshed_list();
        let mut disks_used_space = Vec::new();

        for disk in disks.list() {
            // For linux we need to filter non-physical drives
            if is_initialized_disk(
                    disk.name(), 
                    &disk_register,
                    disk.mount_point()
                ) {
                disks_used_space.push(
                    (disk.total_space() - disk.available_space()) / 1000000000
                );
            }
        }

        // Network data
        networks.refresh();
        let mut interfaces = Vec::new();
        let mut network_received = 0;
        let mut network_transmitted = 0;
        for (_iface, data) in &networks {
            interfaces.push(_iface);
            network_received += (data.received() * 8) / 1000;
            network_transmitted += (data.transmitted() * 8) / 1000;
            // println!("Rec: {}", data.received());
            // println!("Transmit: {}", data.transmitted());
        }

        let uptime = System::uptime();

        let stats = SystemStats {
            data_type: 1,
            cpu_usage,
            ram_total,
            ram_used,
            disks_used_space,
            network_received,
            network_transmitted,
            uptime,
        };

        // let mut sys_processes = System::new_all();
        // std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        // sys_processes.refresh_processes_specifics(
        //     ProcessesToUpdate::All, 
        //     true,
        //     ProcessRefreshKind::new().with_cpu()
        // );

        // // Processes Data
        // for (_pid, process) in sys_processes.processes() {
        //     println!("Name: {:?}; Usage: {}", 
        //         process.name(),
        //         process.cpu_usage()
        //     );
        // }

        // Serialize stats to JSON
        let stats_json = serde_json::to_string(&stats).unwrap();

        // Send stats over WebSocket
        if let Err(e) = write.send(Message::Text(stats_json)).await {
            eprintln!("Error sending stats: {}", e);
            break;
        }

        time::sleep(Duration::from_secs(1)).await;
    }
}

#[tokio::main]
async fn main() { 
    // let addr = "127.0.0.1:8999";
    let addr = "0.0.0.0:8999";
    let listener = TcpListener::bind(&addr).await.expect("Failed to build");
    println!("WebSocket server listening on {}", addr);

    while let Ok((stream, addr)) = listener.accept().await {
        tokio::spawn(handle_connection(stream, addr));
    }
}
