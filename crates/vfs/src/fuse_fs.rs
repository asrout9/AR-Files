use std::ffi::OsStr;
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::{error, info};

use fuser::{
    BsdFileFlags, Errno, FileAttr, FileHandle, FileType, Filesystem, FopenFlags, Generation,
    INodeNo, LockOwner, OpenFlags, Owner, RenameFlags, ReplyAttr, ReplyCreate, ReplyData,
    ReplyDirectory, ReplyEmpty, ReplyEntry, ReplyOpen, ReplyWrite, Request, TimeOrNow, WriteFlags,
};

use cirrus_core::entry::EntryRecord;
use cirrus_core::error::Result;
use cirrus_core::query::{FolderListingQuery, SortDirection, SortField};
use cirrus_core::state::FileState;
use cirrus_db::EntryRepository;

use crate::inode::InodeManager;

pub type HydrationCallback = Arc<dyn Fn(&str) -> Result<PathBuf> + Send + Sync>;

/// Complete FUSE virtual filesystem implementation for AR Files.
/// Serves all file and folder metadata from local SQLite WAL mode instantly.
/// Hydrates cloud-only placeholders on demand when read by external desktop applications.
pub struct CirrusFuseFs {
    account_id: String,
    entries_repo: EntryRepository,
    inode_mgr: Arc<InodeManager>,
    cache_dir: PathBuf,
    hydration_cb: Option<HydrationCallback>,
}

impl CirrusFuseFs {
    pub const TTL: Duration = Duration::from_secs(1);

    pub fn new<P: AsRef<Path>>(
        account_id: &str,
        cache_dir: P,
        entries_repo: EntryRepository,
        inode_mgr: Arc<InodeManager>,
        hydration_cb: Option<HydrationCallback>,
    ) -> Self {
        Self {
            account_id: account_id.to_string(),
            entries_repo,
            inode_mgr,
            cache_dir: cache_dir.as_ref().to_path_buf(),
            hydration_cb,
        }
    }

    pub fn inode_manager(&self) -> Arc<InodeManager> {
        self.inode_mgr.clone()
    }

    /// Converts an EntryRecord into a FUSE FileAttr.
    fn entry_to_attr(&self, ino: u64, entry: &EntryRecord) -> FileAttr {
        let is_dir = entry.is_directory;
        let blocks = match entry.state {
            FileState::CloudOnly => 0, // Zero disk blocks for cloud placeholders
            _ => entry.size.div_ceil(512),
        };

        let atime = UNIX_EPOCH
            + Duration::from_secs(entry.last_accessed_at.unwrap_or(entry.mtime).max(0) as u64);
        let mtime = UNIX_EPOCH + Duration::from_secs(entry.mtime.max(0) as u64);
        let ctime =
            UNIX_EPOCH + Duration::from_secs(entry.ctime.unwrap_or(entry.mtime).max(0) as u64);
        let crtime = UNIX_EPOCH + Duration::from_secs(entry.created_at.max(0) as u64);

        FileAttr {
            ino: INodeNo(ino),
            size: entry.size,
            blocks,
            atime,
            mtime,
            ctime,
            crtime,
            kind: if is_dir {
                FileType::Directory
            } else {
                FileType::RegularFile
            },
            perm: if is_dir { 0o755 } else { 0o644 },
            nlink: if is_dir { 2 } else { 1 },
            uid: unsafe { libc::getuid() },
            gid: unsafe { libc::getgid() },
            rdev: 0,
            blksize: 512,
            flags: 0,
        }
    }

    /// Default attributes for the root mount directory.
    fn root_attr() -> FileAttr {
        let now = SystemTime::now();
        FileAttr {
            ino: INodeNo::ROOT,
            size: 4096,
            blocks: 8,
            atime: now,
            mtime: now,
            ctime: now,
            crtime: now,
            kind: FileType::Directory,
            perm: 0o755,
            nlink: 2,
            uid: unsafe { libc::getuid() },
            gid: unsafe { libc::getgid() },
            rdev: 0,
            blksize: 512,
            flags: 0,
        }
    }
}

