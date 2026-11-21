use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use std::time::Duration;
use tokio::sync::broadcast;
use tracing::{error, info};

use cirrus_core::error::{CirrusError, Result};

pub struct LocalFsWatcher {
    _watcher: RecommendedWatcher,
    event_tx: broadcast::Sender<PathBuf>,
}

impl LocalFsWatcher {
    pub fn new<P: AsRef<Path>>(watch_path: P) -> Result<Self> {
        let (event_tx, _) = broadcast::channel(128);
        let tx_clone = event_tx.clone();

        let (std_tx, std_rx) = channel();

        let mut watcher = RecommendedWatcher::new(
            std_tx,
            Config::default().with_poll_interval(Duration::from_millis(500)),
        )
        .map_err(|e| CirrusError::Io(format!("Failed to create inotify watcher: {}", e)))?;

        watcher
            .watch(watch_path.as_ref(), RecursiveMode::Recursive)
            .map_err(|e| CirrusError::Io(format!("Failed to watch directory: {}", e)))?;

        // Background bridge task from std::sync::mpsc to tokio broadcast
        std::thread::spawn(move || {
            while let Ok(res) = std_rx.recv() {
                match res {
                    Ok(Event { paths, .. }) => {
                        for path in paths {
                            let _ = tx_clone.send(path);
                        }
                    }
                    Err(e) => {
                        error!("Inotify watch error: {}", e);
                    }
                }
            }
        });

        info!(
            "Inotify watcher started on {}",
            watch_path.as_ref().display()
        );
        Ok(Self {
            _watcher: watcher,
            event_tx,
        })
    }

    pub fn subscribe(&self) -> broadcast::Receiver<PathBuf> {
        self.event_tx.subscribe()
    }
}
