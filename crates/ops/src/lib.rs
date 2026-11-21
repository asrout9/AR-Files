pub mod engine;
pub mod types;
pub mod undo;

pub use engine::OperationsManager;
pub use types::{CollisionResolution, OperationProgress};
pub use undo::{UndoAction, UndoRedoStack};

#[cfg(test)]
mod tests {
    use super::*;
    use cirrus_core::account::{AccountRecord, AccountSyncStatus, ProviderType};
    use cirrus_core::entry::EntryRecord;
    use cirrus_db::{AccountRepository, DatabasePool, EntryRepository, JournalRepository};

    fn setup_ops_env() -> (DatabasePool, EntryRepository, OperationsManager) {
        let pool = DatabasePool::open_in_memory().expect("Failed to create in-memory db");
        let accounts = AccountRepository::new(pool.clone());
        let entries = EntryRepository::new(pool.clone());
        let journal = JournalRepository::new(pool.clone());
        let now = chrono::Utc::now().timestamp();

        let account = AccountRecord {
            id: "acc_ops_test".to_string(),
            provider_type: ProviderType::Mock,
            name: "Ops Test Account".to_string(),
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

        let ops = OperationsManager::new(entries.clone(), journal, 50);
        (pool, entries, ops)
    }

    #[tokio::test]
    async fn test_create_and_undo() {
        let (_pool, entries, ops) = setup_ops_env();

        let created = ops
            .create_folder("acc_ops_test", None, "New Documents")
            .await
            .expect("Create folder failed");

        assert_eq!(created.name, "New Documents");
        assert!(entries.get_entry(&created.id).unwrap().is_some());

        // Undo creation
        let undone = ops.undo().await.expect("Undo failed");
        assert!(matches!(undone, Some(UndoAction::Create { .. })));

        // Entry should now be deleted from SQLite
        assert!(entries.get_entry(&created.id).unwrap().is_none());
    }

    #[tokio::test]
    async fn test_rename_and_undo() {
        let (_pool, entries, ops) = setup_ops_env();
        let now = chrono::Utc::now().timestamp();

        let file = EntryRecord::new_placeholder(
            "file_rename_1".to_string(),
            "acc_ops_test".to_string(),
            None,
            None,
            "draft.txt".to_string(),
            "/draft.txt".to_string(),
            false,
            100,
            now,
            "text/plain".to_string(),
            None,
            now,
        );
        entries.upsert_entry(&file).unwrap();

        let renamed = ops
            .rename_entry("file_rename_1", "published.txt")
            .await
            .expect("Rename failed");
        assert_eq!(renamed.name, "published.txt");

        // Verify in DB
        let in_db = entries.get_entry("file_rename_1").unwrap().unwrap();
        assert_eq!(in_db.name, "published.txt");

        // Undo rename
        ops.undo().await.expect("Undo failed");
        let restored = entries.get_entry("file_rename_1").unwrap().unwrap();
        assert_eq!(restored.name, "draft.txt");
    }

    #[tokio::test]
    async fn test_copy_with_keep_both_collision() {
        let (_pool, entries, ops) = setup_ops_env();
        let now = chrono::Utc::now().timestamp();

        let file = EntryRecord::new_placeholder(
            "file_copy_1".to_string(),
            "acc_ops_test".to_string(),
            None,
            None,
            "spreadsheet.xlsx".to_string(),
            "/spreadsheet.xlsx".to_string(),
            false,
            2048,
            now,
            "application/vnd.ms-excel".to_string(),
            None,
            now,
        );
        entries.upsert_entry(&file).unwrap();

        let copied = ops
            .copy_entries(
                &["file_copy_1".to_string()],
                None,
                CollisionResolution::KeepBoth,
            )
            .await
            .expect("Copy failed");

        assert_eq!(copied.len(), 1);
        assert_eq!(copied[0].name, "spreadsheet (copy).xlsx");
    }
}
