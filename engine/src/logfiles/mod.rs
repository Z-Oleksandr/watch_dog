use std::collections::HashMap;
use std::io;
use std::path::Path;
use std::sync::Arc;

use tokio::sync::Mutex;

pub mod data;
pub mod list;
pub mod recorder;

/// Position -> log timestamp, as last sent to the front-end. The panel replies
/// with a position, so the mapping has to be remembered between requests.
pub type LogIndex = Arc<Mutex<HashMap<u32, String>>>;

pub fn new_log_index() -> LogIndex {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Creates the log directory if it is missing.
pub fn ensure_dir(dir: &str) -> io::Result<()> {
    let path = Path::new(dir);
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}
