use sysinfo::{Networks, System};
use tokio::{
    net::{TcpListener, TcpStream}, time,
    sync::Mutex, fs::read_to_string,
};
use tokio_tungstenite::{
    accept_async, tungstenite::protocol::Message, 
    WebSocketStream
};
use serde::{Serialize, Deserialize};
use futures::{StreamExt, SinkExt, stream::{SplitStream, SplitSink}};
use walkdir::WalkDir;

mod helpers;
use helpers::ensure_dir;

mod system_info;
use system_info::{get_system_data, get_system_info};

mod system_stats;
use system_stats::get_system_stats;

mod logger;
use logger::log_stats;

mod send_log_data;
use send_log_data::send_log_data;

mod demo_system;

// Randomness
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

async fn handle_connection(
    raw_stream: TcpStream, 
    addr: SocketAddr,
    log_list: Arc<Mutex<HashMap<u32, String>>>
) {
    println!("New Socket connection: {}", addr);

    let mut rng = ChaCha20Rng::from_entropy();

    let ws_stream = accept_async(raw_stream)
        .await
        .expect("Failed to accept");

    let (mut write, _) = ws_stream.split();

    let mut disks_space = Vec::new();
    let mut disk_count: u32 = 0;

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
}

#[tokio::main]
async fn main() { 
    let addr = "0.0.0.0:8998";
    let listener = TcpListener::bind(&addr).await.expect("Failed to build");
    println!("WebSocket server listening on {}", addr);

    let log_list: Arc<Mutex<HashMap<u32, String>>> = Arc::new(
        Mutex::new(HashMap::new())
    );

    while let Ok((stream, addr)) = listener.accept().await {
        let log_list_clone = Arc::clone(&log_list);
        tokio::spawn(handle_connection(
            stream, 
            addr,
            log_list_clone
        ));
    }
}
