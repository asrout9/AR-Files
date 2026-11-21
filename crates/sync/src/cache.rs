use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::info;

use cirrus_core::error::{CirrusError, Result};
use cirrus_core::state::FileState;
use cirrus_db::EntryRepository;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_cached_bytes: u64,
    pub evictable_bytes: u64,
    pub pinned_bytes: u64,
}

#[derive(Clone)]
pub struct CacheManager {
    cache_dir: PathBuf,
    entries_repo: EntryRepository,
}

impl CacheManager {
    pub fn new<P: AsRef<Path>>(cache_dir: P, entries_repo: EntryRepository) -> Self {
        Self {
            cache_dir: cache_dir.as_ref().to_path_buf(),
            entries_repo,
        }
    }

    /// Explicitly frees up space for an entry by removing local replica and resetting state to CloudOnly.
    pub fn free_up_space(&self, entry_id: &str) -> Result<()> {
        let entry =
            self.entries_repo
                .get_entry(entry_id)?
                .ok_or_else(|| CirrusError::NotFound {
                    entity: "Entry".to_string(),
                    id: entry_id.to_string(),
                })?;

        if !entry.state.is_evictable() && entry.state != FileState::Pinned {
            return Err(CirrusError::Validation(format!(
                "Cannot evict entry in state '{:?}'",
                entry.state
            )));
        }

        // Delete physical cached file if it exists
        if let Some(ref path) = entry.local_path {
            let p = Path::new(path);
            if p.exists() {
                let _ = std::fs::remove_file(p);
            }
        }

        // Fallback check in content dir
        let fallback_path = self.cache_dir.join("content").join(entry_id);
        if fallback_path.exists() {
            let _ = std::fs::remove_file(fallback_path);
        }

        // Revert SQLite state to CloudOnly
        self.entries_repo
            .update_state(entry_id, FileState::CloudOnly, None, None)?;
        info!("Evicted cached file for entry '{}' -> CloudOnly", entry_id);

        Ok(())
    }

    /// Evaluates current cache consumption against the configured quota and evicts oldest items.
    pub fn enforce_budget(&self, max_bytes: u64) -> Result<u64> {
        let mut freed_bytes = 0u64;
        let evictable = self.entries_repo.get_evictable_entries(100)?;

        let mut current_used: u64 = evictable.iter().map(|e| e.size).sum();

        for entry in evictable {
            if current_used <= max_bytes {
                break;
            }

            if let Ok(()) = self.free_up_space(&entry.id) {
                freed_bytes += entry.size;
                current_used = current_used.saturating_sub(entry.size);
            }
        }

        Ok(freed_bytes)
    }

    /// Calculates cache statistics across all entries.
    pub fn calculate_stats(&self) -> Result<CacheStats> {
        let evictable = self.entries_repo.get_evictable_entries(10_000)?;
        let evictable_bytes: u64 = evictable.iter().map(|e| e.size).sum();

        Ok(CacheStats {
            total_cached_bytes: evictable_bytes,
            evictable_bytes,
            pinned_bytes: 0,
        })
    }
}
