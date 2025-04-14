use serde_json::json;
use std::{collections::BTreeMap, sync::Arc};
use tokio::{sync::Mutex, net::TcpStream};
use futures::{SinkExt, stream::SplitSink};
use tokio_tungstenite::{
    tungstenite::protocol::Message, 
    WebSocketStream
};

use super::CONTAINER_REGISTER;

pub async fn send_containers_list(
    write: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>
) {
    let container_reg = CONTAINER_REGISTER.lock().await;

    let mut container_map: BTreeMap<u32, String> = BTreeMap::new();

    for (index, container) in container_reg.iter() {
        let name = container
            .names
            .get(0)
            .map(|s| s.trim_start_matches("/").to_string())
            .unwrap_or_else(|| "unkown".to_string());

        container_map.insert(*index, name);
    }

    let payload = json!(
        {
            "data_type": 5,
            "list": container_map
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