use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::fs::OpenOptions;
use tokio::io::AsyncWriteExt;
use tokio::sync::{broadcast, Semaphore};
use tracing::{error, info};

use cirrus_core::entry::EntryRecord;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::state::FileState;
use cirrus_db::EntryRepository;
use cirrus_providers::{ByteRange, CloudProvider};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum HydrationPriority {
    Prefetch = 0,
    Pinned = 1,
    UserInteractive = 2,
}

#[derive(Debug, Clone)]
pub struct HydrationProgress {
    pub entry_id: String,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub state: FileState,
}

#[allow(dead_code)]
#[derive(Debug)]
struct QueuedTask {
    entry_id: String,
    priority: HydrationPriority,
    added_at: Instant,
}

impl PartialEq for QueuedTask {
    fn eq(&self, other: &Self) -> bool {
        self.entry_id == other.entry_id
    }
}

impl Eq for QueuedTask {}

impl PartialOrd for QueuedTask {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for QueuedTask {
    fn cmp(&self, other: &Self) -> Ordering {
        self.priority
            .cmp(&other.priority)
            .then_with(|| other.added_at.cmp(&self.added_at))
    }
}

#[derive(Clone)]
pub struct HydrationManager {
    cache_dir: PathBuf,
    entries_repo: EntryRepository,
    provider: Arc<dyn CloudProvider>,
    semaphore: Arc<Semaphore>,
    progress_tx: broadcast::Sender<HydrationProgress>,
    cancelled: Arc<Mutex<HashSet<String>>>,
    active_downloads: Arc<Mutex<HashSet<String>>>,
}

impl HydrationManager {
    pub fn new<P: AsRef<Path>>(
        cache_dir: P,
        entries_repo: EntryRepository,
        provider: Arc<dyn CloudProvider>,
        max_concurrent: usize,
    ) -> Result<Self> {
        let cache_dir = cache_dir.as_ref().to_path_buf();
        let parts_dir = cache_dir.join("parts");
        let content_dir = cache_dir.join("content");

        std::fs::create_dir_all(&parts_dir)
            .map_err(|e| CirrusError::Storage(format!("Failed to create parts dir: {}", e)))?;
        std::fs::create_dir_all(&content_dir)
            .map_err(|e| CirrusError::Storage(format!("Failed to create content dir: {}", e)))?;

        let (progress_tx, _) = broadcast::channel(128);

        Ok(Self {
            cache_dir,
            entries_repo,
            provider,
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            progress_tx,
            cancelled: Arc::new(Mutex::new(HashSet::new())),
            active_downloads: Arc::new(Mutex::new(HashSet::new())),
        })
    }

    pub fn subscribe_progress(&self) -> broadcast::Receiver<HydrationProgress> {
        self.progress_tx.subscribe()
    }

    pub fn cancel(&self, entry_id: &str) {
        self.cancelled.lock().insert(entry_id.to_string());
    }

    pub fn is_active(&self, entry_id: &str) -> bool {
        self.active_downloads.lock().contains(entry_id)
    }

    /// Triggers background hydration of a file according to priority.
    pub async fn hydrate(
        &self,
        entry: &EntryRecord,
        _priority: HydrationPriority,
    ) -> Result<PathBuf> {
        let entry_id = entry.id.clone();
        if self.is_active(&entry_id) {
            info!("Hydration for entry '{}' is already in flight", entry_id);
            return Ok(self.cache_dir.join("content").join(&entry_id));
        }

        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|_| CirrusError::Cancelled)?;

        self.active_downloads.lock().insert(entry_id.clone());
        self.cancelled.lock().remove(&entry_id);

        let final_path = self.cache_dir.join("content").join(&entry_id);
        let part_path = self
            .cache_dir
            .join("parts")
            .join(format!("{}.part", entry_id));

        // Mark state as Hydrating
        let _ = self
            .entries_repo
            .update_state(&entry_id, FileState::Hydrating, None, None);
        let _ = self.progress_tx.send(HydrationProgress {
            entry_id: entry_id.clone(),
            bytes_downloaded: 0,
            total_bytes: entry.size,
            speed_bps: 0,
            state: FileState::Hydrating,
        });

