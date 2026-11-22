use std::path::Path;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tracing::info;

use crate::types::{CollisionResolution, OperationProgress};
use crate::undo::{UndoAction, UndoRedoStack};
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::state::FileState;
use cirrus_db::{EntryRepository, JournalRepository};

#[derive(Clone)]
pub struct OperationsManager {
    entries_repo: EntryRepository,
    journal_repo: JournalRepository,
    undo_redo: Arc<Mutex<UndoRedoStack>>,
    progress_tx: broadcast::Sender<OperationProgress>,
}

impl OperationsManager {
    pub fn new(
        entries_repo: EntryRepository,
        journal_repo: JournalRepository,
        max_undo_history: usize,
    ) -> Self {
        let (progress_tx, _) = broadcast::channel(128);

        Self {
            entries_repo,
            journal_repo,
            undo_redo: Arc::new(Mutex::new(UndoRedoStack::new(max_undo_history))),
            progress_tx,
        }
    }

    pub fn subscribe_progress(&self) -> broadcast::Receiver<OperationProgress> {
        self.progress_tx.subscribe()
    }

    pub async fn create_folder(
        &self,
        account_id: &str,
        parent_id: Option<&str>,
        name: &str,
    ) -> Result<EntryRecord> {
        let now = chrono::Utc::now().timestamp();
        let id = format!("dir_{}", uuid::Uuid::new_v4());

        let parent_entry = match parent_id {
            Some(pid) => self.entries_repo.get_entry(pid)?,
            None => None,
        };

        let parent_path = parent_entry
            .map(|p| p.path)
            .unwrap_or_else(|| "/".to_string());
        let path = if parent_path == "/" {
            format!("/{}", name)
        } else {
            format!("{}/{}", parent_path, name)
        };

        let entry = EntryRecord {
            id: id.clone(),
            account_id: account_id.to_string(),
            remote_id: None,
            parent_id: parent_id.map(|s| s.to_string()),
            name: name.to_string(),
            path,
            is_directory: true,
            size: 0,
            mtime: now,
            ctime: Some(now),
            mime_type: "inode/directory".to_string(),
            etag: None,
            content_hash: None,
            state: FileState::SyncingUp,
            local_path: None,
            thumbnail_url: None,
            error_message: None,
            sync_version: 1,
            last_accessed_at: None,
            created_at: now,
            updated_at: now,
        };

        self.entries_repo.upsert_entry(&entry)?;
        self.undo_redo.lock().await.push(UndoAction::Create {
            entry_id: id.clone(),
        });

        info!("Created new folder '{}' ({})", name, id);
        Ok(entry)
    }

    pub async fn rename_entry(&self, id: &str, new_name: &str) -> Result<EntryRecord> {
        let mut entry = self
            .entries_repo
            .get_entry(id)?
            .ok_or_else(|| CirrusError::NotFound {
                entity: "Entry".to_string(),
                id: id.to_string(),
            })?;

        let old_name = entry.name.clone();
        if old_name == new_name {
            return Ok(entry);
        }

        entry.name = new_name.to_string();
        entry.updated_at = chrono::Utc::now().timestamp();
        self.entries_repo.upsert_entry(&entry)?;

        self.undo_redo.lock().await.push(UndoAction::Rename {
            entry_id: id.to_string(),
            old_name,
            new_name: new_name.to_string(),
        });

        info!("Renamed entry '{}' -> '{}'", id, new_name);
        Ok(entry)
    }

    pub async fn move_entries(
        &self,
        entry_ids: &[String],
        target_parent_id: Option<&str>,
    ) -> Result<Vec<EntryRecord>> {
        let mut moved = Vec::new();
        let now = chrono::Utc::now().timestamp();

        for id in entry_ids {
            if let Some(mut entry) = self.entries_repo.get_entry(id)? {
                let old_parent = entry.parent_id.clone();
                entry.parent_id = target_parent_id.map(|s| s.to_string());
                entry.updated_at = now;
                self.entries_repo.upsert_entry(&entry)?;

                self.undo_redo.lock().await.push(UndoAction::Move {
                    entry_id: id.clone(),
                    old_parent_id: old_parent,
                    new_parent_id: target_parent_id.map(|s| s.to_string()),
                });

                moved.push(entry);
            }
        }

        info!(
            "Moved {} entries to parent '{:?}'",
            moved.len(),
            target_parent_id
        );
        Ok(moved)
    }

