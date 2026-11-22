use async_trait::async_trait;
use bytes::Bytes;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use crate::trait_def::CloudProvider;
use crate::types::{ByteRange, DeltaChange, DeltaFeed, ProviderCapabilities, ProviderQuota};
use cirrus_core::account::ProviderType;
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::state::FileState;

struct MockInternalState {
    entries: HashMap<String, EntryRecord>,
    file_bytes: HashMap<String, Bytes>,
    history: Vec<DeltaChange>,
    token_counter: u64,
    latency: Option<Duration>,
    failures_remaining: u32,
    rate_limit_secs: Option<u64>,
    unauthorized: bool,
}

#[derive(Clone)]
pub struct MockCloudProvider {
    account_id: String,
    account_name: String,
    state: Arc<RwLock<MockInternalState>>,
    quota_total: u64,
}

impl MockCloudProvider {
    pub fn new(account_id: &str, account_name: &str, quota_total: u64) -> Self {
        let now = chrono::Utc::now().timestamp();
        let mut entries = HashMap::new();

        // Create root folder
        let root = EntryRecord {
            id: "root".to_string(),
            account_id: account_id.to_string(),
            remote_id: Some("root".to_string()),
            parent_id: None,
            name: "Cloud Root".to_string(),
            path: "/".to_string(),
            is_directory: true,
            size: 0,
            mtime: now,
            ctime: Some(now),
            mime_type: "inode/directory".to_string(),
            etag: Some("etag_root".to_string()),
            content_hash: None,
            state: FileState::CloudOnly,
            local_path: None,
            thumbnail_url: None,
            error_message: None,
            sync_version: 1,
            last_accessed_at: None,
            created_at: now,
            updated_at: now,
        };
        entries.insert("root".to_string(), root);

        let internal = MockInternalState {
            entries,
            file_bytes: HashMap::new(),
            history: Vec::new(),
            token_counter: 0,
            latency: None,
            failures_remaining: 0,
            rate_limit_secs: None,
            unauthorized: false,
        };

        Self {
            account_id: account_id.to_string(),
            account_name: account_name.to_string(),
            state: Arc::new(RwLock::new(internal)),
            quota_total,
        }
    }

    pub fn set_latency(&self, latency: Option<Duration>) {
        self.state.write().latency = latency;
    }

    pub fn inject_failures(&self, count: u32) {
        self.state.write().failures_remaining = count;
    }

    pub fn inject_rate_limit(&self, retry_after_secs: Option<u64>) {
        self.state.write().rate_limit_secs = retry_after_secs;
    }

    pub fn inject_unauthorized(&self, unauthorized: bool) {
        self.state.write().unauthorized = unauthorized;
    }

    async fn check_simulation(&self) -> Result<()> {
        let (latency, is_rate_limit, is_auth, fail_now) = {
            let mut state = self.state.write();
            let latency = state.latency;
            let is_auth = state.unauthorized;
            let is_rate_limit = state.rate_limit_secs.take();

            let fail_now = if state.failures_remaining > 0 {
                state.failures_remaining -= 1;
                true
            } else {
                false
            };

            (latency, is_rate_limit, is_auth, fail_now)
        };

        if let Some(delay) = latency {
            tokio::time::sleep(delay).await;
        }

        if is_auth {
            return Err(CirrusError::AuthRequired {
                account_id: self.account_id.clone(),
                reason: "OAuth access token expired or revoked in mock".to_string(),
            });
        }

        if let Some(retry_secs) = is_rate_limit {
            return Err(CirrusError::Provider {
                provider: "mock".to_string(),
                message: "429 Too Many Requests: Rate limit exceeded".to_string(),
                retry_after_secs: Some(retry_secs),
            });
        }

        if fail_now {
            return Err(CirrusError::Provider {
                provider: "mock".to_string(),
                message: "Simulated transient network connection drop".to_string(),
                retry_after_secs: Some(1),
            });
        }

        Ok(())
    }
}

#[async_trait]
impl CloudProvider for MockCloudProvider {
    fn id(&self) -> &str {
        &self.account_id
    }

    fn name(&self) -> &str {
        &self.account_name
    }

    fn provider_type(&self) -> ProviderType {
        ProviderType::Mock
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities::SUPPORTS_DELTA
            | ProviderCapabilities::SUPPORTS_RESUMABLE_UPLOAD
            | ProviderCapabilities::SUPPORTS_SERVER_SIDE_COPY
            | ProviderCapabilities::SUPPORTS_TRASH
            | ProviderCapabilities::SUPPORTS_VERSIONS
    }

