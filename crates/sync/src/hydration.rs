use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::fs::OpenOptions;
use tokio::io::AsyncWriteExt;
use tokio::sync::{broadcast, Semaphore};
use tracing::{error, info};

use cirrus_core::entry::EntryRecord;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::state::FileState;
use cirrus_db::EntryRepository;
use cirrus_providers::{ByteRange, CloudProvider};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum HydrationPriority {
    Prefetch = 0,
    Pinned = 1,
    UserInteractive = 2,
}

#[derive(Debug, Clone)]
pub struct HydrationProgress {
    pub entry_id: String,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub state: FileState,
}

#[allow(dead_code)]
#[derive(Debug)]
struct QueuedTask {
    entry_id: String,
    priority: HydrationPriority,
    added_at: Instant,
}

impl PartialEq for QueuedTask {
    fn eq(&self, other: &Self) -> bool {
        self.entry_id == other.entry_id
    }
}

impl Eq for QueuedTask {}

impl PartialOrd for QueuedTask {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for QueuedTask {
    fn cmp(&self, other: &Self) -> Ordering {
        self.priority
            .cmp(&other.priority)
            .then_with(|| other.added_at.cmp(&self.added_at))
    }
}

#[derive(Clone)]
pub struct HydrationManager {
    cache_dir: PathBuf,
    entries_repo: EntryRepository,
    provider: Arc<dyn CloudProvider>,
    semaphore: Arc<Semaphore>,
    progress_tx: broadcast::Sender<HydrationProgress>,
    cancelled: Arc<Mutex<HashSet<String>>>,
    active_downloads: Arc<Mutex<HashSet<String>>>,
}

impl HydrationManager {
    pub fn new<P: AsRef<Path>>(
        cache_dir: P,
        entries_repo: EntryRepository,
        provider: Arc<dyn CloudProvider>,
        max_concurrent: usize,
    ) -> Result<Self> {
        let cache_dir = cache_dir.as_ref().to_path_buf();
        let parts_dir = cache_dir.join("parts");
        let content_dir = cache_dir.join("content");

        std::fs::create_dir_all(&parts_dir)
            .map_err(|e| CirrusError::Storage(format!("Failed to create parts dir: {}", e)))?;
        std::fs::create_dir_all(&content_dir)
            .map_err(|e| CirrusError::Storage(format!("Failed to create content dir: {}", e)))?;

        let (progress_tx, _) = broadcast::channel(128);

        Ok(Self {
            cache_dir,
            entries_repo,
            provider,
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            progress_tx,
            cancelled: Arc::new(Mutex::new(HashSet::new())),
            active_downloads: Arc::new(Mutex::new(HashSet::new())),
        })
    }

    pub fn subscribe_progress(&self) -> broadcast::Receiver<HydrationProgress> {
        self.progress_tx.subscribe()
    }

    pub fn cancel(&self, entry_id: &str) {
        self.cancelled.lock().insert(entry_id.to_string());
    }

    pub fn is_active(&self, entry_id: &str) -> bool {
        self.active_downloads.lock().contains(entry_id)
    }

    /// Triggers background hydration of a file using the configured default provider.
    pub async fn hydrate(
        &self,
        entry: &EntryRecord,
        priority: HydrationPriority,
    ) -> Result<PathBuf> {
        self.hydrate_with_provider(entry, priority, self.provider.clone())
            .await
    }

    /// Triggers background hydration of a file using a specified cloud provider.
    pub async fn hydrate_with_provider(
        &self,
        entry: &EntryRecord,
        _priority: HydrationPriority,
        provider: Arc<dyn CloudProvider>,
    ) -> Result<PathBuf> {
        let entry_id = entry.id.clone();
        let sanitized_id = entry_id.replace(['/', ':', '\\'], "_");
        let content_dir = self.cache_dir.join("content").join(&sanitized_id);
        let final_path = content_dir.join(&entry.name);
        if self.is_active(&entry_id) {
            info!("Hydration for entry '{}' is already in flight", entry_id);
            return Ok(final_path);
        }

        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|_| CirrusError::Cancelled)?;

        self.active_downloads.lock().insert(entry_id.clone());
        self.cancelled.lock().remove(&entry_id);

        let part_path = self
            .cache_dir
            .join("parts")
            .join(format!("{}.part", sanitized_id));

