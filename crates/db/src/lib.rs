pub mod accounts;
pub mod entries;
pub mod journal;
pub mod migrations;
pub mod pool;
pub mod settings;

pub use accounts::AccountRepository;
pub use entries::EntryRepository;
pub use journal::JournalRepository;
pub use pool::DatabasePool;
pub use settings::SettingsRepository;

#[cfg(test)]
mod tests {
    use super::*;
    use cirrus_core::account::{AccountRecord, AccountSyncStatus, ProviderType};
    use cirrus_core::entry::EntryRecord;
    use cirrus_core::journal::{JobStatus, JournalOpType, JournalRecord};
    use cirrus_core::query::{FolderListingQuery, SortDirection, SortField};
    use cirrus_core::state::FileState;

    fn setup_test_db() -> (DatabasePool, AccountRepository, EntryRepository) {
        let pool = DatabasePool::open_in_memory().expect("Failed to create in-memory db");
        let accounts = AccountRepository::new(pool.clone());
        let entries = EntryRepository::new(pool.clone());
        (pool, accounts, entries)
    }

    #[test]
    fn test_account_crud() {
        let (_pool, accounts, _entries) = setup_test_db();
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_gdrive_1".to_string(),
            provider_type: ProviderType::GoogleDrive,
            name: "My Google Drive".to_string(),
            email: Some("user@example.com".to_string()),
            root_folder_id: Some("root_1".to_string()),
            quota_total: Some(15 * 1024 * 1024 * 1024),
            quota_used: Some(5 * 1024 * 1024 * 1024),
            sync_status: AccountSyncStatus::Idle,
            delta_token: Some("token_v1".to_string()),
            mount_path: Some("/home/user/Cloud/GDrive".to_string()),
            created_at: now,
            updated_at: now,
        };

        accounts.upsert_account(&account).unwrap();

        let fetched = accounts.get_account("acc_gdrive_1").unwrap().unwrap();
        assert_eq!(fetched.name, "My Google Drive");
        assert_eq!(fetched.sync_status, AccountSyncStatus::Idle);

        // Update sync status
        accounts
            .update_sync_status("acc_gdrive_1", AccountSyncStatus::Syncing, Some("token_v2"))
            .unwrap();

