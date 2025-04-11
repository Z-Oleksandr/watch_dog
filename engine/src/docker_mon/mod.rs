use which::which;
use reqwest::Client;
use serde::Deserialize;
use bollard::{Docker, container};
use std::collections::HashMap;

#[derive(Deserialize, Debug)]
struct Container {
    id: String,
    names: Vec<String>,
    image: String,
    state: String,
    status: String,
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

async fn get_containers(docker: &Docker) -> HashMap<String, String> {
    let options = Some(container::ListContainersOptions::<String> {
        all: false,
        ..Default::default()
    });

    let mut containers_list = HashMap::new();

    match docker.list_containers(options).await {
        Ok(containers) => {
            for container in containers {
                let id = container.id.unwrap_or_default();
                let names = container.names.unwrap_or_default();
                let image = container.image.unwrap_or_default();

                println!(
                    "Container ID: {}, Names: {:?}, Image: {}",
                    &id, &names, &image
                );
                containers_list.insert(
                    id,
                    format!("Names: {:?}, Image: {}", names, image)
                );
            }
        },
        Err(e) => {
            eprint!("Error getting containers: {}", e);
        }
    }

    containers_list
}