        if let Some(parent) = part_path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        let _ = tokio::fs::create_dir_all(&content_dir).await;

        // Mark state as Hydrating
        let _ = self
            .entries_repo
            .update_state(&entry_id, FileState::Hydrating, None, None);
        let _ = self.progress_tx.send(HydrationProgress {
            entry_id: entry_id.clone(),
            bytes_downloaded: 0,
            total_bytes: entry.size,
            speed_bps: 0,
            state: FileState::Hydrating,
        });

        let result = self
            .execute_download(entry, &part_path, &final_path, &provider)
            .await;

        self.active_downloads.lock().remove(&entry_id);

        match result {
            Ok(path) => {
                let target_state = if entry.state == FileState::Pinned {
                    FileState::Pinned
                } else {
                    FileState::Available
                };

                let path_str = path.to_string_lossy().to_string();
                let _ =
                    self.entries_repo
                        .update_state(&entry_id, target_state, Some(&path_str), None);
                let _ = self.progress_tx.send(HydrationProgress {
                    entry_id: entry_id.clone(),
                    bytes_downloaded: entry.size,
                    total_bytes: entry.size,
                    speed_bps: 0,
                    state: target_state,
                });
                info!(
                    "Successfully hydrated entry '{}' to {}",
                    entry_id,
                    path.display()
                );
                Ok(path)
            }
            Err(err) => {
                error!("Hydration failed for entry '{}': {}", entry_id, err);
                let err_msg = err.to_string();
                let is_auth_error = matches!(err, CirrusError::AuthRequired { .. })
                    || err_msg.contains("401")
                    || err_msg.contains("UNAUTHENTICATED")
                    || err_msg.contains("Invalid Credentials");

                let target_state = if is_auth_error {
                    FileState::CloudOnly
                } else {
                    FileState::Error
                };

                let _ = self.entries_repo.update_state(
                    &entry_id,
                    target_state,
                    None,
                    Some(&err_msg),
                );
                let _ = self.progress_tx.send(HydrationProgress {
                    entry_id,
                    bytes_downloaded: 0,
                    total_bytes: entry.size,
                    speed_bps: 0,
                    state: target_state,
                });
                Err(err)
            }
        }
    }

    async fn execute_download(
        &self,
        entry: &EntryRecord,
        part_path: &Path,
        final_path: &Path,
        provider: &Arc<dyn CloudProvider>,
    ) -> Result<PathBuf> {
        let entry_id = &entry.id;

        // Check if resumed from existing partial download
        let mut existing_bytes = 0u64;
        if part_path.exists() {
            if let Ok(meta) = tokio::fs::metadata(part_path).await {
                existing_bytes = meta.len();
            }
        }

        // Open part file for append or write
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .append(true)
            .open(part_path)
            .await
            .map_err(|e| CirrusError::Io(format!("Failed to open part file: {}", e)))?;

        let range = if existing_bytes > 0 && existing_bytes < entry.size {
            info!(
                "Resuming download for '{}' from byte {}",
                entry_id, existing_bytes
            );
            Some(ByteRange {
                start: existing_bytes,
                end: None,
            })
        } else {
            // Overwrite from beginning
            file.set_len(0)
                .await
                .map_err(|e| CirrusError::Io(e.to_string()))?;
            None
        };

        // Fetch data from provider
        let data = provider.download(entry_id, range).await?;

        // Check cancellation
        if self.cancelled.lock().contains(entry_id) {
            return Err(CirrusError::Cancelled);
        }

        file.write_all(&data)
            .await
            .map_err(|e| CirrusError::Io(format!("Failed to write part file: {}", e)))?;
        file.sync_all()
            .await
            .map_err(|e| CirrusError::Io(format!("Failed to fsync part file: {}", e)))?;
        drop(file);

        // Verify checksum if provider specified content_hash
        if let Some(ref expected_hash) = entry.content_hash {
            let part_data = tokio::fs::read(part_path)
                .await
                .map_err(|e| CirrusError::Io(e.to_string()))?;

            let expected_clean = expected_hash.trim().trim_matches('"');
            let computed = if expected_clean.len() == 32 {
                // 32-character hex string = MD5 (Google Drive)
                compute_md5(&part_data)
            } else if expected_clean.len() == 64 {
                // 64-character hex string = SHA-256
                let mut hasher = Sha256::new();
                hasher.update(&part_data);
                hex::encode(hasher.finalize())
            } else {
                // Other provider hash format (e.g. quickXorHash / etag)
                expected_clean.to_string()
            };

            if !computed.eq_ignore_ascii_case(expected_clean) {
                let _ = tokio::fs::remove_file(part_path).await;
                return Err(CirrusError::Validation(format!(
                    "Checksum mismatch: expected '{}', computed '{}'",
                    expected_hash, computed
                )));
            }
        }

        // Atomic rename from .part to final cache destination
        tokio::fs::rename(part_path, final_path)
            .await
            .map_err(|e| CirrusError::Io(format!("Failed atomic rename: {}", e)))?;

        Ok(final_path.to_path_buf())
    }
}

