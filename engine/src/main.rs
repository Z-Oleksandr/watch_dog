use std::{
    net::SocketAddr, time::Duration, 
    fs::metadata, sync::Arc,
    collections::HashMap,
};
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

mod send_log_data;
use send_log_data::send_log_data;

mod demo_system;
use demo_system::init_demo_system;

// Randomness
use rand_chacha::{rand_core::SeedableRng, ChaCha20Rng};
use rand::Rng;

#[derive(Deserialize, Debug)]
struct IncomingMessage {
    r#type: String,
    message: u64,
}

#[derive(Serialize)]
struct LogListStruct {
    data_type: u32,
    log_list: HashMap<u32, String>,
}

async fn handle_read(
    mut read:SplitStream<WebSocketStream<TcpStream>>,
    write: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    log_list: Arc<Mutex<HashMap<u32, String>>>
) {
    // Read message
    while let Some(Ok(msg)) = read.next().await {
        if let Ok(text) = msg.to_text() {
            if let Ok(incoming_msg) = serde_json::from_str::<IncomingMessage>(text) {
                println!("Received Message!");
                println!(
                    "Type: {}, \nMessage: {}", 
                    incoming_msg.r#type, 
                    incoming_msg.message
                );
                match incoming_msg.r#type.as_str() {
                    "start_log" => start_log(incoming_msg.message),
                    "get_log_list" => {
                        let write_clone = Arc::clone(&write);
                        let log_list_clone = Arc::clone(&log_list);
                        tokio::spawn(
                            async move {
                                send_log_list(
                                    write_clone,
                                    log_list_clone
                                ).await;
                            }
                        );
                    },
                    "get_log_data" => {
                        let write_clone = Arc::clone(&write); 
                        let log_list_clone = Arc::clone(&log_list);
                        tokio::spawn(
                            async move {
                                send_log_data(
                                    incoming_msg.message as u32, 
                                    write_clone, 
                                    log_list_clone
                                ).await
                            }
                        );
                    }
                    _ => println!("Unknown message type"),
                };
            }
        }
    }
}

fn start_log(_time: u64) {
    println!("Pretend to start log");
}

async fn send_log_list(
    write: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    log_list: Arc<Mutex<HashMap<u32, String>>>
) {
    let log_dir = "../logs/";
    match ensure_dir(&log_dir) {
        Ok(_) => {},
        Err(e) => println!("Something wrong with the log dir: {}", e),
    };

    let mut new_log_list: HashMap<u32, String> = HashMap::new();
    let mut index = 0;

    for entry in WalkDir::new(log_dir) {
        match entry {
            Ok(entry) => {
                if metadata(entry.path()).expect("Metadata error").is_file() {
                    let file_name = entry.file_name().to_string_lossy().into_owned();
                    if file_name.starts_with("cnr_") && file_name.ends_with(".json") {
                        let trimmed_name = file_name
                            .strip_prefix("cnr_")
                            .and_then(|name| name.strip_suffix(".json"))
                            .unwrap();
                        new_log_list.insert(
                            index,
                            trimmed_name.to_string()
                        );
                        index += 1;
                    }
                }
            },
            Err(e) => eprintln!("Error getting log list: {}", e),
        }
    }

    {
        let mut log_list = log_list.lock().await;
        *log_list = new_log_list.clone();
    }

    let log_list_struct = LogListStruct {
        data_type: 3,
        log_list: new_log_list
    };

    let log_list_json = serde_json::to_string(&log_list_struct)
        .expect("Failed to serialize log list");

    let mut write = write.lock().await;
    if let Err(e) = write.send(Message::Text(log_list_json)).await {
        eprintln!("Failed to send log list: {}", e);
    }
}

async fn handle_connection(
    raw_stream: TcpStream, 
    addr: SocketAddr,
    log_list: Arc<Mutex<HashMap<u32, String>>>
) {
    println!("New Socket connection: {}", addr);

    let ws_stream = accept_async(raw_stream)
        .await
        .expect("Failed to accept");

    // Split ws stream into sender and receiver
    let (mut write, mut read) = ws_stream.split();

    let write = Arc::new(Mutex::new(write));

    let write_clone = Arc::clone(&write);

    tokio::spawn(async move {
        handle_read(read, write_clone, log_list).await;
    });

    // Send static system data
    let system_data_json = serde_json::to_string(
        &get_system_data()
    ).unwrap();

    {
        let mut write = write.lock().await;
        write
            .send(Message::Text(system_data_json))
            .await
            .expect("Error sending static data");
    }

    // Send general system info
    let system_info_json = serde_json::to_string(
        &get_system_info()
    ).unwrap();

    {
        let mut write = write.lock().await;
        write
            .send(Message::Text(system_info_json))
            .await
            .expect("Error sending system info");
    }

    time::sleep(Duration::from_secs(5)).await;

    // Live System Stats stream
    let mut loop_counter: u64 = 0;
    loop {
        // Serialize stats to JSON
        let stats_json = serde_json::to_string(
            &get_system_stats(loop_counter)
        ).unwrap();

        // Send stats over WebSocket
        {
            let mut write = write.lock().await;
            if let Err(e) = write.send(Message::Text(stats_json)).await {
                eprintln!("Error sending stats: {}", e);
                break;
            }
        }
        loop_counter += 1;
        time::sleep(Duration::from_secs(1)).await;
    }
}

#[tokio::main]
async fn main() { 
    let addr = "0.0.0.0:8998";
    let listener = TcpListener::bind(&addr).await.expect("Failed to build");
    println!("WebSocket server listening on {}", addr);

    demo_system::init_demo_system();

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
