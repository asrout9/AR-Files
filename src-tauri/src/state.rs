use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use cirrus_core::error::Result;
use cirrus_db::{
    AccountRepository, DatabasePool, EntryRepository, JournalRepository, SettingsRepository,
};
use cirrus_ops::OperationsManager;
use cirrus_platform::{DesktopEntryManager, HangProofFs, ThumbnailManager, TrashManager};
use cirrus_providers::{CloudProvider, CredentialsManager, GenericCloudConfig, MockCloudProvider};
use cirrus_sync::{
    BandwidthLimiter, CacheManager, HydrationManager, SyncEngine, UploadQueueManager,
};
use cirrus_vfs::MountManager;

#[derive(Clone)]
pub struct AppState {
    pub db_pool: DatabasePool,
    pub accounts_repo: AccountRepository,
    pub entries_repo: EntryRepository,
    pub journal_repo: JournalRepository,
    pub settings_repo: SettingsRepository,
    pub desktop_mgr: Arc<RwLock<DesktopEntryManager>>,
    pub trash_mgr: Arc<TrashManager>,
    pub thumbnail_mgr: Arc<ThumbnailManager>,
    pub ops_mgr: OperationsManager,
    pub cache_mgr: CacheManager,
    pub hangproof_fs: HangProofFs,
    pub cache_dir: PathBuf,
    pub credentials_mgr: CredentialsManager,
    pub download_limiter: Arc<BandwidthLimiter>,
    pub upload_limiter: Arc<BandwidthLimiter>,
    pub providers: Arc<RwLock<HashMap<String, Arc<dyn CloudProvider>>>>,
    pub sync_engines: Arc<RwLock<HashMap<String, Arc<SyncEngine>>>>,
    pub upload_queues: Arc<RwLock<HashMap<String, Arc<UploadQueueManager>>>>,
    pub hydration_mgr: Arc<HydrationManager>,
    pub mount_mgr: Arc<MountManager>,
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

        let desktop_mgr = Arc::new(RwLock::new(DesktopEntryManager::new()));
        let trash_mgr = Arc::new(TrashManager::new()?);
        let thumbnail_mgr = Arc::new(ThumbnailManager::new());
        let ops_mgr = OperationsManager::new(entries_repo.clone(), journal_repo.clone(), 50);
        let cache_mgr = CacheManager::new(&cache_dir, entries_repo.clone());
        let hangproof_fs = HangProofFs::default();
        let mount_mgr = Arc::new(MountManager::new(MountManager::default_mount_dir()));

        let credentials_mgr = CredentialsManager::default();
        let download_limiter = Arc::new(BandwidthLimiter::default());
        let upload_limiter = Arc::new(BandwidthLimiter::default());

        // Providers, Sync Engines, and Upload Queues registry
        let providers_map: HashMap<String, Arc<dyn CloudProvider>> = HashMap::new();
        let providers = Arc::new(RwLock::new(providers_map));

        let sync_engines_map: HashMap<String, Arc<SyncEngine>> = HashMap::new();
        let sync_engines = Arc::new(RwLock::new(sync_engines_map));

        let upload_queues_map: HashMap<String, Arc<UploadQueueManager>> = HashMap::new();
        let upload_queues = Arc::new(RwLock::new(upload_queues_map));

        // Default initial fallback provider for hydration manager when no cloud account is connected
        let default_provider: Arc<dyn CloudProvider> = Arc::new(MockCloudProvider::new(
            "fallback",
            "None",
            0,
        ));

        let hydration_mgr = Arc::new(HydrationManager::new(
            &cache_dir,
            entries_repo.clone(),
            default_provider,
            4,
        )?);

        let this = Self {
            db_pool,
            accounts_repo,
            entries_repo,
            journal_repo,
            settings_repo,
            desktop_mgr,
            trash_mgr,
            thumbnail_mgr,
            ops_mgr,
            cache_mgr,
            hangproof_fs,
            cache_dir,
            credentials_mgr,
            download_limiter,
            upload_limiter,
            providers,
            sync_engines,
            upload_queues,
            hydration_mgr,
            mount_mgr,
        };

        this.restore_registered_accounts();

        Ok(this)
    }

    /// Restore registered accounts from the database upon startup
    pub fn restore_registered_accounts(&self) {
        if let Ok(accounts) = self.accounts_repo.list_accounts() {
            for acc in accounts {
                match acc.provider_type {
                    cirrus_core::account::ProviderType::GoogleDrive => {
                        let provider = Arc::new(cirrus_providers::GoogleDriveProvider::new(
                            &acc.id,
                            &acc.name,
                            self.credentials_mgr.clone(),
                        ));
                        self.register_cloud_account(&acc.id, provider);
                    }
                    cirrus_core::account::ProviderType::OneDrive => {
                        let provider = Arc::new(cirrus_providers::OneDriveProvider::new(
                            &acc.id,
                            &acc.name,
                            self.credentials_mgr.clone(),
                        ));
                        self.register_cloud_account(&acc.id, provider);
                    }
                    cirrus_core::account::ProviderType::WebDAV
                    | cirrus_core::account::ProviderType::Nextcloud
                    | cirrus_core::account::ProviderType::S3 => {
                        if let Ok(Some(config)) = self
                            .settings_repo
                            .get_json::<GenericCloudConfig>(&format!("generic_config:{}", acc.id))
                        {
                            let provider = Arc::new(cirrus_providers::GenericCloudProvider::new(
                                &acc.id,
                                &acc.name,
                                config,
                                self.credentials_mgr.clone(),
                            ));
                            self.register_cloud_account(&acc.id, provider);
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    /// Helper to register a newly connected cloud provider account into active memory
    pub fn register_cloud_account(&self, account_id: &str, provider: Arc<dyn CloudProvider>) {
        self.providers
            .write()
            .insert(account_id.to_string(), provider.clone());

        let engine = Arc::new(SyncEngine::new(
            account_id,
            provider,
            self.accounts_repo.clone(),
            self.entries_repo.clone(),
        ));
        self.sync_engines
            .write()
            .insert(account_id.to_string(), engine);

        let upload_queue = Arc::new(UploadQueueManager::new(
            account_id,
            self.entries_repo.clone(),
        ));
        self.upload_queues
            .write()
            .insert(account_id.to_string(), upload_queue);
    }
}
