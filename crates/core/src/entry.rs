use serde::{Deserialize, Serialize};

use crate::state::FileState;

pub type EntryId = String;
pub type AccountId = String;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EntryRecord {
    pub id: EntryId,
    pub account_id: AccountId,
    pub remote_id: Option<String>,
    pub parent_id: Option<EntryId>,
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: u64,
    pub mtime: i64,
    pub ctime: Option<i64>,
    pub mime_type: String,
    pub etag: Option<String>,
    pub content_hash: Option<String>,
    pub state: FileState,
    pub local_path: Option<String>,
    pub error_message: Option<String>,
    pub sync_version: i64,
    pub last_accessed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl EntryRecord {
    #[allow(clippy::too_many_arguments)]
    pub fn new_placeholder(
        id: EntryId,
        account_id: AccountId,
        remote_id: Option<String>,
        parent_id: Option<EntryId>,
        name: String,
        path: String,
        is_directory: bool,
        size: u64,
        mtime: i64,
        mime_type: String,
        etag: Option<String>,
        now: i64,
    ) -> Self {
        Self {
            id,
            account_id,
            remote_id,
            parent_id,
            name,
            path,
            is_directory,
            size,
            mtime,
            ctime: Some(now),
            mime_type,
            etag,
            content_hash: None,
            state: FileState::CloudOnly,
            local_path: None,
            error_message: None,
            sync_version: 1,
            last_accessed_at: None,
            created_at: now,
            updated_at: now,
        }
    }
}

/// Diff events emitted by the sync engine to the UI without requiring full list refreshes.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum DiffEvent {
    Added(EntryRecord),
    Updated(EntryRecord),
    Removed {
        id: EntryId,
        parent_id: Option<EntryId>,
    },
    StateChanged {
        id: EntryId,
        old_state: FileState,
        new_state: FileState,
        progress: Option<f32>,
    },
    BatchDiff {
        parent_id: Option<EntryId>,
        added: Vec<EntryRecord>,
        updated: Vec<EntryRecord>,
        removed: Vec<EntryId>,
    },
}
