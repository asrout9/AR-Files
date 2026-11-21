use std::path::PathBuf;
use std::sync::Arc;

use cirrus_core::error::Result;
use cirrus_db::{
    AccountRepository, DatabasePool, EntryRepository, JournalRepository, SettingsRepository,
};
use cirrus_ops::OperationsManager;
use cirrus_platform::{DesktopEntryManager, HangProofFs, TrashManager};
use cirrus_sync::CacheManager;

#[derive(Clone)]
pub struct AppState {
    pub db_pool: DatabasePool,
    pub accounts_repo: AccountRepository,
    pub entries_repo: EntryRepository,
    pub journal_repo: JournalRepository,
    pub settings_repo: SettingsRepository,
    pub desktop_mgr: Arc<DesktopEntryManager>,
    pub trash_mgr: Arc<TrashManager>,
    pub ops_mgr: OperationsManager,
    pub cache_mgr: CacheManager,
    pub hangproof_fs: HangProofFs,
    pub cache_dir: PathBuf,
}

impl AppState {
    pub fn new() -> Result<Self> {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/tmp"));

        let data_dir = home.join(".local").join("share").join("ar-files");
        let cache_dir = home.join(".cache").join("ar-files");
        let db_path = data_dir.join("metadata.db");

        let db_pool = DatabasePool::open_at_path(&db_path)?;
        let accounts_repo = AccountRepository::new(db_pool.clone());
        let entries_repo = EntryRepository::new(db_pool.clone());
        let journal_repo = JournalRepository::new(db_pool.clone());
        let settings_repo = SettingsRepository::new(db_pool.clone());

        let desktop_mgr = Arc::new(DesktopEntryManager::new());
        let trash_mgr = Arc::new(TrashManager::new()?);
        let ops_mgr = OperationsManager::new(entries_repo.clone(), journal_repo.clone(), 50);
        let cache_mgr = CacheManager::new(&cache_dir, entries_repo.clone());
        let hangproof_fs = HangProofFs::default();

        Ok(Self {
            db_pool,
            accounts_repo,
            entries_repo,
            journal_repo,
            settings_repo,
            desktop_mgr,
            trash_mgr,
            ops_mgr,
            cache_mgr,
            hangproof_fs,
            cache_dir,
        })
    }
}
