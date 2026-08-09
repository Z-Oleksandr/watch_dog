use std::collections::HashMap;
use std::sync::Arc;

use log::{error, warn};
use serde::Serialize;
use walkdir::WalkDir;

use crate::config;
use crate::logfiles::{ensure_dir, LogIndex};
use crate::ws::sink::ConnectionSink;

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct LogListPayload {
    data_type: u32,
    log_list: HashMap<u32, String>,
}

/// Scans the log directory for recorded sessions. Runs on the blocking pool
/// because `WalkDir` and the metadata calls are synchronous.
fn scan_log_dir() -> HashMap<u32, String> {
    let mut log_list = HashMap::new();
    let mut index = 0;

    for entry in WalkDir::new(config::LOG_DIR) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(e) => {
                warn!("Skipping unreadable log directory entry: {}", e);
                continue;
            }
        };

        match entry.metadata() {
            Ok(metadata) if metadata.is_file() => {}
            Ok(_) => continue,
            Err(e) => {
                warn!(
                    "Skipping log entry without metadata {:?}: {}",
                    entry.path(),
                    e
                );
                continue;
            }
        }

        let file_name = entry.file_name().to_string_lossy().into_owned();
        let trimmed = file_name
            .strip_prefix("cnr_")
            .and_then(|name| name.strip_suffix(".json"));

        if let Some(trimmed) = trimmed {
            log_list.insert(index, trimmed.to_string());
            index += 1;
        }
    }

    log_list
}

pub async fn send_log_list(sink: Arc<ConnectionSink>, log_index: LogIndex) {
    if let Err(e) = ensure_dir(config::LOG_DIR) {
        error!(
            "Could not prepare the log directory {}: {}",
            config::LOG_DIR,
            e
        );
        return;
    }

    let log_list = match tokio::task::spawn_blocking(scan_log_dir).await {
        Ok(log_list) => log_list,
        Err(e) => {
            error!("Log directory scan failed: {}", e);
            return;
        }
    };

    {
        let mut index = log_index.lock().await;
        *index = log_list.clone();
    }

    let payload = LogListPayload {
        data_type: 3,
        log_list,
    };

    let json = match serde_json::to_string(&payload) {
        Ok(json) => json,
        Err(e) => {
            error!("Failed to serialize the log list: {}", e);
            return;
        }
    };

    sink.send_text(json).await;
}
