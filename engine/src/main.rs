use std::{net::SocketAddr, time::Duration};
use sysinfo::{Networks, System};
use tokio::{net::{TcpListener, TcpStream}, time};
use tokio_tungstenite::{
    accept_async, tungstenite::protocol::Message, 
    WebSocketStream
};
use serde::{Serialize, Deserialize};
use futures::{StreamExt, SinkExt, stream::SplitStream};

mod helpers;

mod system_info;
use system_info::{get_system_data, get_system_info, DISK_REGISTER};

mod system_stats;
use system_stats::get_system_stats;

#[derive(Deserialize, Debug)]
struct IncomingMessage {
    r#type: String,
    message: String,
}

async fn handle_read(mut read:SplitStream<WebSocketStream<TcpStream>>) {
    // Read message
    while let Some(Ok(msg)) = read.next().await {
        if let Ok(text) = msg.to_text() {
            if let Ok(incoming_msg) = serde_json::from_str::<IncomingMessage>(text) {
                println!("Received: {:?}", incoming_msg);
            }
        }
    }
}

async fn handle_connection(raw_stream: TcpStream, addr: SocketAddr) {
    println!("New Socket connection: {}", addr);

    let ws_stream = accept_async(raw_stream)
        .await
        .expect("Failed to accept");

    // Split ws stream into sender and receiver
    let (mut write, mut read) = ws_stream.split();

    tokio::spawn(handle_read(read));

    // Send static system data
    let system_data_json = serde_json::to_string(
        &get_system_data()
    ).unwrap();

    write.send(Message::Text(system_data_json))
        .await.expect("Error sending static data");

    // Send general system info
    let system_info_json = serde_json::to_string(
        &get_system_info()
    ).unwrap();

    write.send(Message::Text(system_info_json))
        .await.expect("Error sending system info");

    time::sleep(Duration::from_secs(5)).await;

    let mut sys = System::new_all();
    let mut networks = Networks::new_with_refreshed_list();

    // Live System Stats stream
    loop {
        // Serialize stats to JSON
        let stats_json = serde_json::to_string(
            &get_system_stats(&mut sys, &mut networks)
        ).unwrap();

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
