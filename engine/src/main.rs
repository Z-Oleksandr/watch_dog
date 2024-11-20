use std::{net::SocketAddr, time::Duration};
use tokio::{net::{TcpListener, TcpStream}, time};
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};
use serde::Serialize;
use futures::{StreamExt, SinkExt};
use rand_chacha::{rand_core::SeedableRng, ChaCha20Rng};
use rand::Rng;

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

    let mut rng = ChaCha20Rng::from_entropy();

    let ws_stream = accept_async(raw_stream)
        .await
        .expect("Failed to accept");

    let (mut write, _) = ws_stream.split();

    let mut disks_space = Vec::new();
    let mut disk_count: u32 = 0;

    let disks_used_space: Vec<u64> = (0..3)
        .map(|_| rng.gen_range(0..250))
        .collect();

    for _i in 0..3 {
        disks_space.push(rng.gen_range(250..=3000));
        disk_count += 1;
    }

    let ram_total = rng.gen_range(1..=8) * 4;

    let system_data = SystemData {
        data_type: 0,
        num_cpus: 4,
        num_disks: disk_count,
        disks_space,
        init_ram_total: ram_total,
    };

    let system_data_json = serde_json::to_string(&system_data).unwrap();
    write.send(Message::text(system_data_json))
        .await.expect("Error sending static data");

    // Prepare SystemInfo
    let system_name = "Demo system".to_string();

    let kernel_version = "4.20.69".to_string();

    let cpu_arch = "Demo system arch".to_string();

    let os_version = "12345.77".to_string();

    let host_name = "seraphim".to_string();

    let mut uptime: u64 = 123456789;

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

    let mut loop_counter = 0;

    let mut cpu_usage: Vec<f32> = vec![15.0, 16.0, 17.0, 18.0];
    let mut ram_used = ((ram_total * 1000) as f64 * 0.42);
    let mut network_received = 0;
    let mut network_transmitted = 0;

    loop {
        if loop_counter % 2 == 0 || loop_counter == 0 {
            cpu_usage = cpu_usage
                .iter()
                .map(|usage| (usage * rng.gen_range(0.5..=1.5)).min(100.0))
                .collect();
            ram_used = (ram_used * rng.gen_range(0.5..=1.5)).min(ram_total as f64);
        }

        network_received = 0;
        network_transmitted = 0;
        if loop_counter % 10 == 0 {
            network_received += rng.gen_range(0..900000);
            network_transmitted += rng.gen_range(0..900000);
        }

        uptime += 1;

        let stats = SystemStats {
            data_type: 1,
            cpu_usage: cpu_usage.clone(),
            ram_total,
            ram_used: ram_used as u64,
            disks_used_space: disks_used_space.clone(),
            network_received,
            network_transmitted,
            uptime
        };

        let stats_json = serde_json::to_string(&stats).unwrap();

        if let Err(e) = write.send(Message::Text(stats_json)).await {
            eprintln!("Error sending stats: {}", e);
            break;
        }

        loop_counter += 1;
        time::sleep(Duration::from_secs(1)).await;
    }
}

#[tokio::main]
async fn main() {
    let addr = "0.0.0.0:8998";
    let listener = TcpListener::bind(&addr).await.expect("Failed to bind");
    println!("WebSocket server listening on {}", addr);

    while let Ok((stream, addr)) = listener.accept().await {
        tokio::spawn(handle_connection(stream, addr));
    }
}