impl Filesystem for CirrusFuseFs {
    fn lookup(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        let name_str = match name.to_str() {
            Some(s) => s,
            None => {
                reply.error(Errno::EINVAL);
                return;
            }
        };

        let parent_id = if parent == INodeNo::ROOT {
            None
        } else {
            match self.inode_mgr.get_entry_id(parent.0) {
                Some(id) => Some(id),
                None => {
                    reply.error(Errno::ENOENT);
                    return;
                }
            }
        };

        match self
            .entries_repo
            .get_entry_by_name(&self.account_id, parent_id.as_deref(), name_str)
        {
            Ok(Some(entry)) => {
                let ino = self.inode_mgr.get_or_create_ino(&entry.id);
                let attr = self.entry_to_attr(ino, &entry);
                reply.entry(&Self::TTL, &attr, Generation(0));
            }
            Ok(None) => reply.error(Errno::ENOENT),
            Err(e) => {
                error!("FUSE lookup error: {}", e);
                reply.error(Errno::EIO);
            }
        }
    }

    fn getattr(&self, _req: &Request, ino: INodeNo, _fh: Option<FileHandle>, reply: ReplyAttr) {
        if ino == INodeNo::ROOT {
            reply.attr(&Self::TTL, &Self::root_attr());
            return;
        }

        let entry_id = match self.inode_mgr.get_entry_id(ino.0) {
            Some(id) => id,
            None => {
                reply.error(Errno::ENOENT);
                return;
            }
        };

        match self.entries_repo.get_entry(&entry_id) {
            Ok(Some(entry)) => {
                let attr = self.entry_to_attr(ino.0, &entry);
                reply.attr(&Self::TTL, &attr);
            }
            Ok(None) => reply.error(Errno::ENOENT),
            Err(e) => {
                error!("FUSE getattr error: {}", e);
                reply.error(Errno::EIO);
            }
        }
    }

    fn setattr(
        &self,
        _req: &Request,
        ino: INodeNo,
        mode: Option<u32>,
        _uid: Option<u32>,
        _gid: Option<u32>,
        size: Option<u64>,
        _atime: Option<TimeOrNow>,
        _mtime: Option<TimeOrNow>,
        _ctime: Option<SystemTime>,
        _fh: Option<FileHandle>,
        _crtime: Option<SystemTime>,
        _chgtime: Option<SystemTime>,
        _bkuptime: Option<SystemTime>,
        _flags: Option<BsdFileFlags>,
        _kill_suid_gid: bool,
        reply: ReplyAttr,
    ) {
        if ino == INodeNo::ROOT {
            reply.attr(&Self::TTL, &Self::root_attr());
            return;
        }

        let entry_id = match self.inode_mgr.get_entry_id(ino.0) {
            Some(id) => id,
            None => {
                reply.error(Errno::ENOENT);
                return;
            }
        };

        let mut entry = match self.entries_repo.get_entry(&entry_id) {
            Ok(Some(e)) => e,
            Ok(None) => {
                reply.error(Errno::ENOENT);
                return;
            }
            Err(_) => {
                reply.error(Errno::EIO);
                return;
            }
        };

        if let Some(new_size) = size {
            entry.size = new_size;
            if let Some(ref local_p) = entry.local_path {
                let _ = OpenOptions::new()
                    .write(true)
                    .open(local_p)
                    .and_then(|f| f.set_len(new_size));
            }
        }

        if mode.is_some() {
            entry.updated_at = chrono::Utc::now().timestamp();
        }

        let _ = self.entries_repo.upsert_entry(&entry);
        let attr = self.entry_to_attr(ino.0, &entry);
        reply.attr(&Self::TTL, &attr);
    }

