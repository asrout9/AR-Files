use std::time::Instant;

use cirrus_core::account::{AccountRecord, AccountSyncStatus, ProviderType};
use cirrus_core::entry::EntryRecord;
use cirrus_core::query::{FolderListingQuery, SortDirection, SortField};
use cirrus_db::{AccountRepository, DatabasePool, EntryRepository};

#[test]
fn test_section8_100k_folder_listing_and_sort_budgets() {
    let pool = DatabasePool::open_in_memory().expect("Failed to open DB");
    let accounts_repo = AccountRepository::new(pool.clone());
    let entries_repo = EntryRepository::new(pool);
    let now = chrono::Utc::now().timestamp();

    let account = AccountRecord {
        id: "acc_sec8".to_string(),
        provider_type: ProviderType::Mock,
        name: "Section 8 Account".to_string(),
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
    accounts_repo.upsert_account(&account).unwrap();

    // Insert 100,000 items
    let total_items = 100_000;
    let batch_size = 10_000;
    for b in 0..(total_items / batch_size) {
        let items: Vec<EntryRecord> = (0..batch_size)
            .map(|i| {
                let id = b * batch_size + i;
                EntryRecord::new_placeholder(
                    format!("entry_{:06}", id),
                    "acc_sec8".to_string(),
                    None,
                    Some("folder_100k".to_string()),
                    format!("Dataset_Report_{:06}.parquet", id),
                    format!("/folder_100k/Dataset_Report_{:06}.parquet", id),
                    false,
                    (id as u64) * 256,
                    now - (id as i64),
                    "application/octet-stream".to_string(),
                    None,
                    now,
                )
            })
            .collect();
        entries_repo.upsert_entries_batch(&items).unwrap();
    }

    // Budget: First rows painted under 100 ms
    let query_first = FolderListingQuery {
        account_id: Some("acc_sec8".to_string()),
        parent_id: Some("folder_100k".to_string()),
        limit: 50,
        offset: 0,
        sort_by: SortField::Name,
        sort_direction: SortDirection::Asc,
        show_hidden: false,
        filter: None,
    };

    let start_p1 = Instant::now();
    let p1 = entries_repo.list_children_paged(&query_first).unwrap();
    let p1_elapsed = start_p1.elapsed();

    assert_eq!(p1.items.len(), 50);
    assert_eq!(p1.total_count, 100_000);
    println!("Section 8 Budget - First 50 rows of 100k: {:?}", p1_elapsed);
    assert!(
        p1_elapsed.as_millis() < 100,
        "First rows query took {:?}, exceeding 100ms budget",
        p1_elapsed
    );

    // Budget: Full sort under 300 ms (e.g. by mtime desc)
    let query_sort = FolderListingQuery {
        account_id: Some("acc_sec8".to_string()),
        parent_id: Some("folder_100k".to_string()),
        limit: 50,
        offset: 0,
        sort_by: SortField::Modified,
        sort_direction: SortDirection::Desc,
        show_hidden: false,
        filter: None,
    };

    let start_sort = Instant::now();
    let sort_res = entries_repo.list_children_paged(&query_sort).unwrap();
    let sort_elapsed = start_sort.elapsed();

    assert_eq!(sort_res.items.len(), 50);
    println!(
        "Section 8 Budget - Sort 100k by mtime desc: {:?}",
        sort_elapsed
    );
    assert!(
        sort_elapsed.as_millis() < 300,
        "Sorted query took {:?}, exceeding 300ms budget",
        sort_elapsed
    );

    // Budget: IPC message size ceiling: ensure a single paged payload is strictly under 1 MB
    let serialized_payload = serde_json::to_string(&p1).unwrap();
    let payload_bytes = serialized_payload.len();
    println!(
        "Section 8 Budget - IPC PagedResult size: {} bytes",
        payload_bytes
    );
    assert!(
        payload_bytes < 1024 * 1024,
        "IPC payload {} bytes exceeded 1MB budget limit",
        payload_bytes
    );
}

#[test]
fn test_section8_1m_names_search_budget() {
    let pool = DatabasePool::open_in_memory().expect("Failed to open DB");
    let accounts_repo = AccountRepository::new(pool.clone());
    let entries_repo = EntryRepository::new(pool.clone());
    let now = chrono::Utc::now().timestamp();

    println!("\n=== SECTION 8 BENCHMARK: 1,000,000 NAMES SEARCH BUDGET ===");

    let account = AccountRecord {
        id: "acc_fts_1m".to_string(),
        provider_type: ProviderType::Mock,
        name: "FTS Account".to_string(),
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
    accounts_repo.upsert_account(&account).unwrap();

    // Populate FTS5 table with 1,000,000 names using bulk transaction
    let conn = pool.get().unwrap();
    conn.execute_batch("BEGIN TRANSACTION;").unwrap();
    {
        let mut fts_stmt = conn
            .prepare_cached("INSERT INTO entries_fts(entry_id, name, path) VALUES (?1, ?2, ?3)")
            .unwrap();
        let mut entry_stmt = conn
            .prepare_cached(
                "INSERT INTO entries (id, account_id, name, path, is_directory, size, mtime, mime_type, state, sync_version, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"
            )
            .unwrap();

        let categories = [
            "Document",
            "Report",
            "Invoice",
            "Photo",
            "Dataset",
            "Video",
            "Backup",
            "Contract",
            "Spreadsheet",
            "Archive",
        ];
        for i in 0..1_000_000 {
            let cat = categories[i % categories.len()];
            let id = format!("fts_{}", i);
            let name = format!("{}_File_{:07}_audit.pdf", cat, i);
            let path = format!("/Archive/{}_File_{:07}_audit.pdf", cat, i);
            fts_stmt.execute(rusqlite::params![id, name, path]).unwrap();

            // Populate entries around target search range for join resolution
            if (749_980..750_030).contains(&i) {
                entry_stmt
                    .execute(rusqlite::params![
                        id,
                        "acc_fts_1m",
                        name,
                        path,
                        0,
                        1024,
                        now,
                        "application/pdf",
                        "cloud_only",
                        1,
                        now,
                        now,
                    ])
                    .unwrap();
            }
        }
    }
    conn.execute_batch("COMMIT;").unwrap();

    // Section 8 Budget: Search over 1,000,000 indexed names: first results under 100 ms
    let start_search = Instant::now();
    let results = entries_repo.search_fts("Document 0750000", 25).unwrap();
    let search_elapsed = start_search.elapsed();

    println!(
        "Section 8 Budget - Search 1,000,000 names: {:?} (results: {})",
        search_elapsed,
        results.len()
    );
    assert!(!results.is_empty(), "Expected search results from 1M index");
    let max_budget_ms = if cfg!(debug_assertions) { 300 } else { 100 };
    assert!(
        search_elapsed.as_millis() < max_budget_ms,
        "FTS5 1M search took {:?}, exceeding {}ms budget",
        search_elapsed,
        max_budget_ms
    );
}
