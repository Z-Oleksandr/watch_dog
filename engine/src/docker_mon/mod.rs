use std::collections::BTreeMap;

use bollard::{container, Docker};
use log::{error, info, warn};
use tokio::sync::Mutex;

pub mod send_containers;
pub mod stream_container;

/// Reported to the front-end when no Docker daemon is reachable. The value is
/// displayed verbatim in the system info panel, so it must stay stable.
pub const DOCKER_UNAVAILABLE: &str = "false";

#[derive(Debug, Clone)]
pub struct Container {
    pub id: String,
    pub names: Vec<String>,
}

/// Owns the single Docker connection and the index -> container mapping the
/// front-end refers to by position.
pub struct DockerMonitor {
    client: Option<Docker>,
    version: String,
    containers: Mutex<BTreeMap<u32, Container>>,
}

impl DockerMonitor {
    /// Probes for Docker once at startup. Any failure degrades to "no Docker"
    /// rather than taking the engine down.
    pub async fn init() -> Self {
        let docker_on_path = tokio::task::spawn_blocking(|| which::which("docker").is_ok()).await;

        let docker_on_path = match docker_on_path {
            Ok(found) => found,
            Err(e) => {
                error!("Failed to probe for the docker binary: {}", e);
                false
            }
        };

        if !docker_on_path {
            info!("Docker not found on PATH, container monitoring disabled");
            return Self::unavailable();
        }

        let client = match Docker::connect_with_socket_defaults() {
            Ok(client) => client,
            Err(e) => {
                warn!("Docker is installed but its socket is unreachable: {}", e);
                return Self::unavailable();
            }
        };

        let version = match client.version().await {
            Ok(info) => info
                .version
                .unwrap_or_else(|| "Unknown version".to_string()),
            Err(e) => {
                warn!("Docker daemon did not answer a version query: {}", e);
                return Self::unavailable();
            }
        };

        info!("Docker {} detected", version);

        let monitor = Self {
            client: Some(client),
            version,
            containers: Mutex::new(BTreeMap::new()),
        };
        monitor.refresh_containers().await;
        monitor
    }

    fn unavailable() -> Self {
        Self {
            client: None,
            version: DOCKER_UNAVAILABLE.to_string(),
            containers: Mutex::new(BTreeMap::new()),
        }
    }

    pub fn version(&self) -> &str {
        &self.version
    }

    pub fn client(&self) -> Option<&Docker> {
        self.client.as_ref()
    }

    /// Re-reads the running container list. Called on startup and whenever a
    /// client asks for the list, so the panel never shows a stale set.
    pub async fn refresh_containers(&self) {
        let client = match &self.client {
            Some(client) => client,
            None => return,
        };

        let options = Some(container::ListContainersOptions::<String> {
            all: false,
            ..Default::default()
        });

        let listed = match client.list_containers(options).await {
            Ok(listed) => listed,
            Err(e) => {
                error!("Failed to list docker containers: {}", e);
                return;
            }
        };

        let mut containers = self.containers.lock().await;
        containers.clear();
        for (index, entry) in listed.into_iter().enumerate() {
            containers.insert(
                index as u32,
                Container {
                    id: entry.id.unwrap_or_default(),
                    names: entry.names.unwrap_or_default(),
                },
            );
        }
    }

    pub async fn container(&self, index: u32) -> Option<Container> {
        self.containers.lock().await.get(&index).cloned()
    }

    /// Index -> display name, as sent to the front-end.
    pub async fn names(&self) -> BTreeMap<u32, String> {
        self.containers
            .lock()
            .await
            .iter()
            .map(|(index, container)| {
                let name = container
                    .names
                    .first()
                    .map(|name| name.trim_start_matches('/').to_string())
                    .unwrap_or_else(|| "unkown".to_string());
                (*index, name)
            })
            .collect()
    }
}
