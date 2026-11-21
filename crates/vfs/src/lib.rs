pub mod fs;
pub mod inode;

pub use fs::{CirrusVfs, FuseFileAttr};
pub use inode::InodeManager;

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
}
