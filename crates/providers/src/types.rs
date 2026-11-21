use bitflags::bitflags;
use serde::{Deserialize, Serialize};

use cirrus_core::entry::EntryRecord;

bitflags! {
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(transparent)]
    pub struct ProviderCapabilities: u32 {
        const SUPPORTS_DELTA = 1 << 0;
        const SUPPORTS_RESUMABLE_UPLOAD = 1 << 1;
        const SUPPORTS_SERVER_SIDE_COPY = 1 << 2;
        const SUPPORTS_TRASH = 1 << 3;
        const SUPPORTS_VERSIONS = 1 << 4;
        const SUPPORTS_SHARED_DRIVES = 1 << 5;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ByteRange {
    pub start: u64,
    pub end: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeltaChange {
    pub id: String,
    pub is_deleted: bool,
    pub entry: Option<EntryRecord>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeltaFeed {
    pub changes: Vec<DeltaChange>,
    pub new_delta_token: String,
    pub has_more: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderQuota {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub trash_bytes: Option<u64>,
}
