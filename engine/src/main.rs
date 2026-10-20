use std::process::ExitCode;
use std::sync::Arc;

use log::{error, info, warn};
use tokio::net::TcpListener;
use tokio::sync::Semaphore;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

mod config;
mod disk_temps;
mod docker_mon;
mod helpers;
mod logfiles;
mod logging;
mod sampler;
mod system_info;
mod system_stats;
mod temperatures;
mod topology;
mod ws;

use docker_mon::DockerMonitor;
use logfiles::recorder::Recorder;
use system_info::SystemInfoTemplate;
use ws::AppContext;

#[tokio::main]
async fn main() -> ExitCode {
    if let Err(e) = logging::init() {
        eprintln!("Failed to install the logger: {}", e);
        return ExitCode::FAILURE;
    }

    // The machine is enumerated once. Everything downstream indexes readings
    // against this snapshot, so it must not be rebuilt while the engine runs.
    // Probing reads sysfs and procfs (and queries every drive's sensor), so
    // it runs on the blocking pool like every other hardware read.
    let probed = match tokio::task::spawn_blocking(topology::probe).await {
        Ok(probed) => probed,
        Err(e) => {
            error!("The topology probe task failed: {}", e);
            return ExitCode::FAILURE;
        }
    };
    let (topology, handles) = match probed {
        Ok(probed) => probed,
        Err(e) => {
            error!("Could not read the system topology: {}", e);
            return ExitCode::FAILURE;
        }
    };

    let docker = Arc::new(DockerMonitor::init().await);
    let info_template = Arc::new(SystemInfoTemplate::probe(docker.version()));

    let topology = Arc::new(topology);
    let shutdown = CancellationToken::new();
    let tracker = TaskTracker::new();

    let stats = sampler::spawn(Arc::clone(&topology), handles, &tracker, shutdown.clone());

    let addr = config::bind_addr();
    let listener = match TcpListener::bind(&addr).await {
        Ok(listener) => listener,
        Err(e) => {
            error!("Failed to bind {}: {}", addr, e);
            return ExitCode::FAILURE;
        }
    };

    info!("WebSocket server listening on {}", addr);

    let ctx = Arc::new(AppContext {
        topology,
        info_template,
        docker,
        stats: stats.clone(),
        log_index: logfiles::new_log_index(),
        recorder: Arc::new(Recorder::new()),
        tracker: tracker.clone(),
        shutdown: shutdown.clone(),
        connection_slots: Arc::new(Semaphore::new(config::MAX_CONNECTIONS)),
    });

    accept_loop(listener, ctx, shutdown.clone()).await;

    info!("Shutting down");
    shutdown.cancel();
    tracker.close();

    match timeout(config::SHUTDOWN_GRACE, tracker.wait()).await {
        Ok(()) => info!("All connections closed cleanly"),
        Err(_) => warn!(
            "Gave up waiting for tasks after {:?}",
            config::SHUTDOWN_GRACE
        ),
    }

    ExitCode::SUCCESS
}

async fn accept_loop(listener: TcpListener, ctx: Arc<AppContext>, shutdown: CancellationToken) {
    loop {
        let accepted = tokio::select! {
            _ = shutdown.cancelled() => return,
            _ = wait_for_signal() => {
                info!("Received a shutdown signal");
                return;
            }
            accepted = listener.accept() => accepted,
        };

        match accepted {
            Ok((stream, addr)) => {
                let ctx = Arc::clone(&ctx);
                ctx.tracker
                    .clone()
                    .spawn(async move { ws::connection::handle(stream, addr, ctx).await });
            }
            Err(e) => {
                warn!("Failed to accept a connection: {}", e);
            }
        }
    }
}

/// Resolves on SIGINT, and on SIGTERM where the platform has it, so a process
/// manager can restart the engine without severing sockets abruptly.
async fn wait_for_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};

        let mut terminate = match signal(SignalKind::terminate()) {
            Ok(terminate) => terminate,
            Err(e) => {
                warn!(
                    "Cannot listen for SIGTERM, only SIGINT will stop the engine: {}",
                    e
                );
                let _ = tokio::signal::ctrl_c().await;
                return;
            }
        };

        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = terminate.recv() => {}
        }
    }

    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
