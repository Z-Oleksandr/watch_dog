use bollard::{Docker, container::LogsOptions, API_DEFAULT_VERSION};
use serde_json::json;
use std::{collections::BTreeMap, sync::Arc};
use tokio::{sync::Mutex, net::TcpStream};
use futures::{stream::SplitSink, SinkExt, TryStreamExt};
use tokio_tungstenite::{
    tungstenite::protocol::Message, 
    WebSocketStream
};

use super::{CONTAINER_REGISTER, Container};

// message should container index and channel over wich to stream the output,
// seperated with "99899" sequence
pub async fn stream_container(
    write: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    message: String
) {
    let (container_index, channel) = if let Some(
        (container_index, channel)
    ) = get_index_and_channel(&message) {
        (container_index, channel)
    } else {
        eprintln!("Error parsing container message: {}", &message);
        return;
    };

    let container = if let Some(container) = get_container_from_reg(container_index).await {
        container
    } else {
        eprintln!("Container not found! ID: {}", container_index);
        return;
    };

    // let docker = Docker::connect_with_socket_defaults()
    //     .expect("Failed to connect to local Docker");
    // For dev  

    let docker = Docker::connect_with_http(
        "http://192.168.0.116:2375", 
        4, 
        API_DEFAULT_VERSION)
        .expect("Failed to connect to Docker Dev");

    let mut latest_logs = docker.logs(
        &container.id,
        Some(LogsOptions::<String> {
            follow: false, 
            stdout: true, 
            stderr: true,
            timestamps: true,
            tail: "100".into(),
            ..Default::default()
        }),
    );

    while let Ok(log_result) = latest_logs.try_next().await {
        if let Some(log_output) = log_result {
            let log_str = log_output.to_string();
            send_log_line(log_str, write.clone(), channel).await;
        }
    }

    let mut live_logs = docker.logs(
        &container.id,
        Some(LogsOptions::<String> {
            follow: true,
            stdout: true,
            stderr: true,
            timestamps: true,
            tail: "0".into(),
            ..Default::default()
        }),
    );


    while let Ok(log_result) = live_logs.try_next().await {
        if let Some(log_output) = log_result {
            let log_str = log_output.to_string();
            send_log_line(log_str, write.clone(), channel).await;
        }
    }
}

async fn send_log_line(
    log_str: String, 
    write: Arc<Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>>,
    channel: u32
) {
    let payload = json!(
        {
            "data_type": channel,
            "log_line": log_str
        }
    );
    match serde_json::to_string(&payload) {
        Ok(json_string) => {
            let mut write = write.lock().await;
            if let Err(e) = write.send(Message::Text(json_string)).await {
                eprintln!("log_line send failed: {}", e);
            }
        },
        Err(e) => {
            eprintln!("log_line serialize failed: {}", e);
        }
    }
}

async fn get_container_from_reg(index: u32) -> Option<Container> {
    let container_reg = CONTAINER_REGISTER.lock().await;
    container_reg.get(&index).cloned()
}

fn get_index_and_channel(message: &str) -> Option<(u32, u32)> {
    let key = "99899";
    if let Some(pos) = message.find(key) {
        let container_index = &message[..pos];
        let channel = &message[pos + key.len()..];

        let container_index_str = if container_index.is_empty() {0} else {container_index.parse().ok()?};
        let channel_str = if channel.is_empty() {0} else {channel.parse().ok()?};

        Some((container_index_str, channel_str))
    } else {
        None
    }
}