    async fn list_children(
        &self,
        folder_id: Option<&str>,
        _page_token: Option<&str>,
    ) -> Result<(Vec<EntryRecord>, Option<String>)> {
        self.check_simulation().await?;
        let state = self.state.read();
        let target_parent = folder_id.unwrap_or("root");

        let mut children = Vec::new();
        for entry in state.entries.values() {
            if entry.id == "root" {
                continue;
            }
            if let Some(ref pid) = entry.parent_id {
                if pid == target_parent {
                    children.push(entry.clone());
                }
            }
        }

        Ok((children, None))
    }

    async fn get_metadata(&self, id: &str) -> Result<EntryRecord> {
        self.check_simulation().await?;
        let state = self.state.read();
        state
            .entries
            .get(id)
            .cloned()
            .ok_or_else(|| CirrusError::NotFound {
                entity: "Entry".to_string(),
                id: id.to_string(),
            })
    }

    async fn changes(&self, since_token: Option<&str>) -> Result<DeltaFeed> {
        self.check_simulation().await?;
        let state = self.state.read();
        let since_idx: usize = since_token.and_then(|t| t.parse().ok()).unwrap_or(0);

        let slice = if since_idx < state.history.len() {
            state.history[since_idx..].to_vec()
        } else {
            Vec::new()
        };

        let new_token = state.history.len().to_string();

        Ok(DeltaFeed {
            changes: slice,
            new_delta_token: new_token,
            has_more: false,
        })
    }

    async fn download(&self, id: &str, range: Option<ByteRange>) -> Result<Bytes> {
        self.check_simulation().await?;
        let state = self.state.read();
        let data = state
            .file_bytes
            .get(id)
            .ok_or_else(|| CirrusError::NotFound {
                entity: "FileContent".to_string(),
                id: id.to_string(),
            })?;

        if let Some(r) = range {
            let start = r.start as usize;
            if start >= data.len() {
                return Ok(Bytes::new());
            }
            let end = r
                .end
                .map(|e| (e as usize).min(data.len()))
                .unwrap_or(data.len());
            Ok(data.slice(start..end))
        } else {
            Ok(data.clone())
        }
    }

    async fn upload(
        &self,
        parent_id: Option<&str>,
        name: &str,
        data: Bytes,
        mime_type: &str,
    ) -> Result<EntryRecord> {
        self.check_simulation().await?;
        let mut state = self.state.write();
        let now = chrono::Utc::now().timestamp();
        let id = format!("file_{}", uuid::Uuid::new_v4());
        let parent = parent_id.unwrap_or("root").to_string();

        let parent_path = state
            .entries
            .get(&parent)
            .map(|p| p.path.clone())
            .unwrap_or_else(|| "/".to_string());
        let path = if parent_path == "/" {
            format!("/{}", name)
        } else {
            format!("{}/{}", parent_path, name)
        };

        let entry = EntryRecord {
            id: id.clone(),
            account_id: self.account_id.clone(),
            remote_id: Some(id.clone()),
            parent_id: Some(parent),
            name: name.to_string(),
            path,
            is_directory: false,
            size: data.len() as u64,
            mtime: now,
            ctime: Some(now),
            mime_type: mime_type.to_string(),
            etag: Some(format!("etag_{}", now)),
            content_hash: None,
            state: FileState::CloudOnly,
            local_path: None,
            thumbnail_url: None,
            error_message: None,
            sync_version: 1,
            last_accessed_at: None,
            created_at: now,
            updated_at: now,
        };

        state.entries.insert(id.clone(), entry.clone());
        state.file_bytes.insert(id.clone(), data);

        state.token_counter += 1;
        state.history.push(DeltaChange {
            id: id.clone(),
            is_deleted: false,
            entry: Some(entry.clone()),
            timestamp: now,
        });

        Ok(entry)
    }

    async fn create_folder(&self, parent_id: Option<&str>, name: &str) -> Result<EntryRecord> {
        self.check_simulation().await?;
        let mut state = self.state.write();
        let now = chrono::Utc::now().timestamp();
        let id = format!("folder_{}", uuid::Uuid::new_v4());
        let parent = parent_id.unwrap_or("root").to_string();

        let parent_path = state
            .entries
            .get(&parent)
            .map(|p| p.path.clone())
            .unwrap_or_else(|| "/".to_string());
        let path = if parent_path == "/" {
            format!("/{}", name)
        } else {
            format!("{}/{}", parent_path, name)
        };

        let entry = EntryRecord {
            id: id.clone(),
            account_id: self.account_id.clone(),
            remote_id: Some(id.clone()),
            parent_id: Some(parent),
            name: name.to_string(),
            path,
            is_directory: true,
            size: 0,
            mtime: now,
            ctime: Some(now),
            mime_type: "inode/directory".to_string(),
            etag: Some(format!("etag_folder_{}", now)),
            content_hash: None,
            state: FileState::CloudOnly,
            local_path: None,
            thumbnail_url: None,
            error_message: None,
            sync_version: 1,
            last_accessed_at: None,
            created_at: now,
            updated_at: now,
        };

        state.entries.insert(id.clone(), entry.clone());

        state.token_counter += 1;
        state.history.push(DeltaChange {
            id: id.clone(),
            is_deleted: false,
            entry: Some(entry.clone()),
            timestamp: now,
        });

        Ok(entry)
    }

