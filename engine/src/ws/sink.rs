use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};

use futures::stream::SplitSink;
use futures::SinkExt;
use log::{debug, warn};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::{tungstenite::protocol::Message, WebSocketStream};

use crate::config;

/// The outbound half of one connection.
///
/// Several tasks write to the same socket (stats frames, log replies, container
/// output, keepalive pings), so the sink is shared and serialized here. Every
/// send is bounded by a timeout: a peer that stops reading must not be able to
/// wedge the tasks holding this lock.
pub struct ConnectionSink {
    addr: SocketAddr,
    write: Mutex<SplitSink<WebSocketStream<TcpStream>, Message>>,
    closed: AtomicBool,
}

impl ConnectionSink {
    pub fn new(addr: SocketAddr, write: SplitSink<WebSocketStream<TcpStream>, Message>) -> Self {
        Self {
            addr,
            write: Mutex::new(write),
            closed: AtomicBool::new(false),
        }
    }

    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::Acquire)
    }

    /// Sends a text frame. Returns `false` once the connection is unusable, at
    /// which point callers should stop producing for it.
    pub async fn send_text(&self, text: String) -> bool {
        self.send(Message::Text(text), "text").await
    }

    pub async fn send_ping(&self) -> bool {
        self.send(Message::Ping(Vec::new()), "ping").await
    }

    async fn send(&self, message: Message, kind: &str) -> bool {
        if self.is_closed() {
            return false;
        }

        let mut write = match timeout(config::SEND_TIMEOUT, self.write.lock()).await {
            Ok(write) => write,
            Err(_) => {
                warn!(
                    "Timed out waiting to send {} to {}, dropping connection",
                    kind, self.addr
                );
                self.closed.store(true, Ordering::Release);
                return false;
            }
        };

        match timeout(config::SEND_TIMEOUT, write.send(message)).await {
            Ok(Ok(())) => true,
            Ok(Err(e)) => {
                debug!("Send of {} to {} failed: {}", kind, self.addr, e);
                self.closed.store(true, Ordering::Release);
                false
            }
            Err(_) => {
                warn!(
                    "Client {} did not accept a {} frame within {:?}, dropping connection",
                    self.addr,
                    kind,
                    config::SEND_TIMEOUT
                );
                self.closed.store(true, Ordering::Release);
                false
            }
        }
    }

    /// Sends a close frame so the browser sees an orderly shutdown rather than
    /// a reset connection.
    pub async fn close(&self, reason: &'static str) {
        if self.closed.swap(true, Ordering::AcqRel) {
            return;
        }

        let frame = Message::Close(Some(CloseFrame {
            code: CloseCode::Away,
            reason: reason.into(),
        }));

        let mut write = match timeout(config::SEND_TIMEOUT, self.write.lock()).await {
            Ok(write) => write,
            Err(_) => {
                debug!("Timed out acquiring sink to close {}", self.addr);
                return;
            }
        };

        if let Err(e) = timeout(config::SEND_TIMEOUT, write.send(frame)).await {
            debug!("Timed out sending close frame to {}: {}", self.addr, e);
            return;
        }

        if let Err(e) = timeout(config::SEND_TIMEOUT, write.close()).await {
            debug!("Timed out closing sink for {}: {}", self.addr, e);
        }
    }
}
