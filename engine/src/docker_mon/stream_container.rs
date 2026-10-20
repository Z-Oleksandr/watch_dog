use std::collections::HashMap;
use std::sync::Arc;

use bollard::container::LogsOptions;
use futures::TryStreamExt;
use log::{debug, error, info, warn};
use serde_json::json;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use super::DockerMonitor;
use crate::ws::sink::ConnectionSink;

/// Streams currently running for one connection.
///
/// This is per connection rather than global so that two browsers can follow
/// the same container independently, and so every stream is dropped when its
/// connection closes.
pub struct StreamRegistry {
    streams: Mutex<HashMap<u32, CancellationToken>>,
}

impl StreamRegistry {
    pub fn new() -> Self {
        Self {
            streams: Mutex::new(HashMap::new()),
        }
    }

    /// Registers a stream for `channel`, returning its cancellation token.
    /// Returns `None` when a stream is already running on that channel.
    pub async fn start(&self, channel: u32) -> Option<CancellationToken> {
        let mut streams = self.streams.lock().await;
        if streams.contains_key(&channel) {
            debug!("Stream already running for channel {}", channel);
            return None;
        }
        let token = CancellationToken::new();
        streams.insert(channel, token.clone());
        Some(token)
    }

    pub async fn stop(&self, channel: u32) -> bool {
        match self.streams.lock().await.remove(&channel) {
            Some(token) => {
                token.cancel();
                info!("Cancelled container stream on channel {}", channel);
                true
            }
            None => {
                debug!("No stream active on channel {}", channel);
                false
            }
        }
    }

    /// Drops a finished stream without cancelling, used when the stream ends by
    /// itself.
    pub async fn forget(&self, channel: u32) {
        self.streams.lock().await.remove(&channel);
    }

    pub async fn stop_all(&self) {
        let mut streams = self.streams.lock().await;
        for (channel, token) in streams.drain() {
            token.cancel();
            debug!(
                "Cancelled container stream on channel {} during cleanup",
                channel
            );
        }
    }
}

/// Sends the tail of a container's log, then follows it live, until the client
/// cancels or the connection goes away.
pub async fn stream_container(
    sink: Arc<ConnectionSink>,
    docker: Arc<DockerMonitor>,
    container_index: u32,
    channel: u32,
    cancel_token: CancellationToken,
) {
    let container = match docker.container(container_index).await {
        Some(container) => container,
        None => {
            warn!("Container not found for index {}", container_index);
            return;
        }
    };

    let client = match docker.client() {
        Some(client) => client.clone(),
        None => {
            warn!("Container stream requested but Docker is unavailable");
            return;
        }
    };

    let tail = LogsOptions::<String> {
        follow: false,
        stdout: true,
        stderr: true,
        timestamps: true,
        tail: "100".into(),
        ..Default::default()
    };

    if !forward_logs(&client, &container.id, tail, &sink, channel, &cancel_token).await {
        return;
    }

    let live = LogsOptions::<String> {
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: true,
        tail: "0".into(),
        ..Default::default()
    };

    forward_logs(&client, &container.id, live, &sink, channel, &cancel_token).await;
}

/// Returns `false` when the stream was cancelled or the client went away.
async fn forward_logs(
    client: &bollard::Docker,
    container_id: &str,
    options: LogsOptions<String>,
    sink: &ConnectionSink,
    channel: u32,
    cancel_token: &CancellationToken,
) -> bool {
    let mut logs = client.logs(container_id, Some(options));

    loop {
        let next = tokio::select! {
            _ = cancel_token.cancelled() => {
                debug!("Container stream on channel {} cancelled", channel);
                return false;
            }
            next = logs.try_next() => next,
        };

        match next {
            Ok(Some(output)) => {
                if !send_log_line(output.to_string(), sink, channel).await {
                    return false;
                }
            }
            Ok(None) => return true,
            Err(e) => {
                error!("Docker log stream on channel {} failed: {}", channel, e);
                return false;
            }
        }
    }
}

/// Returns `false` when the line could not be delivered.
async fn send_log_line(log_str: String, sink: &ConnectionSink, channel: u32) -> bool {
    let payload = json!({
        "data_type": channel,
        "log_line": log_str,
    });

    let json_string = match serde_json::to_string(&payload) {
        Ok(json_string) => json_string,
        Err(e) => {
            error!("Failed to serialize container log line: {}", e);
            return true;
        }
    };

    sink.send_text(json_string).await
}

/// Client requests encode the container index and the channel to answer on,
/// separated by the literal `99899`.
pub fn get_index_and_channel(message: &str) -> Option<(u32, u32)> {
    let key = "99899";
    let pos = message.find(key)?;

    let container_index = &message[..pos];
    let channel = &message[pos + key.len()..];

    let container_index = if container_index.is_empty() {
        0
    } else {
        container_index.parse().ok()?
    };
    let channel = if channel.is_empty() {
        0
    } else {
        channel.parse().ok()?
    };

    Some((container_index, channel))
}

#[cfg(test)]
mod tests {
    use super::*;

    // The panel encodes a request as `<index>99899<channel>`, where the channel
    // is the index with its digits doubled: index 2 -> channel 22.
    #[test]
    fn parses_index_and_channel() {
        assert_eq!(get_index_and_channel("29989922"), Some((2, 22)));
        assert_eq!(get_index_and_channel("10998991010"), Some((10, 1010)));
        assert_eq!(get_index_and_channel("99989999"), Some((9, 99)));
    }

    #[test]
    fn treats_empty_sides_as_zero() {
        assert_eq!(get_index_and_channel("9989900"), Some((0, 0)));
        assert_eq!(get_index_and_channel("99899"), Some((0, 0)));
    }

    #[test]
    fn rejects_messages_without_the_separator() {
        assert_eq!(get_index_and_channel("1234"), None);
    }

    #[test]
    fn rejects_non_numeric_sides() {
        assert_eq!(get_index_and_channel("abc99899def"), None);
    }

    #[tokio::test]
    async fn registry_refuses_a_duplicate_channel() {
        let registry = StreamRegistry::new();
        assert!(registry.start(22).await.is_some());
        assert!(registry.start(22).await.is_none());
    }

    #[tokio::test]
    async fn registry_cancels_on_stop() {
        let registry = StreamRegistry::new();
        let token = registry.start(11).await.expect("channel 11 is free");
        assert!(registry.stop(11).await);
        assert!(token.is_cancelled());
        assert!(!registry.stop(11).await);
    }

    #[tokio::test]
    async fn stop_all_cancels_every_stream() {
        let registry = StreamRegistry::new();
        let first = registry.start(11).await.expect("channel 11 is free");
        let second = registry.start(22).await.expect("channel 22 is free");
        registry.stop_all().await;
        assert!(first.is_cancelled());
        assert!(second.is_cancelled());
    }
}
