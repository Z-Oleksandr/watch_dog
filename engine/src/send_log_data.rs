use std::{ 
    fs::metadata, sync::Arc,
    collections::HashMap,
};
use tokio::{
    net::TcpStream,
    sync::Mutex, fs::read_to_string,
};
use tokio_tungstenite::{
    tungstenite::protocol::Message, 
    WebSocketStream
};
use serde::{Serialize, Deserialize};
use futures::{SinkExt, stream::SplitSink};

#[derive(Serialize, Deserialize)]
struct CpuData {
    time_stamp: String,
    value: f64,
}

#[derive(Serialize, Deserialize)]
struct RamData {
    time_stamp: String,
    value: u64,
}

#[derive(Serialize, Deserialize)]
struct NetworkData {
    time_stamp: String,
    value: u64,
}

#[derive(Serialize, Deserialize)]
struct CnrData {
    cpu: Vec<CpuData>,
    ram: Vec<RamData>,
}

#[derive(Serialize, Deserialize)]
struct NetData {
    network: NetworkInfo,
}

#[derive(Serialize, Deserialize)]
struct NetworkInfo {
    down: Vec<NetworkData>,
    up: Vec<NetworkData>,
}

pub async fn send_log_data(
    log_position: u32,
    write: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    log_list: Arc<Mutex<HashMap<u32, String>>>
) {
    let log_dir = "../logs/";

    let log_list = log_list.lock().await;

    if let Some(timestamp) = log_list.get(&log_position) {
        let cnr_file_path = format!("{}cnr_{}.json", log_dir, timestamp);
        let net_file_path = format!("{}net_{}.json", log_dir, timestamp);

        if metadata(&cnr_file_path).is_ok() && metadata(&net_file_path).is_ok() {
            let cnr_content = read_to_string(
                &cnr_file_path
            ).await.unwrap_or_else(|_| "{}".to_string());
            let net_content = read_to_string(
                &net_file_path
            ).await.unwrap_or_else(|_| "{}".to_string());

            let cnr_data: CnrData = serde_json::from_str(&cnr_content)
                .unwrap_or(CnrData {
                    cpu: vec![],
                    ram: vec![],
                });
            
            let net_data: NetData = serde_json::from_str(&net_content)
                .unwrap_or(NetData{
                    network: NetworkInfo {
                        down: vec![],
                        up: vec![],
                    },
                });

            let response = serde_json::json!({
                "data_type": 4,
                "cnr_data": cnr_data,
                "net_data": net_data,
            });

            let mut write = write.lock().await;
            if let Err(e) = write.send(
                Message::Text(response.to_string())
            ).await {
                eprintln!("Error sending log data: {}", e);
            }
        } else {
            eprintln!("No log files found for timestamp: {}", timestamp);
        }
    } else {
        eprintln!("Invalid log position: {}", log_position);
    }
}