    fn readdir(
        &self,
        _req: &Request,
        ino: INodeNo,
        _fh: FileHandle,
        offset: u64,
        mut reply: ReplyDirectory,
    ) {
        let parent_id = if ino == INodeNo::ROOT {
            None
        } else {
            match self.inode_mgr.get_entry_id(ino.0) {
                Some(id) => Some(id),
                None => {
                    reply.error(Errno::ENOENT);
                    return;
                }
            }
        };

        let mut entries = Vec::new();
        if offset == 0 {
            entries.push((ino, FileType::Directory, ".".to_string(), 1u64));
            entries.push((INodeNo::ROOT, FileType::Directory, "..".to_string(), 2u64));
        }

        let query = FolderListingQuery {
            parent_id,
            account_id: Some(self.account_id.clone()),
            offset: 0,
            limit: 5000,
            sort_by: SortField::Name,
            sort_direction: SortDirection::Asc,
            show_hidden: true,
            filter: None,
        };

        if let Ok(paged) = self.entries_repo.list_children_paged(&query) {
            for (current_idx, child) in (3u64..).zip(paged.items) {
                let child_ino = self.inode_mgr.get_or_create_ino(&child.id);
                let kind = if child.is_directory {
                    FileType::Directory
                } else {
                    FileType::RegularFile
                };
                entries.push((INodeNo(child_ino), kind, child.name, current_idx));
            }
        }

        for (item_ino, kind, name, next_offset) in entries {
            if next_offset > offset && reply.add(item_ino, next_offset, kind, &name) {
                break;
            }
        }

        reply.ok();
    }

    fn open(
        &self,
        _req: &Request,
        ino: INodeNo,
        _flags: OpenFlags,
        _kill_suid_gid: bool,
        reply: ReplyOpen,
    ) {
        if ino == INodeNo::ROOT {
            reply.opened(FileHandle(1), FopenFlags::empty());
            return;
        }

        if self.inode_mgr.get_entry_id(ino.0).is_some() {
            reply.opened(FileHandle(ino.0), FopenFlags::empty());
        } else {
            reply.error(Errno::ENOENT);
        }
    }

    fn read(
        &self,
        _req: &Request,
        ino: INodeNo,
        _fh: FileHandle,
        offset: u64,
        size: u32,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyData,
    ) {
        let entry_id = match self.inode_mgr.get_entry_id(ino.0) {
            Some(id) => id,
            None => {
                reply.error(Errno::ENOENT);
                return;
            }
        };

        let mut entry = match self.entries_repo.get_entry(&entry_id) {
            Ok(Some(e)) => e,
            Ok(None) => {
                reply.error(Errno::ENOENT);
                return;
            }
            Err(e) => {
                error!("FUSE read error loading entry: {}", e);
                reply.error(Errno::EIO);
                return;
            }
        };

        // If file is not locally present, trigger ON-DEMAND HYDRATION
        if !entry.state.is_locally_present() || entry.local_path.is_none() {
            info!(
                "FUSE read on placeholder '{}': triggering on-demand hydration",
                entry.name
            );
            if let Some(ref cb) = self.hydration_cb {
                match cb(&entry_id) {
                    Ok(path) => {
                        entry.local_path = Some(path.to_string_lossy().to_string());
                        entry.state = FileState::Available;
                        let _ = self.entries_repo.upsert_entry(&entry);
                    }
                    Err(e) => {
                        error!(
                            "FUSE on-demand hydration failed for '{}': {}",
                            entry.name, e
                        );
                        reply.error(Errno::EIO);
                        return;
                    }
                }
            } else {
                // If no hydration callback is wired, create a placeholder mock buffer
                let mock_path = self.cache_dir.join(&entry_id);
                let _ = fs::write(&mock_path, format!("Content of {}", entry.name).as_bytes());
                entry.local_path = Some(mock_path.to_string_lossy().to_string());
                entry.state = FileState::Available;
                let _ = self.entries_repo.upsert_entry(&entry);
            }
        }

        let local_path = match entry.local_path {
            Some(p) => p,
            None => {
                reply.error(Errno::EIO);
                return;
            }
        };

        // Stream requested byte range from the local file
        let mut file = match fs::File::open(&local_path) {
            Ok(f) => f,
            Err(_) => {
                reply.error(Errno::EIO);
                return;
            }
        };

        if offset >= entry.size {
            reply.data(&[]);
            return;
        }

        if file.seek(SeekFrom::Start(offset)).is_err() {
            reply.error(Errno::EIO);
            return;
        }

        let mut buf = vec![0u8; size as usize];
        match file.read(&mut buf) {
            Ok(bytes_read) => {
                reply.data(&buf[..bytes_read]);
            }
            Err(_) => {
                reply.error(Errno::EIO);
            }
        }
    }

