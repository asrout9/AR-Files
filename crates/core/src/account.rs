use serde::{Deserialize, Serialize};

use crate::entry::{AccountId, EntryId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderType {
    GoogleDrive,
    OneDrive,
    Dropbox,
    Nextcloud,
    WebDAV,
    S3,
    Local,
    Mock,
}

impl ProviderType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::GoogleDrive => "google_drive",
            Self::OneDrive => "onedrive",
            Self::Dropbox => "dropbox",
            Self::Nextcloud => "nextcloud",
            Self::WebDAV => "webdav",
            Self::S3 => "s3",
            Self::Local => "local",
            Self::Mock => "mock",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountSyncStatus {
    Idle,
    Indexing,
    Syncing,
    Paused,
    Offline,
    ActionRequired,
    Error,
}

impl AccountSyncStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Indexing => "indexing",
            Self::Syncing => "syncing",
            Self::Paused => "paused",
            Self::Offline => "offline",
            Self::ActionRequired => "action_required",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccountRecord {
    pub id: AccountId,
    pub provider_type: ProviderType,
    pub name: String,
    pub email: Option<String>,
    pub root_folder_id: Option<EntryId>,
    pub quota_total: Option<u64>,
    pub quota_used: Option<u64>,
    pub sync_status: AccountSyncStatus,
    pub delta_token: Option<String>,
    pub mount_path: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}
