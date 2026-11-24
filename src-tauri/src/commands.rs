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
    if account_id == "acc_local" || parent_id.as_deref().map_or(false, |p| p.starts_with('/')) {
        let parent = parent_id.unwrap_or_else(|| {
            std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string())
        });
        let new_dir_path = std::path::Path::new(&parent).join(&name);
        std::fs::create_dir_all(&new_dir_path).map_err(|e| {
            cirrus_core::error::CirrusError::Io(format!("Failed to create folder: {}", e))
        })?;
        let meta = state.hangproof_fs.stat_hangproof(&new_dir_path).await?;
        let record = meta.to_entry_record("acc_local", Some(parent), "local");
        return Ok(record);
    }

    let provider_opt = state.providers.read().get(&account_id).cloned();
    if let Some(provider) = provider_opt {
        let remote_parent = parent_id.as_deref();
        if let Ok(remote_rec) = provider.create_folder(remote_parent, &name).await {
            let _ = state.entries_repo.upsert_entry(&remote_rec);
            return Ok(remote_rec);
        }
    }

    state
        .ops_mgr
        .create_folder(&account_id, parent_id.as_deref(), &name)
        .await
}

pub async fn rename_entry(state: &AppState, id: String, new_name: String) -> Result<EntryRecord> {
    if id.starts_with('/') || std::path::Path::new(&id).is_absolute() || std::path::Path::new(&id).exists() {
        let old_path = std::path::Path::new(&id);
        if !old_path.exists() {
            return Err(cirrus_core::error::CirrusError::NotFound {
                entity: "Local File".to_string(),
                id: id.clone(),
            });
        }
        let parent = old_path.parent().unwrap_or_else(|| std::path::Path::new("/"));
        let new_path = parent.join(&new_name);
        std::fs::rename(old_path, &new_path).map_err(|e| {
            cirrus_core::error::CirrusError::Io(format!(
                "Failed to rename '{}' -> '{}': {}",
                id,
                new_path.display(),
                e
            ))
        })?;

        let meta = state.hangproof_fs.stat_hangproof(&new_path).await?;
        let parent_str = parent.to_string_lossy().to_string();
        let record = meta.to_entry_record("acc_local", Some(parent_str), "local");
        return Ok(record);
    }

    if let Ok(Some(entry)) = state.entries_repo.get_entry(&id) {
        let provider_opt = state.providers.read().get(&entry.account_id).cloned();
        if let Some(provider) = provider_opt {
            let remote_id = entry.remote_id.as_deref().unwrap_or(&id);
            let _ = provider.rename(remote_id, &new_name).await;
        }
    }

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
    for id in &entry_ids {
        if id.starts_with('/') || std::path::Path::new(id).is_absolute() || std::path::Path::new(id).exists() {
            let path = std::path::Path::new(id);
            if path.exists() {
                if let Err(e) = state.trash_mgr.move_to_trash(path) {
                    tracing::warn!("trash_mgr failed to trash local path '{}': {}. Falling back to removal.", id, e);
                    if path.is_dir() {
                        let _ = std::fs::remove_dir_all(path);
                    } else {
                        let _ = std::fs::remove_file(path);
                    }
                }
            }
        } else {
            if let Ok(Some(entry)) = state.entries_repo.get_entry(id) {
                if let Some(ref local) = entry.local_path {
                    let p = std::path::Path::new(local);
                    if p.exists() {
                        let _ = std::fs::remove_file(p);
                    }
                }
                let content_cache = state.cache_dir.join("content").join(id);
                if content_cache.exists() {
                    let _ = std::fs::remove_file(content_cache);
                }

                let provider_opt = state.providers.read().get(&entry.account_id).cloned();
                if let Some(provider) = provider_opt {
                    let remote_id = entry.remote_id.as_deref().unwrap_or(id);
                    if let Err(e) = provider.delete_entry(remote_id, false).await {
                        tracing::warn!("Failed to trash entry on provider: {}", e);
                    }
                }

                let _ = state.entries_repo.delete_entry(id);
            }
        }
    }

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
    for id in &entry_ids {
        if id.starts_with('/') || std::path::Path::new(id).is_absolute() || std::path::Path::new(id).exists() {
            let path = std::path::Path::new(id);
            if path.exists() {
                if path.is_dir() {
                    let _ = std::fs::remove_dir_all(path);
                } else {
                    let _ = std::fs::remove_file(path);
                }
            }
        } else {
            if let Ok(Some(entry)) = state.entries_repo.get_entry(id) {
                if let Some(ref local) = entry.local_path {
                    let p = std::path::Path::new(local);
                    if p.exists() {
                        let _ = std::fs::remove_file(p);
                    }
                }
                let content_cache = state.cache_dir.join("content").join(id);
                if content_cache.exists() {
                    let _ = std::fs::remove_file(content_cache);
                }

                let provider_opt = state.providers.read().get(&entry.account_id).cloned();
                if let Some(provider) = provider_opt {
                    let remote_id = entry.remote_id.as_deref().unwrap_or(id);
                    if let Err(e) = provider.delete_entry(remote_id, true).await {
                        tracing::warn!("Failed to permanently delete entry on provider: {}", e);
                    }
                }

                let _ = state.entries_repo.delete_entry(id);
            }
        }
    }

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
    let mut updated = Vec::new();
    let mut cloud_previews = Vec::new();

    for prev in previews {
        if prev.entry_id.starts_with('/') || std::path::Path::new(&prev.entry_id).is_absolute() || std::path::Path::new(&prev.entry_id).exists() {
            let old_path = std::path::Path::new(&prev.entry_id);
            if old_path.exists() {
                let parent = old_path.parent().unwrap_or_else(|| std::path::Path::new("/"));
                let new_path = parent.join(&prev.new_name);
                if std::fs::rename(old_path, &new_path).is_ok() {
                    if let Ok(meta) = state.hangproof_fs.stat_hangproof(&new_path).await {
                        let rec = meta.to_entry_record("acc_local", Some(parent.to_string_lossy().to_string()), "local");
                        updated.push(rec);
                    }
                }
            }
        } else {
            cloud_previews.push(prev);
        }
    }

    if !cloud_previews.is_empty() {
        let cloud_updated = state.ops_mgr.apply_batch_rename(&cloud_previews).await?;
        updated.extend(cloud_updated);
    }

    Ok(updated)
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

pub async fn compress_to_size(
    source_path: String,
    target_bytes: u64,
    formatted_size: String,
    custom_output_path: Option<String>,
) -> Result<cirrus_ops::CompressionResult> {
    let src = std::path::Path::new(&source_path);
    let out = match custom_output_path {
        Some(ref p) if !p.is_empty() => std::path::PathBuf::from(p),
        _ => cirrus_ops::CompressManager::generate_compressed_filename(src, &formatted_size),
    };
    cirrus_ops::CompressManager::compress_to_size(src, target_bytes, &out).await
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
    state.desktop_mgr.read().get_default_app(mime_type).cloned()
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GoogleAuthParams {
    pub account_name: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OneDriveAuthParams {
    pub name: String,
    pub email: Option<String>,
    pub token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenericAccountParams {
    pub name: String,
    pub config: Option<cirrus_providers::GenericCloudConfig>,
    pub provider_type: Option<String>,
    pub endpoint: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub bucket: Option<String>,
}

pub async fn start_google_oauth(
    state: &AppState,
    params: GoogleAuthParams,
) -> Result<AccountRecord> {
    let acc_id = format!("acc_gdrive_{}", &uuid::Uuid::new_v4().to_string()[..8]);
    let name = params.account_name.clone().unwrap_or_else(|| "Google Drive".to_string());

    let (gdrive_provider, _oauth_flow_opt) = if let Some(ref token) = params.access_token {
        let trimmed = token.trim();
        if !trimmed.is_empty() {
            let access_key = cirrus_providers::CredentialsManager::access_token_key(&acc_id);
            state.credentials_mgr.store_secret(&access_key, trimmed)?;
            if let Some(ref rtok) = params.refresh_token {
                if !rtok.trim().is_empty() {
                    let ref_key = cirrus_providers::CredentialsManager::refresh_token_key(&acc_id);
                    state.credentials_mgr.store_secret(&ref_key, rtok.trim())?;
                }
            }
            let provider = Arc::new(cirrus_providers::GoogleDriveProvider::new(
                &acc_id,
                &name,
                state.credentials_mgr.clone(),
            ));
            (provider, None)
        } else {
            return Err(cirrus_core::error::CirrusError::Authentication(
                "Access token cannot be empty. Please paste a valid Google OAuth Access Token.".to_string(),
            ));
        }
    } else {
        // System Browser Flow requires a real registered OAuth Client ID
        let client_id_opt = params
            .client_id
            .filter(|s| !s.trim().is_empty())
            .or_else(|| state.settings_repo.get_string("google_client_id").ok().flatten())
            .or_else(|| std::env::var("GOOGLE_DRIVE_CLIENT_ID").ok());

        let client_secret_opt = params
            .client_secret
            .filter(|s| !s.trim().is_empty())
            .or_else(|| state.settings_repo.get_string("google_client_secret").ok().flatten())
            .or_else(|| std::env::var("GOOGLE_DRIVE_CLIENT_SECRET").ok());

        let (cid, csec) = match client_id_opt {
            Some(ref c) if !c.trim().is_empty() && !c.contains("arfilesdesktopclientfedora") => {
                let _ = state.settings_repo.set_string("google_client_id", c.trim());
                if let Some(ref sec) = client_secret_opt {
                    let _ = state.settings_repo.set_string("google_client_secret", sec.trim());
                }
                (c.trim().to_string(), client_secret_opt)
            }
            _ => (
                cirrus_providers::DEFAULT_GOOGLE_CLIENT_ID.to_string(),
                Some(cirrus_providers::DEFAULT_GOOGLE_CLIENT_SECRET.to_string()),
            ),
        };

        let oauth_flow = Arc::new(cirrus_providers::GoogleOAuthFlow::with_client(
            cid,
            csec,
            state.credentials_mgr.clone(),
        ));
        oauth_flow.execute_flow(&acc_id).await?;

        let provider = Arc::new(cirrus_providers::GoogleDriveProvider::with_oauth_flow(
            &acc_id,
            &name,
            oauth_flow.clone(),
            state.credentials_mgr.clone(),
        ));
        (provider, Some(oauth_flow))
    };

    // Live API call: Fetch real account info and storage quota from Google Drive API
    let (detected_email, quota) = gdrive_provider.fetch_about().await?;
    let root_folder_id = gdrive_provider
        .fetch_root_id()
        .await
        .unwrap_or_else(|_| "root".to_string());

    let now = chrono::Utc::now().timestamp();
    let account = AccountRecord {
        id: acc_id.clone(),
        provider_type: cirrus_core::account::ProviderType::GoogleDrive,
        name: name.clone(),
        email: detected_email.or(params.account_name),
        root_folder_id: Some(root_folder_id),
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

    // Spawn background initial scan to crawl real Google Drive files into metadata.db
    let engine_opt = state.sync_engines.read().get(&acc_id).cloned();
    let acc_id_clone = acc_id.clone();
    if let Some(engine) = engine_opt {
        tokio::spawn(async move {
            tracing::info!("Starting background scan for Google Drive '{}'...", acc_id_clone);
            if let Err(e) = engine.run_initial_scan(None).await {
                tracing::error!("Background scan error for {}: {}", acc_id_clone, e);
            }
        });
    }

    Ok(account)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCredentialsParams {
    pub account_id: String,
    pub token: String,
    pub refresh_token: Option<String>,
}

pub async fn update_account_credentials(
    state: &AppState,
    params: UpdateCredentialsParams,
) -> Result<()> {
    if params.token.trim() == "browser" {
        let account = state
            .accounts_repo
            .get_account(&params.account_id)?
            .ok_or_else(|| {
                cirrus_core::error::CirrusError::NotFound {
                    entity: "Account".to_string(),
                    id: params.account_id.clone(),
                }
            })?;

        match account.provider_type {
            cirrus_core::account::ProviderType::GoogleDrive => {
                let (cid, csec) = match state.settings_repo.get_string("google_client_id").ok().flatten() {
                    Some(ref c) if !c.trim().is_empty() && !c.contains("arfilesdesktopclientfedora") => {
                        let sec = state.settings_repo.get_string("google_client_secret").ok().flatten();
                        (c.trim().to_string(), sec)
                    }
                    _ => (
                        cirrus_providers::DEFAULT_GOOGLE_CLIENT_ID.to_string(),
                        Some(cirrus_providers::DEFAULT_GOOGLE_CLIENT_SECRET.to_string()),
                    ),
                };

                let oauth_flow = Arc::new(cirrus_providers::GoogleOAuthFlow::with_client(
                    cid,
                    csec,
                    state.credentials_mgr.clone(),
                ));
                oauth_flow.execute_flow(&params.account_id).await?;

                state.accounts_repo.update_sync_status(
                    &params.account_id,
                    cirrus_core::account::AccountSyncStatus::Idle,
                    None,
                )?;

                let _ = state.entries_repo.reset_error_entries_for_account(&params.account_id);

                let provider = Arc::new(cirrus_providers::GoogleDriveProvider::with_oauth_flow(
                    &account.id,
                    &account.name,
                    oauth_flow,
                    state.credentials_mgr.clone(),
                ));
                state.register_cloud_account(&account.id, provider);
            }
            cirrus_core::account::ProviderType::OneDrive => {
                let client_id = state
                    .settings_repo
                    .get_string("onedrive_client_id")
                    .ok()
                    .flatten()
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| cirrus_providers::DEFAULT_ONEDRIVE_CLIENT_ID.to_string());

                let client_secret = state
                    .settings_repo
                    .get_string("onedrive_client_secret")
                    .ok()
                    .flatten()
                    .filter(|s| !s.trim().is_empty())
                    .or_else(|| Some(cirrus_providers::DEFAULT_ONEDRIVE_CLIENT_SECRET.to_string()));

                let oauth_flow = Arc::new(cirrus_providers::OneDriveOAuthFlow::with_client(
                    client_id,
                    client_secret,
                    state.credentials_mgr.clone(),
                ));
                oauth_flow.execute_flow(&params.account_id).await?;

                state.accounts_repo.update_sync_status(
                    &params.account_id,
                    cirrus_core::account::AccountSyncStatus::Idle,
                    None,
                )?;

                let _ = state.entries_repo.reset_error_entries_for_account(&params.account_id);

                let provider = Arc::new(cirrus_providers::OneDriveProvider::with_oauth_flow(
                    &account.id,
                    &account.name,
                    oauth_flow,
                    state.credentials_mgr.clone(),
                ));
                state.register_cloud_account(&account.id, provider);
            }
            _ => {
                return Err(cirrus_core::error::CirrusError::Validation(
                    "Browser OAuth is only supported for Google Drive and Microsoft OneDrive".to_string(),
                ));
            }
        }

        return Ok(());
    }

    let raw_token = params.token.trim();
    let token_clean = raw_token
        .trim_matches('"')
        .trim_matches('\'')
        .trim_start_matches("Bearer ")
        .trim_start_matches("bearer ")
        .trim()
        .to_string();

    if token_clean.is_empty() {
        return Err(cirrus_core::error::CirrusError::Validation("Access token cannot be empty".to_string()));
    }

    let access_key = cirrus_providers::CredentialsManager::access_token_key(&params.account_id);
    state.credentials_mgr.store_secret(&access_key, &token_clean)?;

    if let Some(ref r_token) = params.refresh_token {
        let clean_ref = r_token.trim().trim_matches('"').trim_matches('\'').trim();
        if !clean_ref.is_empty() {
            let ref_key = cirrus_providers::CredentialsManager::refresh_token_key(&params.account_id);
            state.credentials_mgr.store_secret(&ref_key, clean_ref)?;
        }
    }

    // Reset account sync status to Idle in DB
    state.accounts_repo.update_sync_status(
        &params.account_id,
        cirrus_core::account::AccountSyncStatus::Idle,
        None,
    )?;

    // Reset any error files for this account back to CloudOnly
    let _ = state.entries_repo.reset_error_entries_for_account(&params.account_id);

    // Re-register provider
    if let Some(account) = state.accounts_repo.get_account(&params.account_id)? {
        match account.provider_type {
            cirrus_core::account::ProviderType::GoogleDrive => {
                let provider = Arc::new(cirrus_providers::GoogleDriveProvider::new(
                    &account.id,
                    &account.name,
                    state.credentials_mgr.clone(),
                ));
                state.register_cloud_account(&account.id, provider);
            }
            cirrus_core::account::ProviderType::OneDrive => {
                let provider = Arc::new(cirrus_providers::OneDriveProvider::new(
                    &account.id,
                    &account.name,
                    state.credentials_mgr.clone(),
                ));
                state.register_cloud_account(&account.id, provider);
            }
            _ => {}
        }
    }

    Ok(())
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsInfo {
    pub total_indexed_entries: usize,
    pub accounts_count: usize,
    pub cache_total_bytes: u64,
    pub cache_evictable_bytes: u64,
    pub download_bandwidth_limit_bps: u64,
    pub upload_bandwidth_limit_bps: u64,
    pub pending_uploads_count: usize,
    pub active_providers: Vec<String>,
}

pub async fn search_all_accounts(
    state: &AppState,
    search_term: String,
    limit: usize,
) -> Result<Vec<EntryRecord>> {
    state.entries_repo.search_fts(&search_term, limit)
}

pub async fn get_file_versions(
    state: &AppState,
    account_id: String,
    entry_id: String,
) -> Result<Vec<cirrus_providers::FileVersion>> {
    let provider_opt = state.providers.read().get(&account_id).cloned();
    if let Some(provider) = provider_opt {
        provider.versions(&entry_id).await
    } else {
        Ok(Vec::new())
    }
}

pub async fn get_share_link(
    state: &AppState,
    account_id: String,
    entry_id: String,
) -> Result<String> {
    let provider_opt = state.providers.read().get(&account_id).cloned();
    let provider = provider_opt.ok_or_else(|| cirrus_core::error::CirrusError::NotFound {
        entity: "Provider".to_string(),
        id: account_id.clone(),
    })?;

    provider.share_link(&entry_id).await
}

pub async fn free_up_all_cache(state: &AppState) -> Result<u64> {
    state.cache_mgr.free_up_all()
}

pub async fn set_bandwidth_limits(
    state: &AppState,
    download_bps: u64,
    upload_bps: u64,
) -> Result<()> {
    state.download_limiter.set_limit(download_bps);
    state.upload_limiter.set_limit(upload_bps);
    let _ = state
        .settings_repo
        .set_string("download_limit_bps", &download_bps.to_string());
    let _ = state
        .settings_repo
        .set_string("upload_limit_bps", &upload_bps.to_string());
    Ok(())
}

pub async fn get_bandwidth_limits(state: &AppState) -> Result<(u64, u64)> {
    Ok((
        state.download_limiter.get_limit(),
        state.upload_limiter.get_limit(),
    ))
}

pub async fn get_diagnostics(state: &AppState) -> Result<DiagnosticsInfo> {
    let accounts = state.accounts_repo.list_accounts()?;
    let cache_stats = state
        .cache_mgr
        .calculate_stats()
        .unwrap_or(cirrus_sync::CacheStats {
            total_cached_bytes: 0,
            evictable_bytes: 0,
            pinned_bytes: 0,
        });

    let providers_list: Vec<String> = state.providers.read().keys().cloned().collect();
    let mut pending_uploads = 0;
    for q in state.upload_queues.read().values() {
        pending_uploads += q.pending_count();
    }

    Ok(DiagnosticsInfo {
        total_indexed_entries: state
            .entries_repo
            .search_fts("", 100_000)
            .map(|v| v.len())
            .unwrap_or(0),
        accounts_count: accounts.len(),
        cache_total_bytes: cache_stats.total_cached_bytes,
        cache_evictable_bytes: cache_stats.evictable_bytes,
        download_bandwidth_limit_bps: state.download_limiter.get_limit(),
        upload_bandwidth_limit_bps: state.upload_limiter.get_limit(),
        pending_uploads_count: pending_uploads,
        active_providers: providers_list,
    })
}

pub async fn generate_thumbnail(state: &AppState, path: String) -> Result<Option<String>> {
    let p = std::path::Path::new(&path);
    if let Some(cached) = state
        .thumbnail_mgr
        .get_cached_thumbnail(p, cirrus_platform::ThumbnailSize::Normal)
    {
        return Ok(Some(cached.to_string_lossy().to_string()));
    }
    Ok(None)
}

pub async fn add_onedrive_account(
    state: &AppState,
    params: OneDriveAuthParams,
) -> Result<AccountRecord> {
    let acc_id = format!("acc_onedrive_{}", &uuid::Uuid::new_v4().to_string()[..8]);
    let name = if params.name.trim().is_empty() {
        "OneDrive".to_string()
    } else {
        params.name.trim().to_string()
    };

    let raw_token = params.token.as_deref().unwrap_or("").trim();
    let is_browser = raw_token.is_empty() || raw_token == "browser";

    let provider = if is_browser {
        let client_id = state
            .settings_repo
            .get_string("onedrive_client_id")
            .ok()
            .flatten()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| cirrus_providers::DEFAULT_ONEDRIVE_CLIENT_ID.to_string());

        let client_secret = state
            .settings_repo
            .get_string("onedrive_client_secret")
            .ok()
            .flatten()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| Some(cirrus_providers::DEFAULT_ONEDRIVE_CLIENT_SECRET.to_string()));

        let oauth_flow = Arc::new(cirrus_providers::OneDriveOAuthFlow::with_client(
            client_id,
            client_secret,
            state.credentials_mgr.clone(),
        ));
        oauth_flow.execute_flow(&acc_id).await?;

        Arc::new(cirrus_providers::OneDriveProvider::with_oauth_flow(
            &acc_id,
            &name,
            oauth_flow,
            state.credentials_mgr.clone(),
        ))
    } else {
        let token_clean = raw_token
            .trim_matches('"')
            .trim_matches('\'')
            .trim_start_matches("Bearer ")
            .trim_start_matches("bearer ")
            .trim()
            .to_string();

        if token_clean.is_empty() {
            return Err(cirrus_core::error::CirrusError::AuthRequired {
                account_id: "onedrive".to_string(),
                reason: "Microsoft Graph Access Token is required to connect OneDrive. Please enter your OAuth token.".to_string(),
            });
        }

        let key = cirrus_providers::CredentialsManager::access_token_key(&acc_id);
        state.credentials_mgr.store_secret(&key, &token_clean)?;

        Arc::new(cirrus_providers::OneDriveProvider::new(
            &acc_id,
            &name,
            state.credentials_mgr.clone(),
        ))
    };

    // Live API call: verify access token against Microsoft Graph and fetch real profile, root ID & quota
    let (detected_email, root_folder_id, quota) = provider.fetch_about().await?;

    let now = chrono::Utc::now().timestamp();
    let account = AccountRecord {
        id: acc_id.clone(),
        provider_type: cirrus_core::account::ProviderType::OneDrive,
        name: name.clone(),
        email: detected_email.or(params.email),
        root_folder_id: Some(root_folder_id),
        quota_total: Some(quota.total_bytes),
        quota_used: Some(quota.used_bytes),
        sync_status: cirrus_core::account::AccountSyncStatus::Indexing,
        delta_token: None,
        mount_path: None,
        created_at: now,
        updated_at: now,
    };

    state.accounts_repo.upsert_account(&account)?;
    state.register_cloud_account(&acc_id, provider);

    let engine_opt = state.sync_engines.read().get(&acc_id).cloned();
    let acc_id_clone = acc_id.clone();
    if let Some(engine) = engine_opt {
        tokio::spawn(async move {
            tracing::info!("Starting background scan for OneDrive '{}'...", acc_id_clone);
            if let Err(e) = engine.run_initial_scan(None).await {
                tracing::error!("Background scan error for OneDrive {}: {}", acc_id_clone, e);
            }
        });
    }

    Ok(account)
}

pub async fn add_generic_account(
    state: &AppState,
    params: GenericAccountParams,
) -> Result<AccountRecord> {
    let (config, password) = if let Some(c) = params.config {
        (c, params.password)
    } else {
        let proto = params.provider_type.unwrap_or_else(|| "webdav".to_string());
        let endp = params.endpoint.unwrap_or_default();
        let base_p = params.bucket.unwrap_or_else(|| "/".to_string());
        (
            cirrus_providers::GenericCloudConfig {
                endpoint_url: endp,
                protocol: proto,
                username: params.username,
                base_path: base_p,
            },
            params.password,
        )
    };

    let prefix = match config.protocol.to_lowercase().as_str() {
        "nextcloud" => "nextcloud",
        "s3" => "s3",
        _ => "webdav",
    };
    let acc_id = format!("acc_{}_{}", prefix, &uuid::Uuid::new_v4().to_string()[..8]);

    if let Some(ref pass) = password {
        let key = cirrus_providers::CredentialsManager::refresh_token_key(&acc_id);
        state.credentials_mgr.store_secret(&key, pass)?;
    }

    let provider = Arc::new(cirrus_providers::GenericCloudProvider::new(
        &acc_id,
        &params.name,
        config.clone(),
        state.credentials_mgr.clone(),
    ));

    // Test connection immediately against remote server
    let _ = provider.list_children(None, None).await?;

    let quota = provider.quota().await.unwrap_or(cirrus_providers::ProviderQuota {
        total_bytes: 100 * 1024 * 1024 * 1024,
        used_bytes: 0,
        trash_bytes: None,
    });

    let now = chrono::Utc::now().timestamp();
    let account = AccountRecord {
        id: acc_id.clone(),
        provider_type: provider.provider_type(),
        name: params.name.clone(),
        email: config.username.clone(),
        root_folder_id: None,
        quota_total: Some(quota.total_bytes),
        quota_used: Some(quota.used_bytes),
        sync_status: cirrus_core::account::AccountSyncStatus::Indexing,
        delta_token: None,
        mount_path: None,
        created_at: now,
        updated_at: now,
    };

    let _ = state.settings_repo.set_json(&format!("generic_config:{}", acc_id), &config);
    state.accounts_repo.upsert_account(&account)?;
    state.register_cloud_account(&acc_id, provider.clone());

    // Spawn real background initial scan to populate real files into metadata.db
    let engine_opt = state.sync_engines.read().get(&acc_id).cloned();
    let acc_id_clone = acc_id.clone();
    if let Some(engine) = engine_opt {
        tokio::spawn(async move {
            tracing::info!("Starting background scan for generic account '{}'...", acc_id_clone);
            if let Err(e) = engine.run_initial_scan(None).await {
                tracing::error!("Background scan error for {}: {}", acc_id_clone, e);
            }
        });
    }

    Ok(account)
}

pub async fn mount_account_vfs(state: &AppState, account_id: String) -> Result<String> {
    let account = state
        .accounts_repo
        .get_account(&account_id)?
        .ok_or_else(|| cirrus_core::error::CirrusError::NotFound {
            entity: "Account".to_string(),
            id: account_id.clone(),
        })?;

    let hyd_mgr = state.hydration_mgr.clone();
    let entries_repo_cb = state.entries_repo.clone();
    let hydration_cb: cirrus_vfs::HydrationCallback = Arc::new(move |entry_id: &str| {
        let entry = entries_repo_cb.get_entry(entry_id)?.ok_or_else(|| {
            cirrus_core::error::CirrusError::NotFound {
                entity: "Entry".to_string(),
                id: entry_id.to_string(),
            }
        })?;
        let hyd = hyd_mgr.clone();
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                hyd.hydrate(&entry, cirrus_sync::HydrationPriority::UserInteractive)
                    .await
            })
        })
    });

    let mount_path = state.mount_mgr.mount_account(
        &account_id,
        &account.name,
        state.entries_repo.clone(),
        state.cache_dir.clone(),
        Some(hydration_cb),
    )?;

    let mut updated = account;
    updated.mount_path = Some(mount_path.to_string_lossy().to_string());
    state.accounts_repo.upsert_account(&updated)?;

    Ok(mount_path.to_string_lossy().to_string())
}