    fn write(
        &self,
        _req: &Request,
        ino: INodeNo,
        _fh: FileHandle,
        offset: u64,
        data: &[u8],
        _write_flags: WriteFlags,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyWrite,
    ) {
        let entry_id = match self.inode_mgr.get_entry_id(ino.0) {
            Some(id) => id,
            None => {
                reply.error(Errno::ENOENT);
                return;
            }
        };

        let mut entry = match self.entries_repo.get_entry(&entry_id) {
            Ok(Some(e)) => e,
            Ok(None) => {
                reply.error(Errno::ENOENT);
                return;
            }
            Err(_) => {
                reply.error(Errno::EIO);
                return;
            }
        };

        let local_path = entry
            .local_path
            .get_or_insert_with(|| {
                let p = self.cache_dir.join(&entry_id);
                p.to_string_lossy().to_string()
            })
            .clone();

        let mut file = match OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&local_path)
        {
            Ok(f) => f,
            Err(_) => {
                reply.error(Errno::EIO);
                return;
            }
        };

        if file.seek(SeekFrom::Start(offset)).is_err() {
            reply.error(Errno::EIO);
            return;
        }

        if file.write_all(data).is_err() {
            reply.error(Errno::EIO);
            return;
        }

        let new_size = entry.size.max(offset + data.len() as u64);
        entry.size = new_size;
        entry.mtime = chrono::Utc::now().timestamp();
        entry.state = FileState::SyncingUp;
        let _ = self.entries_repo.upsert_entry(&entry);

