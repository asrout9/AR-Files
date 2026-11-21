pub mod bandwidth;
pub mod cache;
pub mod conflict;
pub mod engine;
pub mod hydration;
pub mod upload_queue;

pub use bandwidth::BandwidthLimiter;
pub use cache::{CacheManager, CacheStats};
pub use conflict::ConflictDetector;
pub use engine::SyncEngine;
pub use hydration::{HydrationManager, HydrationPriority, HydrationProgress};
pub use upload_queue::{UploadItem, UploadQueueManager, UploadStatus};

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use cirrus_providers::CloudProvider;
    use std::sync::Arc;
    use tempfile::tempdir;

    use cirrus_core::account::{AccountRecord, AccountSyncStatus, ProviderType};
    use cirrus_core::state::FileState;
    use cirrus_db::{AccountRepository, DatabasePool, EntryRepository};
    use cirrus_providers::MockCloudProvider;

    fn setup_test_env() -> (
        DatabasePool,
        AccountRepository,
        EntryRepository,
        Arc<MockCloudProvider>,
    ) {
        let pool = DatabasePool::open_in_memory().expect("Failed to create in-memory db");
        let accounts = AccountRepository::new(pool.clone());
        let entries = EntryRepository::new(pool.clone());
        let provider = Arc::new(MockCloudProvider::new(
            "acc_test_sync",
            "Sync Test Account",
            100_000_000,
        ));
        (pool, accounts, entries, provider)
    }

    #[tokio::test]
    async fn test_initial_scan_and_delta_reconciliation() {
        let (_pool, accounts, entries, provider) = setup_test_env();
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_test_sync".to_string(),
            provider_type: ProviderType::Mock,
            name: "Sync Test Account".to_string(),
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

        // Populate provider with 1 folder and 2 files
        let folder = provider
            .create_folder(None, "Projects")
            .await
            .expect("Create folder failed");

        let file1 = provider
            .upload(
                Some(&folder.id),
                "readme.md",
                Bytes::from("# Cirrus Files"),
                "text/markdown",
            )
            .await
            .expect("Upload file1 failed");

        let file2 = provider
            .upload(
                None,
                "top_level.txt",
                Bytes::from("top level text"),
                "text/plain",
            )
            .await
            .expect("Upload file2 failed");

        let sync_engine = SyncEngine::new(
            "acc_test_sync",
            provider.clone(),
            accounts.clone(),
            entries.clone(),
        );

        // Run initial scan
        sync_engine
            .run_initial_scan(None)
            .await
            .expect("Initial scan failed");

        // Verify entries exist in SQLite
        let db_folder = entries.get_entry(&folder.id).unwrap();
        assert!(db_folder.is_some());
        assert_eq!(db_folder.unwrap().name, "Projects");

        let db_file1 = entries.get_entry(&file1.id).unwrap();
        assert!(db_file1.is_some());
        assert_eq!(db_file1.unwrap().state, FileState::CloudOnly);

        // Now mutate provider: rename file2 and upload file3
        provider.rename(&file2.id, "renamed_top.txt").await.unwrap();
        let file3 = provider
            .upload(
                None,
                "new_file.dat",
                Bytes::from("new data"),
                "application/octet-stream",
            )
            .await
            .unwrap();

        // Run delta reconciliation
        let changes_count = sync_engine.reconcile_delta_once().await.unwrap();
        assert_eq!(changes_count, 2);

        // Verify rename applied in SQLite
        let updated_file2 = entries.get_entry(&file2.id).unwrap().unwrap();
        assert_eq!(updated_file2.name, "renamed_top.txt");

        // Verify new file exists in SQLite
        let db_file3 = entries.get_entry(&file3.id).unwrap();
        assert!(db_file3.is_some());
    }

    #[tokio::test]
    async fn test_hydration_and_cache_eviction() {
        let (_pool, accounts, entries, provider) = setup_test_env();
        let temp = tempdir().unwrap();
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_test_sync".to_string(),
            provider_type: ProviderType::Mock,
            name: "Sync Test Account".to_string(),
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

        let test_bytes = Bytes::from("Cached file contents for hydration test");
        let remote_file = provider
            .upload(None, "sample.txt", test_bytes.clone(), "text/plain")
            .await
            .unwrap();

        // Create placeholder in SQLite
        entries.upsert_entry(&remote_file).unwrap();

        let hydration_mgr =
            HydrationManager::new(temp.path(), entries.clone(), provider.clone(), 4).unwrap();

        // Trigger hydration
        let local_path = hydration_mgr
            .hydrate(&remote_file, HydrationPriority::UserInteractive)
            .await
            .expect("Hydration failed");

        assert!(local_path.exists());
        let read_back = tokio::fs::read(&local_path).await.unwrap();
        assert_eq!(read_back, test_bytes);

        // Check SQLite state is Available
        let updated = entries.get_entry(&remote_file.id).unwrap().unwrap();
        assert_eq!(updated.state, FileState::Available);

        // Evict to free up space
        let cache_mgr = CacheManager::new(temp.path(), entries.clone());
        cache_mgr
            .free_up_space(&remote_file.id)
            .expect("Free up space failed");

        // Verify local file deleted and state reverted to CloudOnly
        assert!(!local_path.exists());
        let reverted = entries.get_entry(&remote_file.id).unwrap().unwrap();
        assert_eq!(reverted.state, FileState::CloudOnly);
    }
}