pub async fn unmount_account_vfs(state: &AppState, account_id: String) -> Result<()> {
    state.mount_mgr.unmount_account(&account_id)?;
    if let Some(mut account) = state.accounts_repo.get_account(&account_id)? {
        account.mount_path = None;
        state.accounts_repo.upsert_account(&account)?;
    }
    Ok(())
}

pub async fn is_account_mounted(state: &AppState, account_id: String) -> Result<bool> {
    Ok(state.mount_mgr.is_mounted(&account_id))
}

pub async fn get_account_mount_path(
    state: &AppState,
    account_id: String,
) -> Result<Option<String>> {
    Ok(state
        .mount_mgr
        .get_mount_path(&account_id)
        .map(|p| p.to_string_lossy().to_string()))
}

pub async fn list_active_mounts(state: &AppState) -> Result<Vec<(String, String)>> {
    Ok(state
        .mount_mgr
        .list_active_mounts()
        .into_iter()
        .map(|(k, v)| (k, v.to_string_lossy().to_string()))
        .collect())
}

pub async fn is_default_file_manager(state: &AppState) -> Result<bool> {
    Ok(state.desktop_mgr.read().is_default_file_manager())
}

pub async fn set_as_default_file_manager(state: &AppState) -> Result<bool> {
    state
        .desktop_mgr
        .write()
        .register_as_default_file_manager()?;
    Ok(true)
}

