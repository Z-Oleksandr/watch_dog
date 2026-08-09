use std::net::SocketAddr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use futures::StreamExt;
use log::{debug, info, warn};
use tokio::net::TcpStream;
use tokio::sync::broadcast::error::RecvError;
use tokio::time::{interval, timeout, MissedTickBehavior};
use tokio_tungstenite::accept_async_with_config;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_util::sync::CancellationToken;

use crate::config;
use crate::docker_mon::stream_container::StreamRegistry;
use crate::sampler::StatsReceiver;
use crate::ws::read;
use crate::ws::sink::ConnectionSink;
use crate::ws::AppContext;

/// Serves one browser: static payloads first, then the shared stats stream.
pub async fn handle(raw_stream: TcpStream, addr: SocketAddr, ctx: Arc<AppContext>) {
    let permit = match Arc::clone(&ctx.connection_slots).try_acquire_owned() {
        Ok(permit) => permit,
        Err(_) => {
            warn!(
                "Refusing connection from {}: already serving the maximum of {} clients",
                addr,
                config::MAX_CONNECTIONS
            );
            return;
        }
    };

    let ws_config = WebSocketConfig {
        max_message_size: Some(config::MAX_MESSAGE_SIZE),
        max_frame_size: Some(config::MAX_MESSAGE_SIZE),
        ..Default::default()
    };

    let ws_stream = match accept_async_with_config(raw_stream, Some(ws_config)).await {
        Ok(ws_stream) => ws_stream,
        Err(e) => {
            warn!("WebSocket handshake with {} failed: {}", addr, e);
            return;
        }
    };

    info!("New socket connection: {}", addr);

    let (write, read_half) = ws_stream.split();
    let sink = Arc::new(ConnectionSink::new(addr, write));
    let connection = ctx.shutdown.child_token();
    let streams = Arc::new(StreamRegistry::new());
    let missed_pongs = Arc::new(AtomicU32::new(0));

    // Subscribing before the static payloads go out means the sampler is
    // already running during the boot window, so the first frame this client
    // actually sees covers a full interval instead of being empty.
    let receiver = ctx.stats.subscribe();

    ctx.tracker.spawn(read::run(
        read_half,
        Arc::clone(&sink),
        Arc::clone(&ctx),
        Arc::clone(&streams),
        Arc::clone(&missed_pongs),
        connection.clone(),
        addr,
    ));

    ctx.tracker.spawn(ping_loop(
        Arc::clone(&sink),
        Arc::clone(&missed_pongs),
        connection.clone(),
        addr,
    ));

    serve(&ctx, &sink, receiver, &connection, addr).await;

    streams.stop_all().await;
    connection.cancel();
    sink.close("engine closing connection").await;
    drop(permit);
    info!("Connection with {} closed", addr);
}

async fn serve(
    ctx: &Arc<AppContext>,
    sink: &Arc<ConnectionSink>,
    mut receiver: StatsReceiver,
    connection: &CancellationToken,
    addr: SocketAddr,
) {
    // The front-end builds its gauges from this message and indexes every later
    // reading against it, so it must be the first thing the client receives.
    if !sink
        .send_text(ctx.topology.system_data_json.to_string())
        .await
    {
        return;
    }

    let system_info = ctx.info_template.snapshot();
    let system_info_json = match serde_json::to_string(&system_info) {
        Ok(json) => json,
        Err(e) => {
            warn!("Failed to serialize system info for {}: {}", addr, e);
            return;
        }
    };

    if !sink.send_text(system_info_json).await {
        return;
    }

    // The panel runs a 5 s boot animation that the first stats frame cuts
    // short, so the stream is held back for exactly that long.
    tokio::select! {
        _ = connection.cancelled() => return,
        _ = tokio::time::sleep(config::CLIENT_STREAM_DELAY) => {}
    }

    // Frames produced during the boot window are stale by now.
    while receiver.try_recv().is_ok() {}

    let mut lag_events: u32 = 0;

    loop {
        let snapshot = tokio::select! {
            _ = connection.cancelled() => return,
            received = receiver.recv() => received,
        };

        match snapshot {
            Ok(snapshot) => {
                if !sink.send_text(snapshot.json.to_string()).await {
                    return;
                }
            }
            Err(RecvError::Lagged(skipped)) => {
                lag_events += 1;
                warn!(
                    "Client {} fell behind and lost {} frame(s) ({} lag event(s))",
                    addr, skipped, lag_events
                );
                if lag_events > config::MAX_LAG_EVENTS {
                    warn!("Client {} cannot keep up, dropping connection", addr);
                    return;
                }
            }
            Err(RecvError::Closed) => {
                debug!("Stats stream closed, ending the stream to {}", addr);
                return;
            }
        }
    }
}

/// Keeps the connection honest: a client that stops answering pings is dropped
/// instead of being fed frames forever.
async fn ping_loop(
    sink: Arc<ConnectionSink>,
    missed_pongs: Arc<AtomicU32>,
    connection: CancellationToken,
    addr: SocketAddr,
) {
    let mut ticker = interval(config::PING_INTERVAL);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    // `interval` fires immediately; the first ping belongs one period out.
    ticker.tick().await;

    loop {
        tokio::select! {
            _ = connection.cancelled() => return,
            _ = ticker.tick() => {}
        }

        if missed_pongs.load(Ordering::Acquire) >= config::MAX_MISSED_PONGS {
            warn!(
                "Client {} missed {} keepalive pongs, dropping connection",
                addr,
                config::MAX_MISSED_PONGS
            );
            break;
        }

        missed_pongs.fetch_add(1, Ordering::AcqRel);

        match timeout(config::PING_INTERVAL, sink.send_ping()).await {
            Ok(true) => {}
            Ok(false) => break,
            Err(_) => {
                warn!("Keepalive ping to {} timed out", addr);
                break;
            }
        }
    }

    connection.cancel();
}