    async fn rename(&self, id: &str, new_name: &str) -> Result<EntryRecord> {
        self.check_simulation().await?;
        let mut state = self.state.write();
        let now = chrono::Utc::now().timestamp();

        let entry = state
            .entries
            .get_mut(id)
            .ok_or_else(|| CirrusError::NotFound {
                entity: "Entry".to_string(),
                id: id.to_string(),
            })?;

        entry.name = new_name.to_string();
        entry.updated_at = now;
        let cloned = entry.clone();

        state.token_counter += 1;
        state.history.push(DeltaChange {
            id: id.to_string(),
            is_deleted: false,
            entry: Some(cloned.clone()),
            timestamp: now,
        });

        Ok(cloned)
    }

    async fn move_entry(&self, id: &str, new_parent_id: Option<&str>) -> Result<EntryRecord> {
        self.check_simulation().await?;
        let mut state = self.state.write();
        let now = chrono::Utc::now().timestamp();

        let new_parent = new_parent_id.unwrap_or("root").to_string();
        let entry = state
            .entries
            .get_mut(id)
            .ok_or_else(|| CirrusError::NotFound {
                entity: "Entry".to_string(),
                id: id.to_string(),
            })?;

        entry.parent_id = Some(new_parent);
        entry.updated_at = now;
        let cloned = entry.clone();

        state.token_counter += 1;
        state.history.push(DeltaChange {
            id: id.to_string(),
            is_deleted: false,
            entry: Some(cloned.clone()),
            timestamp: now,
        });

        Ok(cloned)
    }

    async fn copy_entry(
        &self,
        id: &str,
        destination_parent_id: Option<&str>,
        new_name: Option<&str>,
    ) -> Result<EntryRecord> {
        self.check_simulation().await?;
        let (source_entry, source_bytes) = {
            let state = self.state.read();
            let entry = state
                .entries
                .get(id)
                .cloned()
                .ok_or_else(|| CirrusError::NotFound {
                    entity: "Entry".to_string(),
                    id: id.to_string(),
                })?;
            let bytes = state.file_bytes.get(id).cloned().unwrap_or_default();
            (entry, bytes)
        };

        let copy_name = new_name
            .map(|n| n.to_string())
            .unwrap_or_else(|| format!("Copy of {}", source_entry.name));

        if source_entry.is_directory {
            self.create_folder(destination_parent_id, &copy_name).await
        } else {
            self.upload(
                destination_parent_id,
                &copy_name,
                source_bytes,
                &source_entry.mime_type,
            )
            .await
        }
    }

    async fn delete_entry(&self, id: &str, _permanent: bool) -> Result<()> {
        self.check_simulation().await?;
        let mut state = self.state.write();
        let now = chrono::Utc::now().timestamp();

        if state.entries.remove(id).is_none() {
            return Err(CirrusError::NotFound {
                entity: "Entry".to_string(),
                id: id.to_string(),
            });
        }
        state.file_bytes.remove(id);

        state.token_counter += 1;
        state.history.push(DeltaChange {
            id: id.to_string(),
            is_deleted: true,
            entry: None,
            timestamp: now,
        });

        Ok(())
    }

    async fn restore(&self, id: &str) -> Result<EntryRecord> {
        self.check_simulation().await?;
        self.get_metadata(id).await
    }

    async fn quota(&self) -> Result<ProviderQuota> {
        self.check_simulation().await?;
        let state = self.state.read();
        let used: u64 = state.file_bytes.values().map(|b| b.len() as u64).sum();

        Ok(ProviderQuota {
            total_bytes: self.quota_total,
            used_bytes: used,
            trash_bytes: None,
        })
    }

    async fn share_link(&self, id: &str) -> Result<String> {
        self.check_simulation().await?;
        Ok(format!("https://mock.drive.internal/share/{}", id))
    }
}
