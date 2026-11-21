use cirrus_core::entry::EntryRecord;
use cirrus_core::query::{FolderListingQuery, SortDirection, SortField};
use cirrus_db::{DatabasePool, EntryRepository};
use std::time::Instant;

#[test]
fn test_scale_100k_items_benchmark() {
    let pool = DatabasePool::open_in_memory().expect("Failed to open in-memory DB");
    let accounts_repo = cirrus_db::AccountRepository::new(pool.clone());
    let entries_repo = EntryRepository::new(pool);
    let now = chrono::Utc::now().timestamp();

    let account = cirrus_core::account::AccountRecord {
        id: "acc_benchmark".to_string(),
        provider_type: cirrus_core::account::ProviderType::Mock,
        name: "Benchmark Account".to_string(),
        email: None,
        root_folder_id: None,
        quota_total: None,
        quota_used: None,
        sync_status: cirrus_core::account::AccountSyncStatus::Idle,
        delta_token: None,
        mount_path: None,
        created_at: now,
        updated_at: now,
    };
    accounts_repo
        .upsert_account(&account)
        .expect("Account upsert failed");

    println!("\n=== SCALE BENCHMARK: 100,000 ITEMS ===");

    // Generate 100,000 items in batches of 5,000 for realistic cloud scan simulation
    let total_items = 100_000;
    let batch_size = 5_000;
    let start_gen = Instant::now();

    for batch_idx in 0..(total_items / batch_size) {
        let items: Vec<EntryRecord> = (0..batch_size)
            .map(|i| {
                let id = batch_idx * batch_size + i;
                EntryRecord::new_placeholder(
                    format!("entry_{:06}", id),
                    "acc_benchmark".to_string(),
                    None,
                    Some("bench_folder_100k".to_string()),
                    format!("Dataset_Record_{:06}_analysis_report.parquet", id),
                    format!("/bench/Dataset_Record_{:06}_analysis_report.parquet", id),
                    false,
                    (id as u64) * 1024,
                    now - (id as i64),
                    "application/octet-stream".to_string(),
                    None,
                    now,
                )
            })
            .collect();

        entries_repo
            .upsert_entries_batch(&items)
            .expect("Batch insert failed");
    }
    let insert_duration = start_gen.elapsed();
    println!(
        "Inserted 100,000 items in: {:.2?} ({:.0} items/sec)",
        insert_duration,
        total_items as f64 / insert_duration.as_secs_f64()
    );

    // 1. Benchmark: First page (Time to first frame)
    let query_first_page = FolderListingQuery {
        account_id: Some("acc_benchmark".to_string()),
        parent_id: Some("bench_folder_100k".to_string()),
        limit: 50,
        offset: 0,
        sort_by: SortField::Name,
        sort_direction: SortDirection::Asc,
        show_hidden: false,
        filter: None,
    };

    let start_p1 = Instant::now();
    let page1 = entries_repo
        .list_children_paged(&query_first_page)
        .expect("Query first page failed");
    let p1_duration = start_p1.elapsed();

    println!("Query first page (limit 50, offset 0): {:?}", p1_duration);
    assert_eq!(page1.items.len(), 50);
    assert_eq!(page1.total_count, 100_000);
    // Budget is < 300 ms; our composite index should yield < 30 ms
    assert!(
        p1_duration.as_millis() < 300,
        "First frame query took {:?}, exceeding 300ms SLA",
        p1_duration
    );

    // 2. Benchmark: Mid-scroll (offset 50,000)
    let query_mid_page = FolderListingQuery {
        account_id: Some("acc_benchmark".to_string()),
        parent_id: Some("bench_folder_100k".to_string()),
        limit: 50,
        offset: 50_000,
        sort_by: SortField::Name,
        sort_direction: SortDirection::Asc,
        show_hidden: false,
        filter: None,
    };

    let start_mid = Instant::now();
    let page_mid = entries_repo
        .list_children_paged(&query_mid_page)
        .expect("Query mid page failed");
    let mid_duration = start_mid.elapsed();

    println!(
        "Query mid page (limit 50, offset 50,000): {:?}",
        mid_duration
    );
    assert_eq!(page_mid.items.len(), 50);

    // 3. Benchmark: FTS5 Full-Text Search across 100,000 indexed names
    let start_fts = Instant::now();
    let search_results = entries_repo
        .search_fts("analysis report 050000", 25)
        .expect("FTS search failed");
    let fts_duration = start_fts.elapsed();

    println!(
        "FTS5 full text search query across 100,000 files: {:?}",
        fts_duration
    );
    assert!(!search_results.is_empty());
    // Budget is < 100 ms
    assert!(
        fts_duration.as_millis() < 100,
        "FTS search took {:?}, exceeding 100ms SLA",
        fts_duration
    );

    println!("=== SCALE BENCHMARK PASSED SUCCESSFULLY ===\n");
}