// Minimal inlined MD5 implementation for standard MD5 checksum validation (Google Drive)
#[allow(clippy::chunks_exact_to_as_chunks)]
fn compute_md5(input: &[u8]) -> String {
    let mut h = [0x67452301u32, 0xefcdab89u32, 0x98badcfeu32, 0x10325476u32];

    let len = input.len();
    let mut padded = input.to_vec();
    padded.push(0x80);
    while (padded.len() % 64) != 56 {
        padded.push(0);
    }
    let bit_len = (len as u64) * 8;
    padded.extend_from_slice(&bit_len.to_le_bytes());

    for chunk in padded.chunks_exact(64) {
        let mut words = [0u32; 16];
        for (i, word) in words.iter_mut().enumerate() {
            let start = i * 4;
            *word = u32::from_le_bytes([
                chunk[start],
                chunk[start + 1],
                chunk[start + 2],
                chunk[start + 3],
            ]);
        }

        let (mut a, mut b, mut c, mut d) = (h[0], h[1], h[2], h[3]);

        macro_rules! step {
            ($f:expr, $a:expr, $b:expr, $c:expr, $d:expr, $k:expr, $s:expr, $i:expr) => {
                $a = $b.wrapping_add(
                    ($a.wrapping_add($f).wrapping_add(words[$k]).wrapping_add($i))
                        .rotate_left($s),
                );
            };
        }

        // Round 1
        step!((b & c) | (!b & d), a, b, c, d, 0, 7, 0xd76aa478);
        step!((a & b) | (!a & c), d, a, b, c, 1, 12, 0xe8c7b756);
        step!((d & a) | (!d & b), c, d, a, b, 2, 17, 0x242070db);
        step!((c & d) | (!c & a), b, c, d, a, 3, 22, 0xc1bdceee);
        step!((b & c) | (!b & d), a, b, c, d, 4, 7, 0xf57c0faf);
        step!((a & b) | (!a & c), d, a, b, c, 5, 12, 0x4787c62a);
        step!((d & a) | (!d & b), c, d, a, b, 6, 17, 0xa8304613);
        step!((c & d) | (!c & a), b, c, d, a, 7, 22, 0xfd469501);
        step!((b & c) | (!b & d), a, b, c, d, 8, 7, 0x698098d8);
        step!((a & b) | (!a & c), d, a, b, c, 9, 12, 0x8b44f7af);
        step!((d & a) | (!d & b), c, d, a, b, 10, 17, 0xffff5bb1);
        step!((c & d) | (!c & a), b, c, d, a, 11, 22, 0x895cd7be);
        step!((b & c) | (!b & d), a, b, c, d, 12, 7, 0x6b901122);
        step!((a & b) | (!a & c), d, a, b, c, 13, 12, 0xfd987193);
        step!((d & a) | (!d & b), c, d, a, b, 14, 17, 0xa679438e);
        step!((c & d) | (!c & a), b, c, d, a, 15, 22, 0x49b40821);

        // Round 2
        step!((b & d) | (c & !d), a, b, c, d, 1, 5, 0xf61e2562);
        step!((a & c) | (b & !c), d, a, b, c, 6, 9, 0xc040b340);
        step!((d & b) | (a & !b), c, d, a, b, 11, 14, 0x265e5a51);
        step!((c & a) | (d & !a), b, c, d, a, 0, 20, 0xe9b6c7aa);
        step!((b & d) | (c & !d), a, b, c, d, 5, 5, 0xd62f105d);
        step!((a & c) | (b & !c), d, a, b, c, 10, 9, 0x02441453);
        step!((d & b) | (a & !b), c, d, a, b, 15, 14, 0xd8a1e681);
        step!((c & a) | (d & !a), b, c, d, a, 4, 20, 0xe7d3fbc8);
        step!((b & d) | (c & !d), a, b, c, d, 9, 5, 0x21e1cde6);
        step!((a & c) | (b & !c), d, a, b, c, 14, 9, 0xc33707d6);
        step!((d & b) | (a & !b), c, d, a, b, 3, 14, 0xf4d50d87);
        step!((c & a) | (d & !a), b, c, d, a, 8, 20, 0x455a14ed);
        step!((b & d) | (c & !d), a, b, c, d, 13, 5, 0xa9e3e905);
        step!((a & c) | (b & !c), d, a, b, c, 2, 9, 0xfcefa3f8);
        step!((d & b) | (a & !b), c, d, a, b, 7, 14, 0x676f02d9);
        step!((c & a) | (d & !a), b, c, d, a, 12, 20, 0x8d2a4c8a);

        // Round 3
        step!(b ^ c ^ d, a, b, c, d, 5, 4, 0xfffa3942);
        step!(a ^ b ^ c, d, a, b, c, 8, 11, 0x8771f681);
        step!(d ^ a ^ b, c, d, a, b, 11, 16, 0x6d9d6122);
        step!(c ^ d ^ a, b, c, d, a, 14, 23, 0xfde5380c);
        step!(b ^ c ^ d, a, b, c, d, 1, 4, 0xa4beea44);
        step!(a ^ b ^ c, d, a, b, c, 4, 11, 0x4bdecfa9);
        step!(d ^ a ^ b, c, d, a, b, 7, 16, 0xf6bb4b60);
        step!(c ^ d ^ a, b, c, d, a, 10, 23, 0xbebfbc70);
        step!(b ^ c ^ d, a, b, c, d, 13, 4, 0x289b7ec6);
        step!(a ^ b ^ c, d, a, b, c, 0, 11, 0xeaa127fa);
        step!(d ^ a ^ b, c, d, a, b, 3, 16, 0xd4ef3085);
        step!(c ^ d ^ a, b, c, d, a, 6, 23, 0x04881d05);
        step!(b ^ c ^ d, a, b, c, d, 9, 4, 0xd9d4d039);
        step!(a ^ b ^ c, d, a, b, c, 12, 11, 0xe6db99e5);
        step!(d ^ a ^ b, c, d, a, b, 15, 16, 0x1fa27cf8);
        step!(c ^ d ^ a, b, c, d, a, 2, 23, 0xc4ac5665);

        // Round 4
        step!(c ^ (b | !d), a, b, c, d, 0, 6, 0xf4292244);
        step!(b ^ (a | !c), d, a, b, c, 7, 10, 0x432aff97);
        step!(a ^ (d | !b), c, d, a, b, 14, 15, 0xab9423a7);
        step!(d ^ (c | !a), b, c, d, a, 5, 21, 0xfc93a039);
        step!(c ^ (b | !d), a, b, c, d, 12, 6, 0x655b59c3);
        step!(b ^ (a | !c), d, a, b, c, 3, 10, 0x8f0ccc92);
        step!(a ^ (d | !b), c, d, a, b, 10, 15, 0xffeff47d);
        step!(d ^ (c | !a), b, c, d, a, 1, 21, 0x85845dd1);
        step!(c ^ (b | !d), a, b, c, d, 8, 6, 0x6fa87e4f);
        step!(b ^ (a | !c), d, a, b, c, 15, 10, 0xfe2ce6e0);
        step!(a ^ (d | !b), c, d, a, b, 6, 15, 0xa3014314);
        step!(d ^ (c | !a), b, c, d, a, 13, 21, 0x4e0811a1);
        step!(c ^ (b | !d), a, b, c, d, 4, 6, 0xf7537e82);
        step!(b ^ (a | !c), d, a, b, c, 11, 10, 0xbd3af235);
        step!(a ^ (d | !b), c, d, a, b, 2, 15, 0x2ad7d2bb);
        step!(d ^ (c | !a), b, c, d, a, 9, 21, 0xeb86d391);

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
    }

    let mut out = [0u8; 16];
    for (i, word) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_le_bytes());
    }
    hex::encode(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_md5() {
        assert_eq!(compute_md5(b""), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(
            compute_md5(b"The quick brown fox jumps over the lazy dog"),
            "9e107d9d372bb6826bd81d3542a419d6"
        );
    }
}
