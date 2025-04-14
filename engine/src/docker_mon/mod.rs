use which::which;
use reqwest::Client;
use serde::Deserialize;
use bollard::{Docker, container, API_DEFAULT_VERSION};
use std::collections::HashMap;
use tokio::sync::Mutex;
use lazy_static::lazy_static;

pub mod send_containers;

#[derive(Deserialize, Debug)]
pub struct Container {
    pub id: String,
    pub names: Vec<String>,
    pub image: String,
}

lazy_static! {
    pub static ref CONTAINER_REGISTER: 
        Mutex<HashMap<u32, Container>> = Mutex::new(HashMap::new());
}

pub async fn init_docker_mon() -> String {
    // let is_docker = which("docker").is_ok();
    // For dev
    let is_docker = true;

    if is_docker {
        // let docker = Docker::connect_with_socket_defaults()
        //     .expect("Failed to connect to local Docker");
        // For dev

        let docker = Docker::connect_with_http(
            "http://192.168.0.116:2375", 
            4, 
            API_DEFAULT_VERSION)
            .expect("Failed to connect to Docker Dev");


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
