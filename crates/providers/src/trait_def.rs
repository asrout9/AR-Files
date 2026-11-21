use async_trait::async_trait;
use bytes::Bytes;

use crate::types::{ByteRange, DeltaFeed, FileVersion, ProviderCapabilities, ProviderQuota};
use cirrus_core::account::ProviderType;
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::Result;

#[async_trait]
pub trait CloudProvider: Send + Sync {
    /// Unique internal identifier of the account instance.
    fn id(&self) -> &str;

    /// User-facing display name of the account/provider.
    fn name(&self) -> &str;

    /// Provider classification (Google Drive, OneDrive, etc.).
    fn provider_type(&self) -> ProviderType;

    /// Bitmask of supported features and protocols.
    fn capabilities(&self) -> ProviderCapabilities;

    /// Lists children of a folder with pagination support.
    async fn list_children(
        &self,
        folder_id: Option<&str>,
        page_token: Option<&str>,
    ) -> Result<(Vec<EntryRecord>, Option<String>)>;

    /// Fetches up-to-date metadata for a single item.
    async fn get_metadata(&self, id: &str) -> Result<EntryRecord>;

    /// Queries the provider change feed for delta synchronization.
    async fn changes(&self, since_token: Option<&str>) -> Result<DeltaFeed>;

    /// Downloads file content or range chunks.
    async fn download(&self, id: &str, range: Option<ByteRange>) -> Result<Bytes>;

    /// Uploads a new or modified file.
    async fn upload(
        &self,
        parent_id: Option<&str>,
        name: &str,
        data: Bytes,
        mime_type: &str,
    ) -> Result<EntryRecord>;

    /// Creates a new directory.
    async fn create_folder(&self, parent_id: Option<&str>, name: &str) -> Result<EntryRecord>;

    /// Renames an existing file or directory.
    async fn rename(&self, id: &str, new_name: &str) -> Result<EntryRecord>;

    /// Moves an item to a new parent folder.
    async fn move_entry(&self, id: &str, new_parent_id: Option<&str>) -> Result<EntryRecord>;

    /// Duplicates an item server-side without streaming data locally.
    async fn copy_entry(
        &self,
        id: &str,
        destination_parent_id: Option<&str>,
        new_name: Option<&str>,
    ) -> Result<EntryRecord>;

    /// Deletes an item (to remote trash or permanently).
    async fn delete_entry(&self, id: &str, permanent: bool) -> Result<()>;

    /// Restores an item from the provider trash bin.
    async fn restore(&self, id: &str) -> Result<EntryRecord>;

    /// Queries user quota limits and storage consumption.
    async fn quota(&self) -> Result<ProviderQuota>;

    /// Generates a sharing web URL.
    async fn share_link(&self, id: &str) -> Result<String>;

    /// Fetches version history for an item if supported.
    async fn versions(&self, id: &str) -> Result<Vec<FileVersion>> {
        let _ = id;
        Ok(Vec::new())
    }
}
