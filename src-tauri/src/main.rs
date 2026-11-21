pub mod commands;
pub mod state;

use cirrus_core::account::{AccountRecord, AccountSyncStatus, ProviderType};
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::Result;
use state::AppState;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize structured logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber).expect("Failed to set tracing subscriber");

    info!("Starting Cirrus Files (AR Files) Desktop Manager...");

    let state = AppState::new()?;

    // Seed default Google Drive and OneDrive accounts if newly initialized
    let existing_accounts = state.accounts_repo.list_accounts()?;
    if existing_accounts.is_empty() {
        info!("Seeding initial cloud drive accounts...");
        let now = chrono::Utc::now().timestamp();

        let gdrive_acc = AccountRecord {
            id: "acc_gdrive".to_string(),
            provider_type: ProviderType::GoogleDrive,
            name: "Google Drive".to_string(),
            email: Some("user@gmail.com".to_string()),
            root_folder_id: Some("gdrive_root".to_string()),
            quota_total: Some(15 * 1024 * 1024 * 1024),
            quota_used: Some(6 * 1024 * 1024 * 1024),
            sync_status: AccountSyncStatus::Idle,
            delta_token: Some("token_init".to_string()),
            mount_path: None,
            created_at: now,
            updated_at: now,
        };

        state.accounts_repo.upsert_account(&gdrive_acc)?;

        // Seed some starter files
        let docs_folder = EntryRecord::new_placeholder(
            "folder_docs".to_string(),
            "acc_gdrive".to_string(),
            None,
            None,
            "Documents".to_string(),
            "/Documents".to_string(),
            true,
            0,
            now,
            "inode/directory".to_string(),
            None,
            now,
        );

        let report_file = EntryRecord::new_placeholder(
            "file_report_2026".to_string(),
            "acc_gdrive".to_string(),
            None,
            Some("folder_docs".to_string()),
            "Annual_Report_2026.pdf".to_string(),
            "/Documents/Annual_Report_2026.pdf".to_string(),
            false,
            4815162,
            now,
            "application/pdf".to_string(),
            None,
            now,
        );

        state.entries_repo.upsert_entry(&docs_folder)?;
        state.entries_repo.upsert_entry(&report_file)?;
    }

    info!("Cirrus Files backend initialized cleanly. Ready for UI connections.");

    Ok(())
}
