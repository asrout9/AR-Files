use crate::inode::InodeManager;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::query::{FolderListingQuery, SortDirection, SortField};
use cirrus_core::state::FileState;
use cirrus_db::EntryRepository;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct FuseFileAttr {
    pub ino: u64,
    pub size: u64,
    pub blocks: u64,
    pub atime: Duration,
    pub mtime: Duration,
    pub ctime: Duration,
    pub is_directory: bool,
    pub perm: u16,
}

pub struct CirrusVfs {
    account_id: String,
    _mount_point: PathBuf,
    entries_repo: EntryRepository,
    inode_mgr: Arc<InodeManager>,
}

impl CirrusVfs {
    pub fn new<P: AsRef<Path>>(
        account_id: &str,
        mount_point: P,
        entries_repo: EntryRepository,
    ) -> Self {
        Self {
            account_id: account_id.to_string(),
            _mount_point: mount_point.as_ref().to_path_buf(),
            entries_repo,
            inode_mgr: Arc::new(InodeManager::new()),
        }
    }

    pub fn inode_manager(&self) -> Arc<InodeManager> {
        self.inode_mgr.clone()
    }

    /// Resolves FUSE attributes for an inode by reading local SQLite metadata.
    pub fn getattr(&self, ino: u64) -> Result<FuseFileAttr> {
        let entry_id = self
            .inode_mgr
            .get_entry_id(ino)
            .ok_or_else(|| CirrusError::NotFound {
                entity: "Inode".to_string(),
                id: ino.to_string(),
            })?;

        if ino == InodeManager::ROOT_INO || entry_id == "root" {
            return Ok(FuseFileAttr {
                ino: InodeManager::ROOT_INO,
                size: 4096,
                blocks: 8,
                atime: Duration::from_secs(0),
                mtime: Duration::from_secs(0),
                ctime: Duration::from_secs(0),
                is_directory: true,
                perm: 0o755,
            });
        }

        let entry =
            self.entries_repo
                .get_entry(&entry_id)?
                .ok_or_else(|| CirrusError::NotFound {
                    entity: "Entry".to_string(),
                    id: entry_id,
                })?;

        let blocks = match entry.state {
            FileState::CloudOnly => 0, // True cloud placeholder: occupies 0 disk blocks
            _ => entry.size.div_ceil(512),
        };

        Ok(FuseFileAttr {
            ino,
            size: entry.size,
            blocks,
            atime: Duration::from_secs(entry.last_accessed_at.unwrap_or(entry.mtime) as u64),
            mtime: Duration::from_secs(entry.mtime as u64),
            ctime: Duration::from_secs(entry.ctime.unwrap_or(entry.mtime) as u64),
            is_directory: entry.is_directory,
            perm: if entry.is_directory { 0o755 } else { 0o644 },
        })
    }

    /// Lists directory entries for an inode without network calls.
    pub fn readdir(&self, ino: u64) -> Result<Vec<(u64, String, bool)>> {
        let entry_id = self
            .inode_mgr
            .get_entry_id(ino)
            .ok_or_else(|| CirrusError::NotFound {
                entity: "Inode".to_string(),
                id: ino.to_string(),
            })?;

        let parent_id = if ino == InodeManager::ROOT_INO || entry_id == "root" {
            None
        } else {
            Some(entry_id)
        };

        let query = FolderListingQuery {
            parent_id,
            account_id: Some(self.account_id.clone()),
            offset: 0,
            limit: 10000,
            sort_by: SortField::Name,
            sort_direction: SortDirection::Asc,
            show_hidden: true,
            filter: None,
        };

        let paged = self.entries_repo.list_children_paged(&query)?;

        let mut results = Vec::with_capacity(paged.items.len() + 2);
        results.push((ino, ".".to_string(), true));
        results.push((InodeManager::ROOT_INO, "..".to_string(), true));

        for item in paged.items {
            let item_ino = self.inode_mgr.get_or_create_ino(&item.id);
            results.push((item_ino, item.name, item.is_directory));
        }

        Ok(results)
    }

    /// Reads byte ranges from a hydrated file or cached replica.
    pub fn read_bytes(&self, ino: u64, offset: u64, size: usize) -> Result<Vec<u8>> {
        let entry_id = self
            .inode_mgr
            .get_entry_id(ino)
            .ok_or_else(|| CirrusError::NotFound {
                entity: "Inode".to_string(),
                id: ino.to_string(),
            })?;

        let entry =
            self.entries_repo
                .get_entry(&entry_id)?
                .ok_or_else(|| CirrusError::NotFound {
                    entity: "Entry".to_string(),
                    id: entry_id,
                })?;

        if !entry.state.is_locally_present() {
            return Err(CirrusError::Hydration(format!(
                "File '{}' is not hydrated yet (state: {:?})",
                entry.name, entry.state
            )));
        }

        let local_path = entry.local_path.ok_or_else(|| {
            CirrusError::Storage(format!("Entry '{}' missing local_path", entry.name))
        })?;

        let data = std::fs::read(&local_path)
            .map_err(|e| CirrusError::Io(format!("Failed to read local file: {}", e)))?;

        let start = offset as usize;
        if start >= data.len() {
            return Ok(Vec::new());
        }

        let end = (start + size).min(data.len());
        Ok(data[start..end].to_vec())
    }
}
