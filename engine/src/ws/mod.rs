use std::sync::Arc;

use serde::Deserialize;
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

pub mod connection;
pub mod read;
pub mod sink;

use crate::docker_mon::DockerMonitor;
use crate::logfiles::recorder::Recorder;
use crate::logfiles::LogIndex;
use crate::sampler::StatsSender;
use crate::system_info::SystemInfoTemplate;
use crate::topology::Topology;

/// A request from the front-end. `message` carries every parameter the panel
/// sends, encoded as a number.
#[derive(Deserialize, Debug, Clone)]
pub struct IncomingMessage {
    pub r#type: String,
    pub message: u64,
}

/// Everything a connection needs, passed explicitly rather than reached for
/// through globals.
pub struct AppContext {
    pub topology: Arc<Topology>,
    pub info_template: Arc<SystemInfoTemplate>,
    pub docker: Arc<DockerMonitor>,
    pub stats: StatsSender,
    pub log_index: LogIndex,
    pub recorder: Arc<Recorder>,
    pub tracker: TaskTracker,
    pub shutdown: CancellationToken,
    pub connection_slots: Arc<Semaphore>,
}