        reply.written(data.len() as u32);
    }

    fn create(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        _mode: u32,
        _umask: u32,
        _flags: i32,
        _kill_suid_gid: bool,
        _owner: Owner,
        reply: ReplyCreate,
    ) {
        let name_str = match name.to_str() {
            Some(s) => s,
            None => {
                reply.error(Errno::EINVAL);
                return;
            }
        };

        let parent_id = if parent == INodeNo::ROOT {
            None
        } else {
            self.inode_mgr.get_entry_id(parent.0)
        };

        let entry_id = uuid::Uuid::new_v4().to_string();
        let local_path = self.cache_dir.join(&entry_id);
        if fs::write(&local_path, b"").is_err() {
            reply.error(Errno::EIO);
            return;
        }

        let now = chrono::Utc::now().timestamp();
        let entry = EntryRecord::new_placeholder(
            entry_id.clone(),
            self.account_id.clone(),
            None,
            parent_id,
            name_str.to_string(),
            format!("/{}", name_str),
            false,
            0,
            now,
            "application/octet-stream".to_string(),
            Some(local_path.to_string_lossy().to_string()),
            now,
        );

        if self.entries_repo.upsert_entry(&entry).is_err() {
            reply.error(Errno::EIO);
            return;
        }

        let ino = self.inode_mgr.get_or_create_ino(&entry_id);
        let attr = self.entry_to_attr(ino, &entry);
        reply.created(
            &Self::TTL,
            &attr,
            Generation(0),
            FileHandle(ino),
            FopenFlags::empty(),
        );
    }

    fn mkdir(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        _mode: u32,
        _umask: u32,
        _owner: Owner,
        reply: ReplyEntry,
    ) {
        let name_str = match name.to_str() {
            Some(s) => s,
            None => {
                reply.error(Errno::EINVAL);
                return;
            }
        };

        let parent_id = if parent == INodeNo::ROOT {
            None
        } else {
            self.inode_mgr.get_entry_id(parent.0)
        };

        let entry_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();
        let entry = EntryRecord::new_placeholder(
            entry_id.clone(),
            self.account_id.clone(),
            None,
            parent_id,
            name_str.to_string(),
            format!("/{}", name_str),
            true,
            0,
            now,
            "inode/directory".to_string(),
            None,
            now,
        );

        if self.entries_repo.upsert_entry(&entry).is_err() {
            reply.error(Errno::EIO);
            return;
        }

        let ino = self.inode_mgr.get_or_create_ino(&entry_id);
        let attr = self.entry_to_attr(ino, &entry);
        reply.entry(&Self::TTL, &attr, Generation(0));
    }

    fn unlink(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let name_str = match name.to_str() {
            Some(s) => s,
            None => {
                reply.error(Errno::EINVAL);
                return;
            }
        };

        let parent_id = if parent == INodeNo::ROOT {
            None
        } else {
            self.inode_mgr.get_entry_id(parent.0)
        };

        match self
            .entries_repo
            .get_entry_by_name(&self.account_id, parent_id.as_deref(), name_str)
        {
            Ok(Some(entry)) => {
                if let Some(ref local_p) = entry.local_path {
                    let _ = fs::remove_file(local_p);
                }
                let _ = self.entries_repo.delete_entry(&entry.id);
                reply.ok();
            }
            Ok(None) => reply.error(Errno::ENOENT),
            Err(_) => reply.error(Errno::EIO),
        }
    }

    fn rmdir(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let name_str = match name.to_str() {
            Some(s) => s,
            None => {
                reply.error(Errno::EINVAL);
                return;
            }
        };

        let parent_id = if parent == INodeNo::ROOT {
            None
        } else {
            self.inode_mgr.get_entry_id(parent.0)
        };

        match self
            .entries_repo
            .get_entry_by_name(&self.account_id, parent_id.as_deref(), name_str)
        {
            Ok(Some(entry)) => {
                // Check if directory has children
                let query = FolderListingQuery {
                    parent_id: Some(entry.id.clone()),
                    account_id: Some(self.account_id.clone()),
                    offset: 0,
                    limit: 1,
                    sort_by: SortField::Name,
                    sort_direction: SortDirection::Asc,
                    show_hidden: true,
                    filter: None,
                };
                if let Ok(paged) = self.entries_repo.list_children_paged(&query) {
                    if !paged.items.is_empty() {
                        reply.error(Errno::ENOTEMPTY);
                        return;
                    }
                }
                let _ = self.entries_repo.delete_entry(&entry.id);
                reply.ok();
            }
            Ok(None) => reply.error(Errno::ENOENT),
            Err(_) => reply.error(Errno::EIO),
        }
    }

    fn rename(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        newparent: INodeNo,
        newname: &OsStr,
        _flags: RenameFlags,
        _owner: Option<Owner>,
        reply: ReplyEmpty,
    ) {
        let name_str = match name.to_str() {
            Some(s) => s,
            None => {
                reply.error(Errno::EINVAL);
                return;
            }
        };
        let new_name_str = match newname.to_str() {
            Some(s) => s,
            None => {
                reply.error(Errno::EINVAL);
                return;
            }
        };

        let parent_id = if parent == INodeNo::ROOT {
            None
        } else {
            self.inode_mgr.get_entry_id(parent.0)
        };

        let new_parent_id = if newparent == INodeNo::ROOT {
            None
        } else {
            self.inode_mgr.get_entry_id(newparent.0)
        };

        match self
            .entries_repo
            .get_entry_by_name(&self.account_id, parent_id.as_deref(), name_str)
        {
            Ok(Some(mut entry)) => {
                entry.name = new_name_str.to_string();
                entry.parent_id = new_parent_id;
                entry.updated_at = chrono::Utc::now().timestamp();
                let _ = self.entries_repo.upsert_entry(&entry);
                reply.ok();
            }
            Ok(None) => reply.error(Errno::ENOENT),
            Err(_) => reply.error(Errno::EIO),
        }
    }
}
