use serde::Serialize;
use serde_json::json;
use std::sync::Arc;
use tokio::{sync::Mutex, net::TcpStream};
use futures::{SinkExt, stream::SplitSink};
use tokio_tungstenite::{
    tungstenite::protocol::Message, 
    WebSocketStream
};

use super::CONTAINER_REGISTER;

#[derive(Serialize)]
struct ContainerInfo {
    index: u32,
    name: String,
}

pub async fn send_containers_list(
    write: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>
) {
    let container_reg = CONTAINER_REGISTER.lock().await;

    let list: Vec<ContainerInfo> = container_reg
        .iter()
        .map(|(index, container)| {
            let name = container
                .names
                .get(0)
                .map(|s| s.trim_start_matches('/').to_string())
                .unwrap_or_else(|| "unknown".to_string());

            ContainerInfo {
                index: *index,
                name,
            }
        }).collect();

    let payload = json!(
        {
            "data_type": 5,
            "list": &list
        }
    );

    match serde_json::to_string(&payload) {
        Ok(json_string) => {
            let mut write = write.lock().await;
            if let Err(e) = write.send(Message::Text(json_string)).await {
                eprintln!("Container list send failed: {}", e);
            }
        },
        Err(e) => {
            eprintln!("Container list serialize failed: {}", e);
        }
    }
}