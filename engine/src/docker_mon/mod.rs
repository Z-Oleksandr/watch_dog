use which::which;
use serde::Deserialize;
use bollard::{Docker, container, API_DEFAULT_VERSION};
use std::collections::BTreeMap;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use lazy_static::lazy_static;

use crate::IncomingMessage;

pub mod send_containers;
pub mod stream_container;

use stream_container::{get_index_and_channel, STREAM_REGISTRY};

#[derive(Deserialize, Debug, Clone)]
pub struct Container {
    pub id: String,
    pub names: Vec<String>,
    pub image: String,
}

lazy_static! {
    pub static ref CONTAINER_REGISTER: 
        Mutex<BTreeMap<u32, Container>> = Mutex::new(BTreeMap::new());
}

pub async fn init_docker_mon() -> String {
    let is_docker = which("docker").is_ok();

    if is_docker {
        let docker = Docker::connect_with_socket_defaults()
            .expect("Failed to connect to local Docker");

        get_containers(&docker).await;

        let version_info = docker.version().await.unwrap();

        return version_info.version.unwrap_or("Unknown version".to_string());
    }

    return "false".to_string()
}

async fn get_containers(docker: &Docker) {
    let options = Some(container::ListContainersOptions::<String> {
        all: false,
        ..Default::default()
    });

    let mut index: u32 = 0;
    match docker.list_containers(options).await {
        Ok(containers) => {
            let mut container_reg = CONTAINER_REGISTER.lock().await;
            container_reg.clear();
            for container in containers {
                let id = container.id.unwrap_or_default();
                let names = container.names.unwrap_or_default();
                let image = container.image.unwrap_or_default();

                container_reg.insert(
                    index,
                    Container { 
                        id, 
                        names, 
                        image
                    }
                );
                index += 1;
            }
        },
        Err(e) => {
            eprint!("Error getting containers: {}", e);
        }
    }
}

#[derive(Debug)]
pub struct PreparedStreamContainerData {
    pub container_index: u32,
    pub channel: u32,
    pub token: CancellationToken
}

pub async fn prepare_start_container(msg: IncomingMessage) -> Option<PreparedStreamContainerData> {
    let message = msg.message.to_string();

    let (container_index, channel) = match get_index_and_channel(&message) {
        Some(pair) => pair,
        None => return None,
    };

    let mut registry = STREAM_REGISTRY.lock().await;

    if registry.contains_key(&channel) {
        println!("Stream already running for {:?}", channel);
        return None;
    }

    let token = CancellationToken::new();

    registry.insert(channel, token.clone());

    return Some(
        PreparedStreamContainerData {container_index, channel, token}
    )
}
