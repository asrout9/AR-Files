use serde::{Deserialize, Serialize};

use crate::entry::{AccountId, EntryId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JournalOpType {
    Download,
    Upload,
    Copy,
    Move,
    Delete,
    Trash,
    Restore,
    Rename,
    Evict,
}

impl JournalOpType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Download => "download",
            Self::Upload => "upload",
            Self::Copy => "copy",
            Self::Move => "move",
            Self::Delete => "delete",
            Self::Trash => "trash",
            Self::Restore => "restore",
            Self::Rename => "rename",
            Self::Evict => "evict",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Paused,
    Cancelled,
}

impl JobStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Paused => "paused",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct JournalRecord {
    pub id: String,
    pub account_id: AccountId,
    pub op_type: JournalOpType,
    pub entry_id: Option<EntryId>,
    pub source_path: Option<String>,
    pub destination_path: Option<String>,
    pub payload: String,
    pub status: JobStatus,
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub error_message: Option<String>,
    pub retry_count: u32,
    pub created_at: i64,
    pub updated_at: i64,
}
