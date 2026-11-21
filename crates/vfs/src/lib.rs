pub mod fs;
pub mod fuse_fs;
pub mod inode;
pub mod mount;

pub use fs::{CirrusVfs, FuseFileAttr};
pub use fuse_fs::{CirrusFuseFs, HydrationCallback};
pub use inode::InodeManager;
pub use mount::{ActiveMount, MountManager};

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    use cirrus_core::account::{AccountRecord, AccountSyncStatus, ProviderType};
    use cirrus_core::entry::EntryRecord;
    use cirrus_db::{AccountRepository, DatabasePool, EntryRepository};

    #[test]
    fn test_vfs_getattr_and_sparse_placeholders() {
        let pool = DatabasePool::open_in_memory().unwrap();
        let accounts = AccountRepository::new(pool.clone());
        let entries = EntryRepository::new(pool.clone());
        let temp = tempdir().unwrap();
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_vfs_test".to_string(),
            provider_type: ProviderType::Mock,
            name: "VFS Account".to_string(),
            email: None,
            root_folder_id: None,
            quota_total: None,
            quota_used: None,
            sync_status: AccountSyncStatus::Idle,
            delta_token: None,
            mount_path: None,
            created_at: now,
            updated_at: now,
        };
        accounts.upsert_account(&account).unwrap();

        // 1 Placeholder cloud-only file (100MB, 0 blocks)
        let placeholder = EntryRecord::new_placeholder(
            "file_cloud_100mb".to_string(),
            "acc_vfs_test".to_string(),
            None,
            None,
            "huge_video.mp4".to_string(),
            "/huge_video.mp4".to_string(),
            false,
            104_857_600, // 100 MB
            now,
            "video/mp4".to_string(),
            None,
            now,
        );
        entries.upsert_entry(&placeholder).unwrap();

        let vfs = CirrusVfs::new("acc_vfs_test", temp.path(), entries.clone());
        let ino = vfs.inode_manager().get_or_create_ino("file_cloud_100mb");

        let attr = vfs.getattr(ino).expect("getattr failed");
        assert_eq!(attr.size, 104_857_600);
        // Sparse placeholder must occupy 0 disk blocks
        assert_eq!(attr.blocks, 0);
        assert!(!attr.is_directory);
        assert_eq!(attr.perm, 0o644);

        // Readdir on root
        let children = vfs.readdir(InodeManager::ROOT_INO).expect("readdir failed");
        assert!(children.iter().any(|(_, name, _)| name == "huge_video.mp4"));
    }

    #[test]
    fn test_vfs_on_demand_hydration_and_streaming_read() {
        let pool = DatabasePool::open_in_memory().unwrap();
        let accounts = AccountRepository::new(pool.clone());
        let entries = EntryRepository::new(pool.clone());
        let temp = tempdir().unwrap();
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_stream_test".to_string(),
            provider_type: ProviderType::GoogleDrive,
            name: "Streaming Test".to_string(),
            email: None,
            root_folder_id: None,
            quota_total: None,
            quota_used: None,
            sync_status: AccountSyncStatus::Idle,
            delta_token: None,
            mount_path: None,
            created_at: now,
            updated_at: now,
        };
        accounts.upsert_account(&account).unwrap();

        let placeholder = EntryRecord::new_placeholder(
            "file_contract".to_string(),
            "acc_stream_test".to_string(),
            None,
            None,
            "contract.pdf".to_string(),
            "/contract.pdf".to_string(),
            false,
            24,
            now,
            "application/pdf".to_string(),
            None,
            now,
        );
        entries.upsert_entry(&placeholder).unwrap();

        let vfs = CirrusVfs::new("acc_stream_test", temp.path(), entries.clone());
        let ino = vfs.inode_manager().get_or_create_ino("file_contract");

        // Hydration callback that simulates downloading content from provider
        let cache_file = temp.path().join("downloaded_contract.pdf");
        std::fs::write(&cache_file, b"HYDRO_VFS_STREAMING_DATA").unwrap();

        let cb = |_id: &str| Ok(cache_file.clone());

        // Read bytes at offset 6 with length 13
        let slice = vfs
            .read_bytes_with_hydration(ino, 6, 13, Some(&cb))
            .expect("read_bytes_with_hydration failed");

        assert_eq!(String::from_utf8_lossy(&slice), "VFS_STREAMING");

        // Verify SQLite state transitioned to Available
        let updated_entry = entries.get_entry("file_contract").unwrap().unwrap();
        assert_eq!(
            updated_entry.state,
            cirrus_core::state::FileState::Available
        );
        assert_eq!(
            updated_entry.local_path,
            Some(cache_file.to_string_lossy().to_string())
        );
    }

    #[test]
    fn test_vfs_mutations_create_write_mkdir() {
        let pool = DatabasePool::open_in_memory().unwrap();
        let accounts = AccountRepository::new(pool.clone());
        let entries = EntryRepository::new(pool.clone());
        let temp = tempdir().unwrap();
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_mutate_test".to_string(),
            provider_type: ProviderType::GoogleDrive,
            name: "Mutate Test".to_string(),
            email: None,
            root_folder_id: None,
            quota_total: None,
            quota_used: None,
            sync_status: AccountSyncStatus::Idle,
            delta_token: None,
            mount_path: None,
            created_at: now,
            updated_at: now,
        };
        accounts.upsert_account(&account).unwrap();

        let vfs = CirrusVfs::new("acc_mutate_test", temp.path(), entries.clone());

        // Mkdir
        let dir_ino = vfs
            .create_dir(InodeManager::ROOT_INO, "WorkDocs")
            .expect("create_dir failed");
        let dir_attr = vfs.getattr(dir_ino).unwrap();
        assert!(dir_attr.is_directory);

        // Create file inside WorkDocs
        let file_ino = vfs
            .create_file(dir_ino, "notes.txt")
            .expect("create_file failed");
        let file_attr = vfs.getattr(file_ino).unwrap();
        assert!(!file_attr.is_directory);
        assert_eq!(file_attr.size, 0);

        // Write to file
        let bytes_written = vfs
            .write_bytes(file_ino, 0, b"Hello FUSE Virtual FS")
            .expect("write_bytes failed");
        assert_eq!(bytes_written, 21);

        let read_slice = vfs.read_bytes(file_ino, 6, 4).expect("read_bytes failed");
        assert_eq!(String::from_utf8_lossy(&read_slice), "FUSE");

        // Verify state is SyncingUp
        let entry_id = vfs.inode_manager().get_entry_id(file_ino).unwrap();
        let updated = entries.get_entry(&entry_id).unwrap().unwrap();
        assert_eq!(updated.state, cirrus_core::state::FileState::SyncingUp);
        assert_eq!(updated.size, 21);
    }

    #[test]
    fn test_mount_manager_lifecycle_and_stale_cleanup() {
        let temp = tempdir().unwrap();
        let mount_mgr = MountManager::new(temp.path().join("Mounts"));

        let stale_mount = temp.path().join("Mounts").join("StaleAccount");
        std::fs::create_dir_all(&stale_mount).unwrap();

        // Testing stale cleanup executes without error
        mount_mgr.cleanup_stale_mount(&stale_mount);

        assert!(!mount_mgr.is_mounted("acc_fake"));
        assert_eq!(mount_mgr.list_active_mounts().len(), 0);
        mount_mgr.unmount_all();
    }
}
