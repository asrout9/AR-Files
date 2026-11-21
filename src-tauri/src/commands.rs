use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::state::AppState;
use cirrus_core::account::AccountRecord;
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::Result;
use cirrus_core::query::{FolderListingQuery, PagedResult};
use cirrus_ops::CollisionResolution;
use cirrus_platform::DesktopEntry;
use cirrus_providers::CloudProvider;

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> CommandResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(message: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message),
        }
    }
}

pub async fn list_accounts(state: &AppState) -> Result<Vec<AccountRecord>> {
    state.accounts_repo.list_accounts()
}

pub async fn list_entries(
    state: &AppState,
    query: FolderListingQuery,
) -> Result<PagedResult<EntryRecord>> {
    state.entries_repo.list_children_paged(&query)
}

pub async fn search_fts(
    state: &AppState,
    search_term: String,
    limit: usize,
) -> Result<Vec<EntryRecord>> {
    state.entries_repo.search_fts(&search_term, limit)
}

pub async fn create_folder(
    state: &AppState,
    account_id: String,
    parent_id: Option<String>,
    name: String,
) -> Result<EntryRecord> {
    state
        .ops_mgr
        .create_folder(&account_id, parent_id.as_deref(), &name)
        .await
}

pub async fn rename_entry(state: &AppState, id: String, new_name: String) -> Result<EntryRecord> {
    state.ops_mgr.rename_entry(&id, &new_name).await
}

pub async fn move_entries(
    state: &AppState,
    entry_ids: Vec<String>,
    target_parent_id: Option<String>,
) -> Result<Vec<EntryRecord>> {
    state
        .ops_mgr
        .move_entries(&entry_ids, target_parent_id.as_deref())
        .await
}

pub async fn copy_entries(
    state: &AppState,
    entry_ids: Vec<String>,
    target_parent_id: Option<String>,
    collision: CollisionResolution,
) -> Result<Vec<EntryRecord>> {
    state
        .ops_mgr
        .copy_entries(&entry_ids, target_parent_id.as_deref(), collision)
        .await
}

pub async fn trash_entries(state: &AppState, entry_ids: Vec<String>) -> Result<()> {
    state.ops_mgr.trash_entries(&entry_ids).await
}

pub async fn undo_last_operation(state: &AppState) -> Result<()> {
    state.ops_mgr.undo().await?;
    Ok(())
}

pub async fn redo_last_operation(state: &AppState) -> Result<()> {
    state.ops_mgr.redo().await?;
    Ok(())
}

pub async fn delete_permanently(state: &AppState, entry_ids: Vec<String>) -> Result<()> {
    state.ops_mgr.delete_permanently(&entry_ids).await
}

pub fn preview_batch_rename(
    state: &AppState,
    entry_ids: Vec<String>,
    rule: cirrus_ops::BatchRenameRule,
) -> Result<Vec<cirrus_ops::BatchRenamePreview>> {
    state.ops_mgr.preview_batch_rename(&entry_ids, &rule)
}

pub async fn apply_batch_rename(
    state: &AppState,
    previews: Vec<cirrus_ops::BatchRenamePreview>,
) -> Result<Vec<EntryRecord>> {
    state.ops_mgr.apply_batch_rename(&previews).await
}

pub async fn compress_entries(source_paths: Vec<String>, output_path: String) -> Result<()> {
    let sources: Vec<std::path::PathBuf> = source_paths
        .into_iter()
        .map(std::path::PathBuf::from)
        .collect();
    let out = std::path::Path::new(&output_path);

    if output_path.ends_with(".zip") {
        cirrus_ops::ArchiveManager::compress_zip(&sources, out).await
    } else {
        cirrus_ops::ArchiveManager::compress_tar_gz(&sources, out).await
    }
}

pub async fn extract_archive(archive_path: String, destination_dir: String) -> Result<()> {
    let arch = std::path::Path::new(&archive_path);
    let dest = std::path::Path::new(&destination_dir);

    if archive_path.ends_with(".zip") {
        cirrus_ops::ArchiveManager::extract_zip(arch, dest).await
    } else {
        cirrus_ops::ArchiveManager::extract_tar_gz(arch, dest).await
    }
}

pub async fn recover_journal(state: &AppState) -> Result<usize> {
    state.ops_mgr.recover_pending_operations().await
}