        let updated = accounts.get_account("acc_gdrive_1").unwrap().unwrap();
        assert_eq!(updated.sync_status, AccountSyncStatus::Syncing);
        assert_eq!(updated.delta_token, Some("token_v2".to_string()));
    }

    #[test]
    fn test_entry_upsert_and_paged_listing() {
        let (_pool, accounts, entries) = setup_test_db();
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_test".to_string(),
            provider_type: ProviderType::Mock,
            name: "Mock Drive".to_string(),
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

        // Insert 150 items: 50 folders and 100 files
        let mut batch = Vec::new();
        for i in 0..150 {
            let is_dir = i < 50;
            let name = if is_dir {
                format!("Folder_{:03}", i)
            } else {
                format!("Document_{:03}.pdf", i)
            };

            batch.push(EntryRecord {
                id: format!("entry_{:03}", i),
                account_id: "acc_test".to_string(),
                remote_id: Some(format!("remote_{:03}", i)),
                parent_id: Some("root".to_string()),
                name,
                path: format!("/root/item_{:03}", i),
                is_directory: is_dir,
                size: if is_dir { 0 } else { (i * 1024) as u64 },
                mtime: now + i,
                ctime: Some(now),
                mime_type: if is_dir {
                    "inode/directory".to_string()
                } else {
                    "application/pdf".to_string()
                },
                etag: Some(format!("etag_{}", i)),
                content_hash: None,
                state: FileState::CloudOnly,
                local_path: None,
                error_message: None,
                sync_version: 1,
                last_accessed_at: None,
                created_at: now,
                updated_at: now,
            });
        }

        entries.upsert_entries_batch(&batch).unwrap();

        // Query first page of 20 items (should have folders first)
        let query = FolderListingQuery {
            parent_id: Some("root".to_string()),
            account_id: Some("acc_test".to_string()),
            offset: 0,
            limit: 20,
            sort_by: SortField::Name,
            sort_direction: SortDirection::Asc,
            show_hidden: false,
            filter: None,
        };

        let result = entries.list_children_paged(&query).unwrap();
        assert_eq!(result.total_count, 150);
        assert_eq!(result.items.len(), 20);
        assert!(result.has_more);
        // All items on page 1 must be directories because folders sort first
        assert!(result.items.iter().all(|item| item.is_directory));
    }

    #[test]
    fn test_fts5_search() {
        let (_pool, accounts, entries) = setup_test_db();
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_fts".to_string(),
            provider_type: ProviderType::Mock,
            name: "FTS Drive".to_string(),
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

        let file1 = EntryRecord::new_placeholder(
            "f1".to_string(),
            "acc_fts".to_string(),
            None,
            None,
            "Quarterly_Financial_Report_2026.xlsx".to_string(),
            "/Quarterly_Financial_Report_2026.xlsx".to_string(),
            false,
            1048576,
            now,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string(),
            None,
            now,
        );

        let file2 = EntryRecord::new_placeholder(
            "f2".to_string(),
            "acc_fts".to_string(),
            None,
            None,
            "Project_Cirrus_Architecture.pdf".to_string(),
            "/Project_Cirrus_Architecture.pdf".to_string(),
            false,
            2048576,
            now,
            "application/pdf".to_string(),
            None,
            now,
        );

        entries.upsert_entry(&file1).unwrap();
        entries.upsert_entry(&file2).unwrap();

        // Search for "Financial"
        let res1 = entries.search_fts("Financial", 10).unwrap();
        assert_eq!(res1.len(), 1);
        assert_eq!(res1[0].name, "Quarterly_Financial_Report_2026.xlsx");

        // Search for "Cirrus"
        let res2 = entries.search_fts("Cirrus", 10).unwrap();
        assert_eq!(res2.len(), 1);
        assert_eq!(res2[0].name, "Project_Cirrus_Architecture.pdf");
    }

    #[test]
    fn test_eviction_query() {
        let (_pool, accounts, entries) = setup_test_db();
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_evict".to_string(),
            provider_type: ProviderType::Mock,
            name: "Evict Drive".to_string(),
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

        let mut f_avail = EntryRecord::new_placeholder(
            "f_avail".to_string(),
            "acc_evict".to_string(),
            None,
            None,
            "cached_video.mp4".to_string(),
            "/cached_video.mp4".to_string(),
            false,
            500_000_000,
            now - 500,
            "video/mp4".to_string(),
            None,
            now,
        );
        f_avail.state = FileState::Available;
        f_avail.last_accessed_at = Some(now - 100);

        let mut f_pinned = EntryRecord::new_placeholder(
            "f_pinned".to_string(),
            "acc_evict".to_string(),
            None,
            None,
            "important_backup.tar.gz".to_string(),
            "/important_backup.tar.gz".to_string(),
            false,
            1_000_000_000,
            now - 1000,
            "application/gzip".to_string(),
            None,
            now,
        );
        f_pinned.state = FileState::Pinned;

        entries.upsert_entry(&f_avail).unwrap();
        entries.upsert_entry(&f_pinned).unwrap();

        let evictable = entries.get_evictable_entries(10).unwrap();
        assert_eq!(evictable.len(), 1);
        assert_eq!(evictable[0].id, "f_avail");
    }

    #[test]
    fn test_settings_crud() {
        let (pool, _accounts, _entries) = setup_test_db();
        let settings = SettingsRepository::new(pool);

        settings.set_string("theme", "adwaita-dark").unwrap();
        assert_eq!(
            settings.get_string("theme").unwrap(),
            Some("adwaita-dark".to_string())
        );

        #[derive(serde::Serialize, serde::Deserialize, PartialEq, Debug)]
        struct FolderViewSetting {
            view_mode: String,
            zoom_level: u32,
            sort_by: String,
        }

        let view_pref = FolderViewSetting {
            view_mode: "grid".to_string(),
            zoom_level: 64,
            sort_by: "mtime".to_string(),
        };

        settings
            .set_json("view:/home/documents", &view_pref)
            .unwrap();
        let retrieved: FolderViewSetting =
            settings.get_json("view:/home/documents").unwrap().unwrap();
        assert_eq!(retrieved, view_pref);
    }

    #[test]
    fn test_journal_operations_and_recovery() {
        let (pool, accounts, _entries) = setup_test_db();
        let journal = JournalRepository::new(pool);
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_journal".to_string(),
            provider_type: ProviderType::Mock,
            name: "Journal Drive".to_string(),
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

        let record = JournalRecord {
            id: "job_001".to_string(),
            account_id: "acc_journal".to_string(),
            op_type: JournalOpType::Download,
            entry_id: Some("file_123".to_string()),
            source_path: Some("/remote/file_123.bin".to_string()),
            destination_path: Some("/cache/file_123.part".to_string()),
            payload: "{}".to_string(),
            status: JobStatus::Pending,
            bytes_transferred: 0,
            total_bytes: 1048576,
            error_message: None,
            retry_count: 0,
            created_at: now,
            updated_at: now,
        };

        journal.record_intent(&record).unwrap();

        let pending = journal.get_uncompleted_jobs().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, "job_001");

        // Simulate progress update
        journal
            .update_progress("job_001", 524288, JobStatus::Running)
            .unwrap();

        let in_progress = journal.get_uncompleted_jobs().unwrap();
        assert_eq!(in_progress[0].bytes_transferred, 524288);
        assert_eq!(in_progress[0].status, JobStatus::Running);

        // Mark completed
        journal.mark_completed("job_001").unwrap();
        let uncompleted = journal.get_uncompleted_jobs().unwrap();
        assert_eq!(uncompleted.len(), 0);
    }

    #[test]
    fn test_batch_upsert_10000_items_performance() {
        let (_pool, accounts, entries) = setup_test_db();
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_perf".to_string(),
            provider_type: ProviderType::Mock,
            name: "Perf Drive".to_string(),
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

        let start = std::time::Instant::now();
        let mut batch = Vec::with_capacity(10000);
        for i in 0..10000 {
            batch.push(EntryRecord {
                id: format!("perf_entry_{}", i),
                account_id: "acc_perf".to_string(),
                remote_id: Some(format!("remote_{}", i)),
                parent_id: Some("perf_root".to_string()),
                name: format!("file_{:05}.dat", i),
                path: format!("/perf_root/file_{:05}.dat", i),
                is_directory: false,
                size: (i * 512) as u64,
                mtime: now + (i as i64),
                ctime: Some(now),
                mime_type: "application/octet-stream".to_string(),
                etag: None,
                content_hash: None,
                state: FileState::CloudOnly,
                local_path: None,
                error_message: None,
                sync_version: 1,
                last_accessed_at: None,
                created_at: now,
                updated_at: now,
            });
        }

        entries.upsert_entries_batch(&batch).unwrap();
        let elapsed = start.elapsed();
        println!("Inserted 10,000 entries into SQLite WAL in {:?}", elapsed);
        assert!(elapsed.as_millis() < 3000, "10k batch insert took too long");

        // Query middle page
        let query_start = std::time::Instant::now();
        let query = FolderListingQuery {
            parent_id: Some("perf_root".to_string()),
            account_id: Some("acc_perf".to_string()),
            offset: 5000,
            limit: 50,
            sort_by: SortField::Name,
            sort_direction: SortDirection::Asc,
            show_hidden: false,
            filter: None,
        };
        let paged = entries.list_children_paged(&query).unwrap();
        let query_elapsed = query_start.elapsed();
        println!("Paged query on 10,000 entries took {:?}", query_elapsed);
        assert_eq!(paged.total_count, 10000);
        assert_eq!(paged.items.len(), 50);
        assert!(
            query_elapsed.as_millis() < 100,
            "Paged query took too long: {:?}",
            query_elapsed
        );
    }
}
