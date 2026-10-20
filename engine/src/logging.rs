use std::env;
use std::io::Write;

use log::{Level, LevelFilter, Log, Metadata, Record, SetLoggerError};

/// Minimal leveled logger. The engine ships as a standalone binary run under a
/// process manager, so records go to stdout/stderr with a timestamp and level
/// and the process manager owns rotation.
struct EngineLogger {
    level: LevelFilter,
}

impl Log for EngineLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= self.level
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let line = format!(
            "{} {:<5} [{}] {}",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
            record.level(),
            record.target(),
            record.args()
        );

        // Warnings and errors go to stderr so they stay visible when stdout is
        // redirected; everything else goes to stdout.
        if record.level() <= Level::Warn {
            let _ = writeln!(std::io::stderr(), "{}", line);
        } else {
            let _ = writeln!(std::io::stdout(), "{}", line);
        }
    }

    fn flush(&self) {
        let _ = std::io::stdout().flush();
        let _ = std::io::stderr().flush();
    }
}

fn parse_level(raw: &str) -> Option<LevelFilter> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "off" => Some(LevelFilter::Off),
        "error" => Some(LevelFilter::Error),
        "warn" => Some(LevelFilter::Warn),
        "info" => Some(LevelFilter::Info),
        "debug" => Some(LevelFilter::Debug),
        "trace" => Some(LevelFilter::Trace),
        _ => None,
    }
}

/// Reads the desired level from `WATCH_DOG_LOG`, then `RUST_LOG`, defaulting to
/// `info`. An unrecognised value falls back to `info` rather than failing to
/// start.
fn configured_level() -> LevelFilter {
    for key in ["WATCH_DOG_LOG", "RUST_LOG"] {
        if let Ok(raw) = env::var(key) {
            match parse_level(&raw) {
                Some(level) => return level,
                None => {
                    let _ = writeln!(
                        std::io::stderr(),
                        "Unrecognised {} value {:?}, defaulting to info",
                        key,
                        raw
                    );
                }
            }
        }
    }
    LevelFilter::Info
}

/// Installs the global logger. Called once from `main` before anything else.
pub fn init() -> Result<(), SetLoggerError> {
    let level = configured_level();
    log::set_boxed_logger(Box::new(EngineLogger { level }))?;
    log::set_max_level(level);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_levels_case_insensitively() {
        assert_eq!(parse_level("INFO"), Some(LevelFilter::Info));
        assert_eq!(parse_level(" debug "), Some(LevelFilter::Debug));
        assert_eq!(parse_level("off"), Some(LevelFilter::Off));
    }

    #[test]
    fn rejects_unknown_levels() {
        assert_eq!(parse_level("verbose"), None);
        assert_eq!(parse_level(""), None);
    }
}