pub async fn remove_account(state: &AppState, account_id: String) -> Result<()> {
    let _ = state.mount_mgr.unmount_account(&account_id);
    state.providers.write().remove(&account_id);
    state.sync_engines.write().remove(&account_id);
    state.upload_queues.write().remove(&account_id);
    state.accounts_repo.delete_account(&account_id)?;
    let _ = state.entries_repo.delete_entries_for_account(&account_id);
    let _ = state.settings_repo.set_string(&format!("generic_config:{}", account_id), "");
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudThumbnailParams {
    pub account_id: String,
    pub entry_id: String,
    #[serde(default)]
    pub thumbnail_url: Option<String>,
}

pub async fn get_cloud_thumbnail(
    state: &AppState,
    params: CloudThumbnailParams,
) -> Result<Option<String>> {
    let cloud_thumb_dir = state.cache_dir.join("cloud-thumbnails").join(&params.account_id);
    let _ = tokio::fs::create_dir_all(&cloud_thumb_dir).await;

    let safe_id = params
        .entry_id
        .replace(['/', '\\', ':', '?', '*', '"', '<', '>', '|'], "_");
    let cached_file = cloud_thumb_dir.join(format!("{}.png", safe_id));

    if cached_file.exists() {
        return Ok(Some(format!("file://{}", cached_file.to_string_lossy())));
    }

    // Determine the remote URL to fetch
    let mut remote_url = params.thumbnail_url.unwrap_or_default();
    if remote_url.is_empty() {
        if let Ok(Some(entry)) = state.entries_repo.get_entry(&params.entry_id) {
            if let Some(t_url) = entry.thumbnail_url {
                remote_url = t_url;
            }
        }
    }

    if remote_url.is_empty() {
        // Try fetching fresh metadata from provider if available
        let provider_opt = state.providers.read().get(&params.account_id).cloned();
        if let Some(provider) = provider_opt {
            if let Ok(fresh_entry) = provider.get_metadata(&params.entry_id).await {
                let _ = state.entries_repo.upsert_entry(&fresh_entry);
                if let Some(t_url) = fresh_entry.thumbnail_url {
                    remote_url = t_url;
                }
            }
        }
    }

    if remote_url.is_empty() {
        return Ok(None);
    }

    // Attempt to download thumbnail using authenticated provider
    let provider_opt = state.providers.read().get(&params.account_id).cloned();
    if let Some(provider) = provider_opt {
        if let Ok(bytes) = provider.fetch_thumbnail_bytes(&remote_url).await {
            if !bytes.is_empty() {
                if tokio::fs::write(&cached_file, &bytes).await.is_ok() {
                    return Ok(Some(format!("file://{}", cached_file.to_string_lossy())));
                }
            }
        }
    }

    // Direct reqwest fallback if provider fetch wasn't needed or available
    if remote_url.starts_with("http://") || remote_url.starts_with("https://") {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap_or_default();
        if let Ok(resp) = client.get(&remote_url).send().await {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes().await {
                    if !bytes.is_empty() {
                        if tokio::fs::write(&cached_file, &bytes).await.is_ok() {
                            return Ok(Some(format!("file://{}", cached_file.to_string_lossy())));
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}
