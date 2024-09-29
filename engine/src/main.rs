use std::{collections::HashMap, net::SocketAddr, time::Duration};
use sysinfo::{NetworkData, Networks, Process, System, Components, Disks};
use tokio::{net::{TcpListener, TcpStream}, time};
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};
use serde::{Serialize};
use futures::{StreamExt, SinkExt};

#[derive(Serialize)]
struct SystemStats {
    cpu_usage: f32,
    ram_total: u64,
    ram_used: u64,
    disk_total: u64,
    disk_used: u64,
    network_received: u64,
    network_transmitted: u64,
}

async fn handle_connection(raw_stream: TcpStream, addr: SocketAddr) {
    println!("New Socket connection: {}", addr);

    let ws_stream = accept_async(raw_stream).await.expect("Failed to accept");

    // Split ws stream into sender and receiver
    let (mut write, _) = ws_stream.split();

    let mut sys = System::new_all();

    loop {
        sys.refresh_all();

        let cpu_usage = sys.global_cpu_usage();
        let ram_total = sys.total_memory();
        let ram_used = sys.used_memory();

        // For now just one disk
        let disks = Disks::new_with_refreshed_list();
        let disk = disks.get(0).expect("No disk found");
        let disk_total = disk.total_space();
        let disk_available = disk.available_space();
        let disk_used = disk_total - disk_available;

        let networks = Networks::new_with_refreshed_list();
        let mut net_received = 0;
        let mut net_transmitted = 0;
        for (_iface, data) in &networks {
            net_received += data.total_received();
            net_transmitted += data.total_transmitted();
        }

        let stats = SystemStats {
            cpu_usage,
            ram_total,
            ram_used,
            disk_total,
            disk_used,
            network_received: net_received,
            network_transmitted: net_transmitted,
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
    let addr = "127.0.0.1:8999";
    let listener = TcpListener::bind(&addr).await.expect("Failed to build");
    println!("WebSocket server listening on {}", addr);

    while let Ok((stream, addr)) = listener.accept().await {
        tokio::spawn(handle_connection(stream, addr));
    }

    // Testing values
    let mut sys = System::new_all();

    sys.refresh_all();

    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();

    let mut sys_info = HashMap::from([
        ("name", System::name()),
        ("kernel", System::kernel_version()),
        ("os", System::os_version()),
        ("host", System::host_name()),
        ("nb_cpu", Some(sys.cpus().len().to_string())),
    ]);

    // Display all disk info:
    println!("=> disks:");
    let disks = Disks::new_with_refreshed_list();
    for disk in &disks {
        println!("{disk:?}");
    }

    // Network interface name, total data received and transmitted:
    println!("=> networks:");
    let networks = Networks::new_with_refreshed_list();
    for (interface_name, data) in &networks {
        println!(
            "{interface_name}: {} B (down) / {} B (up)",
            data.total_received(),
            data.total_transmitted(),
        );
    }

    // RAM:
    println!("=> RAM:");
    let total_mem = sys.total_memory() / 1000000;
    let used_mem = sys.used_memory() / 1000000;
    println!("Total: {} MB", total_mem);
    println!("Used: {} MB", used_mem);

    // Components temp:
    let components = Components::new_with_refreshed_list();
    println!("=> components:");
    for component in &components {
        println!("{component:?}");
    }

    // CPU usage:
    // loop {
    //     println!("CPU use rate: ");
    //     sys.refresh_cpu_all();
    //     for cpu in sys.cpus() {
    //         println!("{}%", cpu.cpu_usage());
    //     }

    //     std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    //     clearscreen::clear().unwrap();
    // }
    println!("CPUS:");
    sys.refresh_cpu_all();
    println!("{:#?}", sys.cpus());
    println!("CPU use rate: ");
    sys.refresh_cpu_all();
    for cpu in sys.cpus() {
        println!("{}%", cpu.cpu_usage());
    }
}
