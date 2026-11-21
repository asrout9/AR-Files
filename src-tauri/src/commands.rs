use serde::{Deserialize, Serialize};

use crate::state::AppState;
use cirrus_core::account::AccountRecord;
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::Result;
use cirrus_core::query::{FolderListingQuery, PagedResult};
use cirrus_ops::CollisionResolution;
use cirrus_platform::DesktopEntry;

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

pub async fn free_up_space(state: &AppState, entry_id: String) -> Result<()> {
    state.cache_mgr.free_up_space(&entry_id)
}

pub async fn pin_entry(state: &AppState, entry_id: String) -> Result<()> {
    state
        .entries_repo
        .update_state(&entry_id, cirrus_core::state::FileState::Pinned, None, None)
}

pub async fn unpin_entry(state: &AppState, entry_id: String) -> Result<()> {
    state.entries_repo.update_state(
        &entry_id,
        cirrus_core::state::FileState::Available,
        None,
        None,
    )
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
