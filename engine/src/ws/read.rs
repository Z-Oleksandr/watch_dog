use std::net::SocketAddr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use futures::stream::SplitStream;
use futures::StreamExt;
use log::{debug, info, warn};
use tokio::net::TcpStream;
use tokio_tungstenite::{tungstenite::protocol::Message, WebSocketStream};
use tokio_util::sync::CancellationToken;

use crate::docker_mon::send_containers::send_containers_list;
use crate::docker_mon::stream_container::{
    get_index_and_channel, stream_container, StreamRegistry,
};
use crate::logfiles::data::send_log_data;
use crate::logfiles::list::send_log_list;
use crate::ws::sink::ConnectionSink;
use crate::ws::{AppContext, IncomingMessage};

/// Reads client requests until the peer closes, the socket fails, or the
/// connection is cancelled.
pub async fn run(
    mut read: SplitStream<WebSocketStream<TcpStream>>,
    sink: Arc<ConnectionSink>,
    ctx: Arc<AppContext>,
    streams: Arc<StreamRegistry>,
    missed_pongs: Arc<AtomicU32>,
    connection: CancellationToken,
    addr: SocketAddr,
) {
    loop {
        let message = tokio::select! {
            _ = connection.cancelled() => break,
            message = read.next() => message,
        };

        let message = match message {
            Some(Ok(message)) => message,
            Some(Err(e)) => {
                debug!("Read from {} failed: {}", addr, e);
                break;
            }
            None => break,
        };

        match message {
            Message::Text(text) => {
                handle_text(&text, &sink, &ctx, &streams, addr).await;
            }
            // Any answer proves the peer is still there.
            Message::Pong(_) => {
                missed_pongs.store(0, Ordering::Release);
            }
            Message::Close(frame) => {
                info!("Client {} closed the connection: {:?}", addr, frame);
                break;
            }
            Message::Ping(_) | Message::Binary(_) | Message::Frame(_) => {
                debug!("Ignoring unsupported frame from {}", addr);
            }
        }
    }

    // The connection is finished; stop anything still producing for it.
    streams.stop_all().await;
    connection.cancel();
}

async fn handle_text(
    text: &str,
    sink: &Arc<ConnectionSink>,
    ctx: &Arc<AppContext>,
    streams: &Arc<StreamRegistry>,
    addr: SocketAddr,
) {
    let incoming = match serde_json::from_str::<IncomingMessage>(text) {
        Ok(incoming) => incoming,
        Err(e) => {
            warn!("Ignoring unparseable message from {}: {}", addr, e);
            return;
        }
    };

    debug!(
        "Request from {}: type {}, message {}",
        addr, incoming.r#type, incoming.message
    );

    match incoming.r#type.as_str() {
        "start_log" => {
            ctx.recorder.try_start(
                incoming.message,
                ctx.stats.clone(),
                &ctx.tracker,
                ctx.shutdown.clone(),
            );
        }
        "get_log_list" => {
            let sink = Arc::clone(sink);
            let log_index = Arc::clone(&ctx.log_index);
            ctx.tracker.spawn(async move {
                send_log_list(sink, log_index).await;
            });
        }
        "get_log_data" => {
            let sink = Arc::clone(sink);
            let log_index = Arc::clone(&ctx.log_index);
            let position = incoming.message as u32;
            ctx.tracker.spawn(async move {
                send_log_data(position, sink, log_index).await;
            });
        }
        "get_containers" => {
            let sink = Arc::clone(sink);
            let docker = Arc::clone(&ctx.docker);
            ctx.tracker.spawn(async move {
                // Refreshed on demand so the panel never shows a list that went
                // stale while the page was open.
                docker.refresh_containers().await;
                send_containers_list(sink, docker).await;
            });
        }
        "start_container_output" => {
            start_container_output(incoming, sink, ctx, streams).await;
        }
        "stop_container_output" => {
            streams.stop(incoming.message as u32).await;
        }
        other => warn!("Unknown message type {:?} from {}", other, addr),
    }
}

async fn start_container_output(
    incoming: IncomingMessage,
    sink: &Arc<ConnectionSink>,
    ctx: &Arc<AppContext>,
    streams: &Arc<StreamRegistry>,
) {
    let encoded = incoming.message.to_string();
    let (container_index, channel) = match get_index_and_channel(&encoded) {
        Some(pair) => pair,
        None => {
            warn!(
                "Could not read a container index and channel from {:?}",
                encoded
            );
            return;
        }
    };

    let token = match streams.start(channel).await {
        Some(token) => token,
        None => return,
    };

    let sink = Arc::clone(sink);
    let docker = Arc::clone(&ctx.docker);
    let streams = Arc::clone(streams);

    ctx.tracker.spawn(async move {
        stream_container(sink, docker, container_index, channel, token).await;
        streams.forget(channel).await;
    });
}
