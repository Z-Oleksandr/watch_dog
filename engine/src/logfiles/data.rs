use std::sync::Arc;

use log::{error, warn};
use serde::{Deserialize, Serialize};
use tokio::fs::read_to_string;

use crate::config;
use crate::logfiles::LogIndex;
use crate::ws::sink::ConnectionSink;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct SeriesPoint<T> {
    time_stamp: String,
    value: T,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct CnrData {
    cpu: Vec<SeriesPoint<f64>>,
    ram: Vec<SeriesPoint<u64>>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct NetData {
    network: NetworkInfo,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct NetworkInfo {
    down: Vec<SeriesPoint<u64>>,
    up: Vec<SeriesPoint<u64>>,
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct LogDataPayload {
    data_type: u32,
    cnr_data: CnrData,
    net_data: NetData,
}

/// Reads one recorded session and sends it back for charting.
async fn read_series<T: for<'de> Deserialize<'de> + Default>(path: &str) -> Option<T> {
    let content = match read_to_string(path).await {
        Ok(content) => content,
        Err(e) => {
            warn!("Could not read log file {}: {}", path, e);
            return None;
        }
    };

    match serde_json::from_str::<T>(&content) {
        Ok(parsed) => Some(parsed),
        Err(e) => {
            warn!("Log file {} is not valid log data: {}", path, e);
            Some(T::default())
        }
    }
}

pub async fn send_log_data(log_position: u32, sink: Arc<ConnectionSink>, log_index: LogIndex) {
    let timestamp = {
        let index = log_index.lock().await;
        match index.get(&log_position) {
            Some(timestamp) => timestamp.clone(),
            None => {
                warn!("Client asked for unknown log position {}", log_position);
                return;
            }
        }
    };

    let cnr_path = format!("{}cnr_{}.json", config::LOG_DIR, timestamp);
    let net_path = format!("{}net_{}.json", config::LOG_DIR, timestamp);

    let cnr_data = match read_series::<CnrData>(&cnr_path).await {
        Some(data) => data,
        None => return,
    };
    let net_data = match read_series::<NetData>(&net_path).await {
        Some(data) => data,
        None => return,
    };

    let payload = LogDataPayload {
        data_type: 4,
        cnr_data,
        net_data,
    };

    let json = match serde_json::to_string(&payload) {
        Ok(json) => json,
        Err(e) => {
            error!("Failed to serialize log data for {}: {}", timestamp, e);
            return;
        }
    };

    sink.send_text(json).await;
}