    pub async fn copy_entries(
        &self,
        entry_ids: &[String],
        target_parent_id: Option<&str>,
        collision: CollisionResolution,
    ) -> Result<Vec<EntryRecord>> {
        let mut copied = Vec::new();
        let mut created_ids = Vec::new();
        let now = chrono::Utc::now().timestamp();

        for id in entry_ids {
            if let Some(source) = self.entries_repo.get_entry(id)? {
                let target_name = match collision {
                    CollisionResolution::KeepBoth => Self::generate_copy_name(&source.name),
                    _ => source.name.clone(),
                };

                let new_id = format!("copy_{}", uuid::Uuid::new_v4());
                let new_entry = EntryRecord {
                    id: new_id.clone(),
                    account_id: source.account_id.clone(),
                    remote_id: None,
                    parent_id: target_parent_id.map(|s| s.to_string()),
                    name: target_name,
                    path: format!("{}/{}", target_parent_id.unwrap_or("/"), source.name),
                    is_directory: source.is_directory,
                    size: source.size,
                    mtime: now,
                    ctime: Some(now),
                    mime_type: source.mime_type.clone(),
                    etag: None,
                    content_hash: source.content_hash.clone(),
                    state: source.state,
                    local_path: source.local_path.clone(),
                    thumbnail_url: source.thumbnail_url.clone(),
                    error_message: None,
                    sync_version: 1,
                    last_accessed_at: None,
                    created_at: now,
                    updated_at: now,
                };

                self.entries_repo.upsert_entry(&new_entry)?;
                created_ids.push(new_id);
                copied.push(new_entry);
            }
        }

        if !created_ids.is_empty() {
            self.undo_redo.lock().await.push(UndoAction::Copy {
                created_entry_ids: created_ids,
            });
        }

        info!(
            "Copied {} entries into parent '{:?}'",
            copied.len(),
            target_parent_id
        );
        Ok(copied)
    }

    pub async fn trash_entries(&self, entry_ids: &[String]) -> Result<()> {
        for id in entry_ids {
            self.entries_repo.delete_entry(id)?;
        }

        self.undo_redo.lock().await.push(UndoAction::Trash {
            entry_ids: entry_ids.to_vec(),
        });

        info!("Trashed {} entries", entry_ids.len());
        Ok(())
    }

    pub async fn undo(&self) -> Result<Option<UndoAction>> {
        let action = self.undo_redo.lock().await.pop_undo();
        if let Some(ref act) = action {
            match act {
                UndoAction::Rename {
                    entry_id, old_name, ..
                } => {
                    if let Some(mut entry) = self.entries_repo.get_entry(entry_id)? {
                        entry.name = old_name.clone();
                        self.entries_repo.upsert_entry(&entry)?;
                    }
                }
                UndoAction::BatchRename { renames } => {
                    for (entry_id, old_name, _) in renames {
                        if let Some(mut entry) = self.entries_repo.get_entry(entry_id)? {
                            entry.name = old_name.clone();
                            self.entries_repo.upsert_entry(&entry)?;
                        }
                    }
                }
                UndoAction::Move {
                    entry_id,
                    old_parent_id,
                    ..
                } => {
                    if let Some(mut entry) = self.entries_repo.get_entry(entry_id)? {
                        entry.parent_id = old_parent_id.clone();
                        self.entries_repo.upsert_entry(&entry)?;
                    }
                }
                UndoAction::Create { entry_id } => {
                    self.entries_repo.delete_entry(entry_id)?;
                }
                UndoAction::Copy { created_entry_ids } => {
                    for cid in created_entry_ids {
                        self.entries_repo.delete_entry(cid)?;
                    }
                }
                UndoAction::Trash { .. } => {
                    // Restore items
                }
            }
        }
        Ok(action)
    }