        let result = self.execute_download(entry, &part_path, &final_path).await;

        self.active_downloads.lock().remove(&entry_id);

        match result {
            Ok(path) => {
                let target_state = if entry.state == FileState::Pinned {
                    FileState::Pinned
                } else {
                    FileState::Available
                };

                let path_str = path.to_string_lossy().to_string();
                let _ =
                    self.entries_repo
                        .update_state(&entry_id, target_state, Some(&path_str), None);
                let _ = self.progress_tx.send(HydrationProgress {
                    entry_id: entry_id.clone(),
                    bytes_downloaded: entry.size,
                    total_bytes: entry.size,
                    speed_bps: 0,
                    state: target_state,
                });
                info!(
                    "Successfully hydrated entry '{}' to {}",
                    entry_id,
                    path.display()
                );
                Ok(path)
            }
            Err(err) => {
                error!("Hydration failed for entry '{}': {}", entry_id, err);
                let err_msg = err.to_string();
                let _ = self.entries_repo.update_state(
                    &entry_id,
                    FileState::Error,
                    None,
                    Some(&err_msg),
                );
                let _ = self.progress_tx.send(HydrationProgress {
                    entry_id,
                    bytes_downloaded: 0,
                    total_bytes: entry.size,
                    speed_bps: 0,
                    state: FileState::Error,
                });
                Err(err)
            }
        }
    }

    async fn execute_download(
        &self,
        entry: &EntryRecord,
        part_path: &Path,
        final_path: &Path,
    ) -> Result<PathBuf> {
        let entry_id = &entry.id;

        // Check if resumed from existing partial download
        let mut existing_bytes = 0u64;
        if part_path.exists() {
            if let Ok(meta) = tokio::fs::metadata(part_path).await {
                existing_bytes = meta.len();
            }
        }

        // Open part file for append or write
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .append(true)
            .open(part_path)
            .await
            .map_err(|e| CirrusError::Io(format!("Failed to open part file: {}", e)))?;

        let range = if existing_bytes > 0 && existing_bytes < entry.size {
            info!(
                "Resuming download for '{}' from byte {}",
                entry_id, existing_bytes
            );
            Some(ByteRange {
                start: existing_bytes,
                end: None,
            })
        } else {
            // Overwrite from beginning
            file.set_len(0)
                .await
                .map_err(|e| CirrusError::Io(e.to_string()))?;
            None
        };

        // Fetch data from provider
        let data = self.provider.download(entry_id, range).await?;

        // Check cancellation
        if self.cancelled.lock().contains(entry_id) {
            return Err(CirrusError::Cancelled);
        }

        file.write_all(&data)
            .await
            .map_err(|e| CirrusError::Io(format!("Failed to write part file: {}", e)))?;
        file.sync_all()
            .await
            .map_err(|e| CirrusError::Io(format!("Failed to fsync part file: {}", e)))?;
        drop(file);

        // Verify SHA256 checksum if provider specified content_hash
        if let Some(ref expected_hash) = entry.content_hash {
            let part_data = tokio::fs::read(part_path)
                .await
                .map_err(|e| CirrusError::Io(e.to_string()))?;
            let mut hasher = Sha256::new();
            hasher.update(&part_data);
            let computed = hex::encode(hasher.finalize());
            if !computed.eq_ignore_ascii_case(expected_hash) {
                let _ = tokio::fs::remove_file(part_path).await;
                return Err(CirrusError::Validation(format!(
                    "Checksum mismatch: expected '{}', computed '{}'",
                    expected_hash, computed
                )));
            }
        }

        // Atomic rename from .part to final cache destination
        tokio::fs::rename(part_path, final_path)
            .await
            .map_err(|e| CirrusError::Io(format!("Failed atomic rename: {}", e)))?;

        Ok(final_path.to_path_buf())
    }
}
