use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::conflict::ConflictDetector;
use cirrus_core::account::AccountSyncStatus;
use cirrus_core::entry::DiffEvent;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::state::FileState;
use cirrus_db::{AccountRepository, EntryRepository};
use cirrus_providers::CloudProvider;

#[derive(Clone)]
pub struct SyncEngine {
    account_id: String,
    provider: Arc<dyn CloudProvider>,
    accounts_repo: AccountRepository,
    entries_repo: EntryRepository,
    diff_tx: broadcast::Sender<DiffEvent>,
    is_running: Arc<AtomicBool>,
}

impl SyncEngine {
    pub fn new(
        account_id: &str,
        provider: Arc<dyn CloudProvider>,
        accounts_repo: AccountRepository,
        entries_repo: EntryRepository,
    ) -> Self {
        let (diff_tx, _) = broadcast::channel(256);

        Self {
            account_id: account_id.to_string(),
            provider,
            accounts_repo,
            entries_repo,
            diff_tx,
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn subscribe_diffs(&self) -> broadcast::Receiver<DiffEvent> {
        self.diff_tx.subscribe()
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }

    /// Performs the initial breadth-first crawl of a cloud folder tree, committing entries incrementally.
    pub async fn run_initial_scan(&self, root_id: Option<&str>) -> Result<()> {
        info!(
            "Starting initial breadth-first scan for account '{}'...",
            self.account_id
        );
        self.accounts_repo.update_sync_status(
            &self.account_id,
            AccountSyncStatus::Indexing,
            None,
        )?;

        let mut queue = VecDeque::new();
        queue.push_back(root_id.map(|s| s.to_string()));

        let mut batch = Vec::new();

        while let Some(parent_opt) = queue.pop_front() {
            let pid_ref = parent_opt.as_deref();
            let mut page_token: Option<String> = None;

            loop {
                match self
                    .provider
                    .list_children(pid_ref, page_token.as_deref())
                    .await
                {
                    Ok((children, next_token)) => {
                        for child in children {
                            if child.is_directory {
                                queue.push_back(Some(child.id.clone()));
                            }
                            batch.push(child);

                            if batch.len() >= 100 {
                                self.entries_repo.upsert_entries_batch(&batch)?;
                                for entry in &batch {
                                    let _ = self.diff_tx.send(DiffEvent::Added(entry.clone()));
                                }
                                batch.clear();
                            }
                        }

                        page_token = next_token;
                        if page_token.is_none() {
                            break;
                        }
                    }
                    Err(err) => {
                        error!(
                            "Failed listing children for parent '{:?}': {}",
                            pid_ref, err
                        );
                        self.accounts_repo.update_sync_status(
                            &self.account_id,
                            AccountSyncStatus::Error,
                            None,
                        )?;
                        return Err(err);
                    }
                }
            }
        }

        if !batch.is_empty() {
            self.entries_repo.upsert_entries_batch(&batch)?;
            for entry in &batch {
                let _ = self.diff_tx.send(DiffEvent::Added(entry.clone()));
            }
        }

        // Fetch initial change delta token for steady-state sync
        let initial_delta = self.provider.changes(None).await.ok();
        let token = initial_delta.map(|d| d.new_delta_token);

        self.accounts_repo.update_sync_status(
            &self.account_id,
            AccountSyncStatus::Idle,
            token.as_deref(),
        )?;

        info!(
            "Initial scan completed successfully for account '{}'",
            self.account_id
        );
        Ok(())
    }

    /// Steady-state reconciliation loop: polls or listens for provider delta changes.
    pub async fn reconcile_delta_once(&self) -> Result<usize> {
        let account = self
            .accounts_repo
            .get_account(&self.account_id)?
            .ok_or_else(|| CirrusError::NotFound {
                entity: "Account".to_string(),
                id: self.account_id.clone(),
            })?;

        let since_token = account.delta_token.as_deref();
        let feed = self.provider.changes(since_token).await?;

        if feed.changes.is_empty() {
            return Ok(0);
        }

        info!(
            "Processing {} delta changes for account '{}'...",
            feed.changes.len(),
            self.account_id
        );

        let mut upsert_batch = Vec::new();
        let mut diff_events = Vec::new();

        for change in &feed.changes {
            if change.is_deleted {
                let _ = self.entries_repo.delete_entry(&change.id);
                diff_events.push(DiffEvent::Removed {
                    id: change.id.clone(),
                    parent_id: None,
                });
            } else if let Some(ref remote_entry) = change.entry {
                // Check for conflict against local state
                if let Ok(Some(local_entry)) = self.entries_repo.get_entry(&remote_entry.id) {
                    if ConflictDetector::is_conflict(&local_entry, remote_entry) {
                        warn!(
                            "Conflict detected on entry '{}' ({})",
                            remote_entry.id, remote_entry.name
                        );
                        let conflict_name = ConflictDetector::generate_conflict_name(
                            &local_entry.name,
                            "Local-Device",
                        );

                        let mut forked_copy = local_entry.clone();
                        forked_copy.id = format!("conflict_{}", uuid::Uuid::new_v4());
                        forked_copy.name = conflict_name;
                        forked_copy.state = FileState::Conflict;

                        upsert_batch.push(forked_copy.clone());
                        diff_events.push(DiffEvent::Added(forked_copy));
                    }
                }

                upsert_batch.push(remote_entry.clone());
                diff_events.push(DiffEvent::Updated(remote_entry.clone()));
            }
        }

        if !upsert_batch.is_empty() {
            self.entries_repo.upsert_entries_batch(&upsert_batch)?;
        }

        // Update delta token in account record
        self.accounts_repo.update_sync_status(
            &self.account_id,
            AccountSyncStatus::Idle,
            Some(&feed.new_delta_token),
        )?;

        // Broadcast diff events to UI
        for event in diff_events {
            let _ = self.diff_tx.send(event);
        }

        Ok(feed.changes.len())
    }
}