    pub async fn redo(&self) -> Result<Option<UndoAction>> {
        let action = self.undo_redo.lock().await.pop_redo();
        if let Some(ref act) = action {
            match act {
                UndoAction::Rename {
                    entry_id, new_name, ..
                } => {
                    if let Some(mut entry) = self.entries_repo.get_entry(entry_id)? {
                        entry.name = new_name.clone();
                        self.entries_repo.upsert_entry(&entry)?;
                    }
                }
                UndoAction::BatchRename { renames } => {
                    for (entry_id, _, new_name) in renames {
                        if let Some(mut entry) = self.entries_repo.get_entry(entry_id)? {
                            entry.name = new_name.clone();
                            self.entries_repo.upsert_entry(&entry)?;
                        }
                    }
                }
                UndoAction::Move {
                    entry_id,
                    new_parent_id,
                    ..
                } => {
                    if let Some(mut entry) = self.entries_repo.get_entry(entry_id)? {
                        entry.parent_id = new_parent_id.clone();
                        self.entries_repo.upsert_entry(&entry)?;
                    }
                }
                UndoAction::Create { .. } => {}
                UndoAction::Copy { .. } => {}
                UndoAction::Trash { entry_ids } => {
                    for id in entry_ids {
                        self.entries_repo.delete_entry(id)?;
                    }
                }
            }
        }
        Ok(action)
    }

    pub fn preview_batch_rename(
        &self,
        entry_ids: &[String],
        rule: &crate::batch_rename::BatchRenameRule,
    ) -> Result<Vec<crate::batch_rename::BatchRenamePreview>> {
        let mut previews = Vec::new();
        for (idx, id) in entry_ids.iter().enumerate() {
            if let Some(entry) = self.entries_repo.get_entry(id)? {
                let new_name = rule.generate_new_name(&entry.name, idx);
                previews.push(crate::batch_rename::BatchRenamePreview {
                    entry_id: id.clone(),
                    old_name: entry.name,
                    new_name,
                });
            }
        }
        Ok(previews)
    }

    pub async fn apply_batch_rename(
        &self,
        previews: &[crate::batch_rename::BatchRenamePreview],
    ) -> Result<Vec<EntryRecord>> {
        let mut updated = Vec::new();
        let mut undo_list = Vec::new();

        for prev in previews {
            if let Some(mut entry) = self.entries_repo.get_entry(&prev.entry_id)? {
                let old_name = entry.name.clone();
                entry.name = prev.new_name.clone();
                entry.updated_at = chrono::Utc::now().timestamp();
                self.entries_repo.upsert_entry(&entry)?;
                undo_list.push((prev.entry_id.clone(), old_name, prev.new_name.clone()));
                updated.push(entry);
            }
        }

        self.undo_redo
            .lock()
            .await
            .push(UndoAction::BatchRename { renames: undo_list });
        info!("Applied batch rename across {} entries", previews.len());
        Ok(updated)
    }

    pub async fn delete_permanently(&self, entry_ids: &[String]) -> Result<()> {
        for id in entry_ids {
            if let Some(entry) = self.entries_repo.get_entry(id)? {
                if let Some(ref local) = entry.local_path {
                    let p = Path::new(local);
                    if p.exists() {
                        if entry.is_directory {
                            let _ = std::fs::remove_dir_all(p);
                        } else {
                            let _ = std::fs::remove_file(p);
                        }
                    }
                }
            }
            self.entries_repo.delete_entry(id)?;
        }
        info!("Permanently deleted {} entries", entry_ids.len());
        Ok(())
    }

    pub async fn recover_pending_operations(&self) -> Result<usize> {
        let incomplete = self.journal_repo.get_uncompleted_jobs()?;
        let count = incomplete.len();
        for job in incomplete {
            info!(
                "Recovering uncompleted journal job '{}' (op: {:?}) after crash/restart",
                job.id, job.op_type
            );
            self.journal_repo.mark_completed(&job.id)?;
        }
        Ok(count)
    }

    pub fn generate_copy_name(name: &str) -> String {
        let p = Path::new(name);
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or(name);
        let ext = p.extension().and_then(|e| e.to_str());

        match ext {
            Some(e) => format!("{} (copy).{}", stem, e),
            None => format!("{} (copy)", stem),
        }
    }
}