pub fn get_default_app(state: &AppState, mime_type: &str) -> Option<DesktopEntry> {
    state.desktop_mgr.get_default_app(mime_type).cloned()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatusInfo {
    pub account_id: String,
    pub sync_status: String,
    pub is_offline: bool,
    pub pending_uploads_count: usize,
    pub quota_total: Option<u64>,
    pub quota_used: Option<u64>,
}

pub async fn free_up_space(state: &AppState, entry_id: String) -> Result<()> {
    state.cache_mgr.free_up_space(&entry_id)
}

pub async fn pin_entry(state: &AppState, entry_id: String) -> Result<()> {
    state.entries_repo.update_state(
        &entry_id,
        cirrus_core::state::FileState::Pinned,
        None,
        None,
    )?;

    // Trigger background hydration if not hydrated
    if let Ok(Some(entry)) = state.entries_repo.get_entry(&entry_id) {
        if entry.state == cirrus_core::state::FileState::Pinned && entry.local_path.is_none() {
            let provider_opt = state.providers.read().get(&entry.account_id).cloned();
            let hydration_mgr = state.hydration_mgr.clone();
            tokio::spawn(async move {
                if let Some(provider) = provider_opt {
                    let _ = hydration_mgr
                        .hydrate_with_provider(
                            &entry,
                            cirrus_sync::HydrationPriority::Pinned,
                            provider,
                        )
                        .await;
                } else {
                    let _ = hydration_mgr
                        .hydrate(&entry, cirrus_sync::HydrationPriority::Pinned)
                        .await;
                }
            });
        }
    }
    Ok(())
}

pub async fn unpin_entry(state: &AppState, entry_id: String) -> Result<()> {
    state.entries_repo.update_state(
        &entry_id,
        cirrus_core::state::FileState::Available,
        None,
        None,
    )
}

pub async fn hydrate_entry(state: &AppState, entry_id: String) -> Result<String> {
    let entry = state.entries_repo.get_entry(&entry_id)?.ok_or_else(|| {
        cirrus_core::error::CirrusError::NotFound {
            entity: "Entry".to_string(),
            id: entry_id.clone(),
        }
    })?;

    if let Some(ref path) = entry.local_path {
        let p = std::path::Path::new(path);
        if p.exists() {
            return Ok(path.clone());
        }
    }

    let provider_opt = state.providers.read().get(&entry.account_id).cloned();
    let local_path = if let Some(provider) = provider_opt {
        state
            .hydration_mgr
            .hydrate_with_provider(
                &entry,
                cirrus_sync::HydrationPriority::UserInteractive,
                provider,
            )
            .await?
    } else {
        state
            .hydration_mgr
            .hydrate(&entry, cirrus_sync::HydrationPriority::UserInteractive)
            .await?
    };

    Ok(local_path.to_string_lossy().to_string())
}

pub async fn cancel_hydration(state: &AppState, entry_id: String) -> Result<()> {
    state.hydration_mgr.cancel(&entry_id);
    Ok(())
}

pub async fn start_google_oauth(
    state: &AppState,
    account_name: Option<String>,
) -> Result<AccountRecord> {
    let acc_id = format!("acc_gdrive_{}", &uuid::Uuid::new_v4().to_string()[..8]);
    let name = account_name.unwrap_or_else(|| "Google Drive".to_string());

    let oauth_flow = cirrus_providers::GoogleOAuthFlow::new(state.credentials_mgr.clone());
    let _token_resp = oauth_flow.execute_flow(&acc_id).await?;

    let gdrive_provider = Arc::new(cirrus_providers::GoogleDriveProvider::new(
        &acc_id,
        &name,
        state.credentials_mgr.clone(),
    ));

    // Fetch initial quota
    let quota = gdrive_provider
        .quota()
        .await
        .unwrap_or(cirrus_providers::ProviderQuota {
            total_bytes: 15 * 1024 * 1024 * 1024,
            used_bytes: 0,
            trash_bytes: None,
        });

    let now = chrono::Utc::now().timestamp();
    let account = AccountRecord {
        id: acc_id.clone(),
        provider_type: cirrus_core::account::ProviderType::GoogleDrive,
        name: name.clone(),
        email: None,
        root_folder_id: Some("root".to_string()),
        quota_total: Some(quota.total_bytes),
        quota_used: Some(quota.used_bytes),
        sync_status: cirrus_core::account::AccountSyncStatus::Indexing,
        delta_token: None,
        mount_path: None,
        created_at: now,
        updated_at: now,
    };

    state.accounts_repo.upsert_account(&account)?;
    state.register_cloud_account(&acc_id, gdrive_provider.clone());

    // Spawn background initial scan
    let engine_opt = state.sync_engines.read().get(&acc_id).cloned();
    if let Some(engine) = engine_opt {
        tokio::spawn(async move {
            let _ = engine.run_initial_scan(None).await;
        });
    }

    Ok(account)
}

pub async fn get_account_quota(
    state: &AppState,
    account_id: String,
) -> Result<cirrus_providers::ProviderQuota> {
    let provider_opt = state.providers.read().get(&account_id).cloned();
    let provider = provider_opt.ok_or_else(|| cirrus_core::error::CirrusError::NotFound {
        entity: "Provider".to_string(),
        id: account_id.clone(),
    })?;

    let quota = provider.quota().await?;
    let _ =
        state
            .accounts_repo
            .update_account_quota(&account_id, quota.total_bytes, quota.used_bytes);
    Ok(quota)
}

pub async fn set_offline_mode(state: &AppState, account_id: String, offline: bool) -> Result<()> {
    if let Some(queue) = state.upload_queues.read().get(&account_id) {
        queue.set_offline(offline);
    }

    let status = if offline {
        cirrus_core::account::AccountSyncStatus::Offline
    } else {
        cirrus_core::account::AccountSyncStatus::Idle
    };

    state
        .accounts_repo
        .update_sync_status(&account_id, status, None)?;
    Ok(())
}

pub async fn get_sync_status(state: &AppState, account_id: String) -> Result<SyncStatusInfo> {
    let account = state
        .accounts_repo
        .get_account(&account_id)?
        .ok_or_else(|| cirrus_core::error::CirrusError::NotFound {
            entity: "Account".to_string(),
            id: account_id.clone(),
        })?;

    let is_offline = account.sync_status == cirrus_core::account::AccountSyncStatus::Offline;
    let pending_uploads = state
        .upload_queues
        .read()
        .get(&account_id)
        .map(|q| q.pending_count())
        .unwrap_or(0);

    Ok(SyncStatusInfo {
        account_id,
        sync_status: account.sync_status.as_str().to_string(),
        is_offline,
        pending_uploads_count: pending_uploads,
        quota_total: account.quota_total,
        quota_used: account.quota_used,
    })
}

pub async fn queue_upload(
    state: &AppState,
    account_id: String,
    parent_id: Option<String>,
    local_path: String,
) -> Result<cirrus_sync::UploadItem> {
    let queue_opt = state.upload_queues.read().get(&account_id).cloned();
    let queue = queue_opt.ok_or_else(|| cirrus_core::error::CirrusError::NotFound {
        entity: "UploadQueue".to_string(),
        id: account_id.clone(),
    })?;

    let path = std::path::Path::new(&local_path);
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file.dat".to_string());

    let item = queue.enqueue(
        None,
        parent_id.as_deref(),
        &name,
        path,
        "application/octet-stream",
    )?;

    // If online, kick off queue processor
    if !queue.is_offline() {
        if let Some(provider) = state.providers.read().get(&account_id).cloned() {
            let q = queue.clone();
            tokio::spawn(async move {
                let _ = q.process_next(provider).await;
            });
        }
    }

    Ok(item)
}

pub async fn trigger_sync(state: &AppState, account_id: String) -> Result<usize> {
    let engine_opt = state.sync_engines.read().get(&account_id).cloned();
    let engine = engine_opt.ok_or_else(|| cirrus_core::error::CirrusError::NotFound {
        entity: "SyncEngine".to_string(),
        id: account_id.clone(),
    })?;

    let changes = engine.reconcile_delta_once().await?;

    // Also process any pending uploads if online
    let queue_and_provider = {
        let q = state.upload_queues.read().get(&account_id).cloned();
        let p = state.providers.read().get(&account_id).cloned();
        (q, p)
    };

    if let (Some(queue), Some(provider)) = queue_and_provider {
        if !queue.is_offline() {
            let _ = queue.process_next(provider).await;
        }
    }

    Ok(changes)
}

pub async fn get_cache_stats(state: &AppState) -> Result<cirrus_sync::CacheStats> {
    state.cache_mgr.calculate_stats()
}

pub fn create_vfs_for_account(
    state: &AppState,
    account_id: &str,
    mount_point: &std::path::Path,
) -> cirrus_vfs::CirrusVfs {
    cirrus_vfs::CirrusVfs::new(account_id, mount_point, state.entries_repo.clone())
}

pub async fn list_local_directory(state: &AppState, path: String) -> Result<Vec<EntryRecord>> {
    let local_entries = state.hangproof_fs.read_dir_hangproof(&path).await?;
    let records = local_entries
        .into_iter()
        .map(|meta| meta.to_entry_record("acc_local", Some(path.clone()), "local"))
        .collect();
    Ok(records)
}

pub async fn stat_local_file(
    state: &AppState,
    path: String,
) -> Result<cirrus_platform::LocalFileMetadata> {
    state.hangproof_fs.stat_hangproof(&path).await
}
