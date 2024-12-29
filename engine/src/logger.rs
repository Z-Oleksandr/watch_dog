use std::{fs::OpenOptions, io::Write, time::{Duration, Instant}};
use tokio::{fs::{self, File}, io::AsyncWriteExt, time};
use serde_json::{json, Value};
use chrono;
use sysinfo::{System, Networks};

use crate::system_stats::{SystemStats, get_system_stats};

pub async fn log_stats(duration_in_hours: u64) {
    println!("Starting log process");
    println!("Duration: {} hours", &duration_in_hours);
    // Start time and file name
    let start_time = chrono::Utc::now();
    let cnr_log_file_name = format!(
        "../logs/cnr_log_{}.json",
        start_time.format("%Y-%m-%d_%H-%M-%S")
    );

    let net_log_file_name = format!(
        "../logs/net_log_{}.json",
        start_time.format("%Y-%m-%d_%H-%M-%S")
    );

    let mut cnr_collected_data = json!({
        "cpu": [],
        "ram": [],
    });

    let mut net_collected_data = json!({
        "network": {
            "down": [],
            "up": [],
        }
    });

    let start = Instant::now();
    let duration = Duration::from_secs(duration_in_hours * 3600);

    let mut sys = System::new_all();
    let mut networks = Networks::new_with_refreshed_list();

    while start.elapsed() < duration {
        let minute_start = Instant::now();
        while minute_start.elapsed() < Duration::from_secs(60) {
            // Collect system stats
            let stats: SystemStats = get_system_stats(&mut sys, &mut networks);

            // Add timestamp
            let timestamp = chrono::Utc::now().to_rfc3339();

            // Append to JSON Object
            if let Some(cpu) = cnr_collected_data.get_mut("cpu") {
                cpu.as_array_mut().unwrap().push(json!({
                    "time_stamp": timestamp,
                    "value": stats.cpu_usage
                        .iter()
                        .sum::<f32>() / stats.cpu_usage.len() as f32,
                }));
            }

            if let Some(ram) = cnr_collected_data.get_mut("ram") {
                ram.as_array_mut().unwrap().push(json!({
                    "time_stamp": timestamp,
                    "value": stats.ram_used
                }));
            }

            if let Some(network) = net_collected_data.get_mut("network") {
                network["down"].as_array_mut().unwrap().push(json!({
                    "time_stamp": timestamp,
                    "value": stats.network_received,
                }));
                network["up"].as_array_mut().unwrap().push(json!({
                    "time_stamp": timestamp,
                    "value": stats.network_transmitted,
                }));
            }

            time::sleep(Duration::from_secs(5)).await;
        }

        if let Err(e) = cnr_write_log_file(&cnr_log_file_name, &cnr_collected_data).await {
            eprintln!("Failed to write cnr log file: {}", e);
        }

        if let Err(e) = net_write_log_file(&net_log_file_name, &net_collected_data).await {
            eprintln!("Failed to write net log file: {}", e);
        }

        cnr_collected_data = json!({
            "cpu": [],
            "ram": [],
        });

        net_collected_data = json!({
            "network": {
                "down": [],
                "up": []
            }
        });
    }

    println!("Finished logging.");
    println!("File name: {}", &cnr_log_file_name);
    println!("Log duration: {} hours", duration_in_hours);
}

async fn cnr_write_log_file(file_name: &str, collected_data: &Value) -> std::io::Result<()> {
    let mut merged_data = collected_data.clone();

    if let Ok(existing_content) = fs::read_to_string(file_name).await {
        if let Ok(existing_json) = serde_json::from_str::<Value>(&existing_content) {
            // Merging existing data with new data
            if let Value::Object(existing_map) = existing_json {
                if let Value::Object(new_map) = &mut merged_data {
                    for (key, value) in existing_map {
                        if let Some(Value::Array(new_array)) = new_map.get_mut(&key) {
                            if let Value::Array(existing_array) = value {
                                // Combine and sort
                                let mut combined_array = existing_array.clone();
                                combined_array.extend(new_array.clone());
                                combined_array.sort_by(|a, b| {
                                    let a_time = a
                                        .get("time_stamp")
                                        .and_then(Value::as_str)
                                        .unwrap_or("");
                                    let b_time = b
                                        .get("time_stamp")
                                        .and_then(Value::as_str)
                                        .unwrap_or("");
                                    a_time.cmp(b_time)
                                });
                                *new_array = combined_array;
                            }
                        }
                    }
                }
            }
        }
    }

    let mut file = File::create(file_name).await?;
    file.write_all(serde_json::to_string_pretty(&merged_data)?.as_bytes())
        .await
}

async fn net_write_log_file(file_name: &str, collected_data: &Value) -> std::io::Result<()> {
    let mut merged_data = collected_data.clone();

    if let Ok(existing_content) = fs::read_to_string(file_name).await {
        if let Ok(existing_json) = serde_json::from_str::<Value>(&existing_content) {
            // Merging existing data with new data
            if let Value::Object(existing_map) = existing_json {
                if let Value::Object(merged_map) = &mut merged_data {
                    if let Some(Value::Object(existing_network)) = existing_map.get("network") {
                        if let Some(Value::Object(new_network)) = merged_map.get_mut("network") {
                            for (key, value) in existing_network {
                                if let Some(Value::Array(new_array)) = new_network.get_mut(key.as_str()) {
                                    if let Value::Array(existing_array) = value {
                                        // Combine and sort
                                        let mut combined_array = existing_array.clone();
                                        combined_array.extend(new_array.clone());
                                        combined_array.sort_by(|a, b| {
                                            let a_time = a
                                                .get("time_stamp")
                                                .and_then(Value::as_str)
                                                .unwrap_or("");
                                            let b_time = b
                                                .get("time_stamp")
                                                .and_then(Value::as_str)
                                                .unwrap_or("");
                                            a_time.cmp(b_time)
                                        });
                                        *new_array = combined_array;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut file = File::create(file_name).await?;
    file.write_all(serde_json::to_string_pretty(&merged_data)?.as_bytes())
        .await
}
