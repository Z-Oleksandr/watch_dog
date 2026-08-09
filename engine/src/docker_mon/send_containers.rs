use std::collections::BTreeMap;
use std::sync::Arc;

use log::error;
use serde::Serialize;

use super::DockerMonitor;
use crate::ws::sink::ConnectionSink;

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct ContainerListPayload {
    data_type: u32,
    list: BTreeMap<u32, String>,
}

pub async fn send_containers_list(sink: Arc<ConnectionSink>, docker: Arc<DockerMonitor>) {
    let payload = ContainerListPayload {
        data_type: 5,
        list: docker.names().await,
    };

    let json = match serde_json::to_string(&payload) {
        Ok(json) => json,
        Err(e) => {
            error!("Failed to serialize the container list: {}", e);
            return;
        }
    };

    sink.send_text(json).await;
}
