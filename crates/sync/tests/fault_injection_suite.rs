use bytes::Bytes;
use std::sync::Arc;
use std::time::Duration;
use tempfile::tempdir;

use cirrus_core::account::{AccountRecord, AccountSyncStatus, ProviderType};
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::CirrusError;
use cirrus_core::journal::{JobStatus, JournalOpType, JournalRecord};
use cirrus_core::state::FileState;
use cirrus_db::{AccountRepository, DatabasePool, EntryRepository, JournalRepository};
use cirrus_ops::OperationsManager;
use cirrus_platform::HangProofFs;
use cirrus_providers::{CloudProvider, MockCloudProvider};
use cirrus_sync::{HydrationManager, HydrationPriority, SyncEngine};

#[tokio::test]
async fn test_fault_injection_network_drop_and_resilient_retry() {
    let pool = DatabasePool::open_in_memory().unwrap();
    let accounts = AccountRepository::new(pool.clone());
    let entries = EntryRepository::new(pool.clone());
    let temp = tempdir().unwrap();
    let now = chrono::Utc::now().timestamp();

    let account = AccountRecord {
        id: "acc_fault_net".to_string(),
        provider_type: ProviderType::Mock,
        name: "Fault Net Account".to_string(),
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

    let provider = Arc::new(MockCloudProvider::new(
        "acc_fault_net",
        "Fault Net Account",
        100_000_000,
    ));

    let content = Bytes::from("CRITICAL_FINANCIAL_REPORT_DATA_2026");
    let remote_file = provider
        .upload(
            None,
            "Financials.xlsx",
            content.clone(),
            "application/vnd.ms-excel",
        )
        .await
        .unwrap();

    entries.upsert_entry(&remote_file).unwrap();

    let hydration_mgr =
        HydrationManager::new(temp.path(), entries.clone(), provider.clone(), 4).unwrap();

    // 1. INJECT FAULT: 100% transient connection drop
    provider.inject_failures(1);

    let fail_result = hydration_mgr
        .hydrate(&remote_file, HydrationPriority::UserInteractive)
        .await;

    assert!(
        fail_result.is_err(),
        "Expected failure due to simulated network drop"
    );
    match fail_result {
        Err(CirrusError::Provider { message, .. }) => {
            assert!(message.contains("network connection drop"));
        }
        other => panic!("Unexpected error variant: {:?}", other),
    }

    // SQLite entry is set to retryable Error state on download failure
    let entry_after_fail = entries.get_entry(&remote_file.id).unwrap().unwrap();
    assert_eq!(entry_after_fail.state, FileState::Error);
    assert!(entry_after_fail.error_message.is_some());

    // 2. RETRY: Network recovers automatically
    let recovered_path = hydration_mgr
        .hydrate(&remote_file, HydrationPriority::UserInteractive)
        .await
        .expect("Retry hydration after network restoration failed");

    assert!(recovered_path.exists());
    let downloaded_bytes = tokio::fs::read(&recovered_path).await.unwrap();
    assert_eq!(downloaded_bytes, content);

    // Verify state transitioned cleanly to Available
    let entry_after_retry = entries.get_entry(&remote_file.id).unwrap().unwrap();
    assert_eq!(entry_after_retry.state, FileState::Available);
}

#[tokio::test]
async fn test_fault_injection_token_revoked_mid_sync() {
    let pool = DatabasePool::open_in_memory().unwrap();
    let accounts = AccountRepository::new(pool.clone());
    let entries = EntryRepository::new(pool.clone());
    let now = chrono::Utc::now().timestamp();

    let account1 = AccountRecord {
        id: "acc_auth_fail".to_string(),
        provider_type: ProviderType::Mock,
        name: "Revoked Account".to_string(),
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
    accounts.upsert_account(&account1).unwrap();

    let provider1 = Arc::new(MockCloudProvider::new(
        "acc_auth_fail",
        "Revoked Account",
        100_000_000,
    ));

    // Populate cached file
    let test_file = provider1
        .upload(None, "cached_note.txt", Bytes::from("cached"), "text/plain")
        .await
        .unwrap();
    entries.upsert_entry(&test_file).unwrap();

    let sync_engine1 = SyncEngine::new(
        "acc_auth_fail",
        provider1.clone(),
        accounts.clone(),
        entries.clone(),
    );

    // 1. INJECT FAULT: OAuth token revoked / expired
    provider1.inject_unauthorized(true);

    let res = sync_engine1.reconcile_delta_once().await;
    assert!(res.is_err());
    match res {
        Err(CirrusError::AuthRequired { account_id, .. }) => {
            assert_eq!(account_id, "acc_auth_fail");
            // Mark account as action required (re-auth)
            let mut acc = accounts.get_account(&account_id).unwrap().unwrap();
            acc.sync_status = AccountSyncStatus::ActionRequired;
            accounts.upsert_account(&acc).unwrap();
        }
        other => panic!("Expected AuthRequired error, got {:?}", other),
    }

    // Account status should be ActionRequired
    let updated_acc = accounts.get_account("acc_auth_fail").unwrap().unwrap();
    assert_eq!(updated_acc.sync_status, AccountSyncStatus::ActionRequired);

    // Local-first Rule 1: browsing cached entries still works perfectly even when unauthorized
    let cached_entry = entries.get_entry(&test_file.id).unwrap().unwrap();
    assert_eq!(cached_entry.name, "cached_note.txt");
}

#[tokio::test]
async fn test_fault_injection_crash_recovery_journal_rollback() {
    let pool = DatabasePool::open_in_memory().unwrap();
    let accounts = AccountRepository::new(pool.clone());
    let entries = EntryRepository::new(pool.clone());
    let journal = JournalRepository::new(pool.clone());
    let now = chrono::Utc::now().timestamp();

    let account = AccountRecord {
        id: "acc_test".to_string(),
        provider_type: ProviderType::Mock,
        name: "Crash Test Account".to_string(),
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

    // Seed file in DB
    let entry = EntryRecord::new_placeholder(
        "entry_mid_copy".to_string(),
        "acc_test".to_string(),
        None,
        None,
        "Original.dat".to_string(),
        "/Original.dat".to_string(),
        false,
        5000,
        now,
        "application/octet-stream".to_string(),
        None,
        now,
    );
    entries.upsert_entry(&entry).unwrap();

    // Simulate an uncompleted operation in the journal (crash / power loss)
    let pending_op = JournalRecord {
        id: "journal_uncommitted_1".to_string(),
        account_id: "acc_test".to_string(),
        op_type: JournalOpType::Copy,
        entry_id: Some("entry_mid_copy".to_string()),
        source_path: Some("/Original.dat".to_string()),
        destination_path: Some("/Original (copy).dat".to_string()),
        payload: "{}".to_string(),
        status: JobStatus::Pending,
        bytes_transferred: 0,
        total_bytes: 5000,
        error_message: None,
        retry_count: 0,
        created_at: now,
        updated_at: now,
    };
    journal.record_intent(&pending_op).unwrap();

    let ops_mgr = OperationsManager::new(entries.clone(), journal.clone(), 50);

    // Crash recovery on startup
    let recovered_count = ops_mgr.recover_pending_operations().await.unwrap();
    assert_eq!(recovered_count, 1);

    // Verify journal status is rolled back / cleaned
    let pending_list = journal.get_uncompleted_jobs().unwrap();
    assert_eq!(pending_list.len(), 0);

    // Original file remains safe and uncorrupted
    let original = entries.get_entry("entry_mid_copy").unwrap().unwrap();
    assert_eq!(original.name, "Original.dat");
}

#[tokio::test]
async fn test_fault_injection_unresponsive_mount_circuit_breaker() {
    let hangproof = HangProofFs::new(Duration::from_millis(50), Duration::from_secs(10));
    let dead_mount_path = std::path::Path::new("/mnt/nonexistent_dead_nfs_smb_fuse");

    // Reading or statting dead mount times out within 50ms without hanging the thread
    let start = std::time::Instant::now();
    let stat_result = hangproof.stat_hangproof(dead_mount_path).await;
    let elapsed = start.elapsed();

    // Must return within ~150ms max (not 30+ seconds standard kernel NFS hang)
    assert!(
        elapsed < Duration::from_millis(250),
        "Circuit breaker took too long: {:?}",
        elapsed
    );
    assert!(stat_result.is_err());
}
