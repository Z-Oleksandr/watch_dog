use std::{collections::{HashMap, HashSet}, net::SocketAddr, time::Duration};
use sysinfo::{Networks, System, Components, Disks};
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
}

#[derive(Serialize)]
struct SystemData {
    data_type: u32,
    num_cpus: usize,
    num_disks: u32,
    disks_space: Vec<u64>,
    init_ram_total: u64,
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
        let ram_used = sys.used_memory() / 1000000000;

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

        let stats = SystemStats {
            data_type: 1,
            cpu_usage,
            ram_total,
            ram_used,
            disks_used_space,
            network_received,
            network_transmitted,
        };

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
