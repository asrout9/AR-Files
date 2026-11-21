use bytes::Bytes;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tracing::{error, info, warn};

use crate::conflict::ConflictDetector;
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::state::FileState;
use cirrus_db::EntryRepository;
use cirrus_providers::CloudProvider;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UploadStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    OfflineDeferred,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadItem {
    pub id: String,
    pub account_id: String,
    pub entry_id: Option<String>,
    pub parent_id: Option<String>,
    pub name: String,
    pub local_path: PathBuf,
    pub size: u64,
    pub mime_type: String,
    pub status: UploadStatus,
    pub retry_count: u32,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone)]
pub struct UploadQueueManager {
    account_id: String,
    entries_repo: EntryRepository,
    queue: Arc<RwLock<VecDeque<UploadItem>>>,
    items: Arc<RwLock<HashMap<String, UploadItem>>>,
    is_offline: Arc<AtomicBool>,
}

impl UploadQueueManager {
    pub fn new(account_id: &str, entries_repo: EntryRepository) -> Self {
        Self {
            account_id: account_id.to_string(),
            entries_repo,
            queue: Arc::new(RwLock::new(VecDeque::new())),
            items: Arc::new(RwLock::new(HashMap::new())),
            is_offline: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn set_offline(&self, offline: bool) {
        self.is_offline.store(offline, Ordering::SeqCst);
        info!(
            "Account '{}' offline mode set to: {}",
            self.account_id, offline
        );
    }

    pub fn is_offline(&self) -> bool {
        self.is_offline.load(Ordering::SeqCst)
    }

    /// Number of uploads currently waiting, in progress, or deferred offline.
    pub fn pending_count(&self) -> usize {
        self.items
            .read()
            .values()
            .filter(|it| {
                matches!(
                    it.status,
                    UploadStatus::Pending
                        | UploadStatus::InProgress
                        | UploadStatus::OfflineDeferred
                )
            })
            .count()
    }

    /// Enqueues a local file for cloud upload with coalescing and deduplication.
    pub fn enqueue(
        &self,
        entry_id: Option<&str>,
        parent_id: Option<&str>,
        name: &str,
        local_path: &Path,
        mime_type: &str,
    ) -> Result<UploadItem> {
        let meta = std::fs::metadata(local_path)
            .map_err(|e| CirrusError::Io(format!("Cannot inspect file to upload: {}", e)))?;
        let size = meta.len();
        let now = chrono::Utc::now().timestamp_millis();

        // 1. Deduplication / Coalescing: check if this file is already pending
        {
            let mut items = self.items.write();
            for item in items.values_mut() {
                if item.local_path == local_path && item.status == UploadStatus::Pending {
                    info!("Coalescing multiple writes for '{}' in upload queue", name);
                    item.size = size;
                    item.updated_at = now;
                    return Ok(item.clone());
                }
            }
        }

        let upload_id = format!("upload_{}", uuid::Uuid::new_v4());
        let initial_status = if self.is_offline() {
            UploadStatus::OfflineDeferred
        } else {
            UploadStatus::Pending
        };

        let upload_item = UploadItem {
            id: upload_id.clone(),
            account_id: self.account_id.clone(),
            entry_id: entry_id.map(|s| s.to_string()),
            parent_id: parent_id.map(|s| s.to_string()),
            name: name.to_string(),
            local_path: local_path.to_path_buf(),
            size,
            mime_type: mime_type.to_string(),
            status: initial_status,
            retry_count: 0,
            error_message: None,
            created_at: now,
            updated_at: now,
        };

        // Mark entry state as SyncingUp in local SQLite database
        if let Some(eid) = entry_id {
            let path_str = local_path.to_string_lossy().to_string();
            let _ =
                self.entries_repo
                    .update_state(eid, FileState::SyncingUp, Some(&path_str), None);
        }

        self.items
            .write()
            .insert(upload_id.clone(), upload_item.clone());
        self.queue.write().push_back(upload_item.clone());

        info!(
            "Enqueued upload '{}' ({}) for account '{}'",
            name, upload_id, self.account_id
        );
        Ok(upload_item)
    }

    /// Pops and processes the next pending upload item asynchronously against the cloud provider.
    pub async fn process_next(
        &self,
        provider: Arc<dyn CloudProvider>,
    ) -> Result<Option<EntryRecord>> {
        if self.is_offline() {
            // Defer all pending items
            let mut items = self.items.write();
            for item in items.values_mut() {
                if item.status == UploadStatus::Pending {
                    item.status = UploadStatus::OfflineDeferred;
                }
            }
            return Ok(None);
        }

        let next_item = {
            let mut queue = self.queue.write();
            queue.pop_front()
        };

        let mut item = match next_item {
            Some(it) => it,
            None => return Ok(None),
        };

        item.status = UploadStatus::InProgress;
        self.items.write().insert(item.id.clone(), item.clone());

        // Read local file bytes
        let file_bytes = match tokio::fs::read(&item.local_path).await {
            Ok(b) => Bytes::from(b),
            Err(e) => {
                let err_msg = format!("Failed to read local file: {}", e);
                error!("{}", err_msg);
                item.status = UploadStatus::Failed;
                item.error_message = Some(err_msg);
                self.items.write().insert(item.id.clone(), item.clone());
                return Err(CirrusError::Io(e.to_string()));
            }
        };

        // Check for conflict against remote if entry_id exists
        if let Some(ref eid) = item.entry_id {
            if let Ok(remote_meta) = provider.get_metadata(eid).await {
                if let Ok(Some(local_entry)) = self.entries_repo.get_entry(eid) {
                    if ConflictDetector::is_conflict(&local_entry, &remote_meta) {
                        warn!(
                            "Conflict detected during upload for '{}'. Forking local copy.",
                            item.name
                        );
                        let conflict_name =
                            ConflictDetector::generate_conflict_name(&item.name, "Local-Device");

                        // Upload as new conflict file
                        let uploaded = provider
                            .upload(
                                item.parent_id.as_deref(),
                                &conflict_name,
                                file_bytes,
                                &item.mime_type,
                            )
                            .await?;

                        let mut conflict_record = uploaded.clone();
                        conflict_record.state = FileState::Conflict;
                        conflict_record.local_path =
                            Some(item.local_path.to_string_lossy().to_string());
                        self.entries_repo.upsert_entry(&conflict_record)?;

                        item.status = UploadStatus::Completed;
                        self.items.write().insert(item.id.clone(), item);
                        return Ok(Some(conflict_record));
                    }
                }
            }
        }

        // Upload to provider
        match provider
            .upload(
                item.parent_id.as_deref(),
                &item.name,
                file_bytes,
                &item.mime_type,
            )
            .await
        {
            Ok(mut remote_record) => {
                item.status = UploadStatus::Completed;
                self.items.write().insert(item.id.clone(), item.clone());

                let path_str = item.local_path.to_string_lossy().to_string();
                remote_record.local_path = Some(path_str.clone());
                remote_record.state = FileState::Available;

                // If updating existing placeholder, preserve local ID
                if let Some(ref eid) = item.entry_id {
                    let _ = self.entries_repo.update_state(
                        eid,
                        FileState::Available,
                        Some(&path_str),
                        None,
                    );
                } else {
                    self.entries_repo.upsert_entry(&remote_record)?;
                }

                info!(
                    "Upload completed successfully for '{}' -> remote id '{}'",
                    item.name, remote_record.id
                );
                Ok(Some(remote_record))
            }
            Err(e) => {
                error!("Upload failed for item '{}': {}", item.name, e);
                item.retry_count += 1;
                if item.retry_count < 3 {
                    item.status = UploadStatus::Pending;
                    self.queue.write().push_back(item.clone());
                } else {
                    item.status = UploadStatus::Failed;
                    item.error_message = Some(e.to_string());
                }
                self.items.write().insert(item.id.clone(), item);
                Err(e)
            }
        }
    }

    /// Returns a snapshot of all tracked upload items.
    pub fn list_items(&self) -> Vec<UploadItem> {
        self.items.read().values().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cirrus_db::DatabasePool;
    use cirrus_providers::MockCloudProvider;
    use tempfile::tempdir;

    fn setup_test() -> (DatabasePool, EntryRepository, Arc<MockCloudProvider>) {
        let pool = DatabasePool::open_in_memory().unwrap();
        let accounts = cirrus_db::AccountRepository::new(pool.clone());
        let repo = EntryRepository::new(pool.clone());
        let provider = Arc::new(MockCloudProvider::new(
            "acc_test",
            "Test GDrive",
            100_000_000,
        ));

        let now = chrono::Utc::now().timestamp();
        let acc = cirrus_core::account::AccountRecord {
            id: "acc_test".to_string(),
            provider_type: cirrus_core::account::ProviderType::Mock,
            name: "Test GDrive".to_string(),
            email: None,
            root_folder_id: None,
            quota_total: None,
            quota_used: None,
            sync_status: cirrus_core::account::AccountSyncStatus::Idle,
            delta_token: None,
            mount_path: None,
            created_at: now,
            updated_at: now,
        };
        accounts.upsert_account(&acc).unwrap();

        (pool, repo, provider)
    }

    #[tokio::test]
    async fn test_upload_queue_lifecycle_and_offline() {
        let (_pool, repo, provider) = setup_test();
        let temp = tempdir().unwrap();
        let file_path = temp.path().join("report.txt");
        tokio::fs::write(&file_path, "sample cloud upload payload")
            .await
            .unwrap();

        let queue_mgr = UploadQueueManager::new("acc_test", repo.clone());

        // Enqueue file
        let item = queue_mgr
            .enqueue(None, None, "report.txt", &file_path, "text/plain")
            .unwrap();
        assert_eq!(queue_mgr.pending_count(), 1);
        assert_eq!(item.status, UploadStatus::Pending);

        // Process upload
        let uploaded = queue_mgr
            .process_next(provider.clone())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(uploaded.name, "report.txt");
        assert_eq!(queue_mgr.pending_count(), 0);

        // Test offline mode
        queue_mgr.set_offline(true);
        let file2_path = temp.path().join("offline_file.txt");
        tokio::fs::write(&file2_path, "saved while on flight")
            .await
            .unwrap();

        let item2 = queue_mgr
            .enqueue(None, None, "offline_file.txt", &file2_path, "text/plain")
            .unwrap();
        assert_eq!(item2.status, UploadStatus::OfflineDeferred);
        assert_eq!(queue_mgr.pending_count(), 1);

        // Turn offline mode off and process
        queue_mgr.set_offline(false);
        // Put back in queue to simulate resume
        queue_mgr.queue.write().push_back(item2);
        let uploaded2 = queue_mgr.process_next(provider).await.unwrap().unwrap();
        assert_eq!(uploaded2.name, "offline_file.txt");
        assert_eq!(queue_mgr.pending_count(), 0);
    }
}
