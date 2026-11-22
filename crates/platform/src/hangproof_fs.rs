use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{error, warn};

use cirrus_core::entry::EntryRecord;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::state::FileState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFileMetadata {
    pub path: PathBuf,
    pub name: String,
    pub is_directory: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub allocated_bytes: u64,
    pub mtime: i64,
    pub ctime: i64,
    pub ino: u64,
    pub mode: u32,
    pub octal_permissions: String,
    pub mime_type: String,
    pub is_hidden: bool,
}

impl LocalFileMetadata {
    pub fn from_std_metadata(path: &Path, meta: &std::fs::Metadata) -> Self {
        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string());

        let is_dir = meta.is_dir();
        let is_symlink = meta.file_type().is_symlink();
        let is_hidden = name.starts_with('.');

        let mode = meta.mode();
        let octal_permissions = format!("{:04o}", mode & 0o7777);
        let allocated_bytes = meta.blocks() * 512;

        let mime = if is_dir {
            "inode/directory".to_string()
        } else {
            Self::detect_mime_type(path)
        };

        Self {
            path: path.to_path_buf(),
            name,
            is_directory: is_dir,
            is_symlink,
            size: meta.len(),
            allocated_bytes,
            mtime: meta.mtime(),
            ctime: meta.ctime(),
            ino: meta.ino(),
            mode,
            octal_permissions,
            mime_type: mime,
            is_hidden,
        }
    }

    pub fn to_entry_record(
        &self,
        account_id: &str,
        parent_id: Option<String>,
        _entry_id_prefix: &str,
    ) -> EntryRecord {
        let entry_id = self.path.to_string_lossy().to_string();
        let state = if self.allocated_bytes == 0 && self.size > 0 {
            FileState::CloudOnly // Sparse placeholder
        } else {
            FileState::Available
        };

        EntryRecord {
            id: entry_id,
            account_id: account_id.to_string(),
            remote_id: None,
            parent_id,
            name: self.name.clone(),
            path: self.path.to_string_lossy().to_string(),
            is_directory: self.is_directory,
            size: self.size,
            mtime: self.mtime,
            ctime: Some(self.ctime),
            mime_type: self.mime_type.clone(),
            etag: None,
            content_hash: None,
            state,
            local_path: Some(self.path.to_string_lossy().to_string()),
            error_message: None,
            sync_version: 1,
            last_accessed_at: Some(self.mtime),
            created_at: self.ctime,
            updated_at: self.mtime,
            thumbnail_url: if self.is_directory {
                None
            } else {
                crate::thumbnail::ThumbnailManager::new()
                    .get_cached_thumbnail(&self.path, crate::thumbnail::ThumbnailSize::Normal)
                    .map(|p| format!("file://{}", p.to_string_lossy()))
                    .or_else(|| {
                        let ext = self.path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                        if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "svg" | "bmp" | "ico" | "avif") {
                            Some(format!("file://{}", self.path.to_string_lossy()))
                        } else {
                            None
                        }
                    })
            },
        }
    }

    fn detect_mime_type(path: &Path) -> String {
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        match ext.as_str() {
            "txt" => "text/plain".to_string(),
            "md" | "markdown" => "text/markdown".to_string(),
            "pdf" => "application/pdf".to_string(),
            "html" | "htm" => "text/html".to_string(),
            "json" => "application/json".to_string(),
            "xml" => "application/xml".to_string(),
            "png" => "image/png".to_string(),
            "jpg" | "jpeg" => "image/jpeg".to_string(),
            "svg" => "image/svg+xml".to_string(),
            "webp" => "image/webp".to_string(),
            "gif" => "image/gif".to_string(),
            "mp4" => "video/mp4".to_string(),
            "mkv" => "video/x-matroska".to_string(),
            "webm" => "video/webm".to_string(),
            "mp3" => "audio/mpeg".to_string(),
            "flac" => "audio/flac".to_string(),
            "ogg" => "audio/ogg".to_string(),
            "zip" => "application/zip".to_string(),
            "tar" => "application/x-tar".to_string(),
            "gz" => "application/gzip".to_string(),
            "xz" => "application/x-xz".to_string(),
            "parquet" => "application/vnd.apache.parquet".to_string(),
            "rs" => "text/x-rust".to_string(),
            "ts" | "tsx" => "text/typescript".to_string(),
            "js" | "jsx" => "text/javascript".to_string(),
            "sh" => "application/x-sh".to_string(),
            _ => "application/octet-stream".to_string(),
        }
    }
}

/// Provides resilient, hang-proof local filesystem inspection with bounded deadlines,
/// timeouts on stat and readdir, and an unresponsive mount circuit breaker.
#[derive(Clone)]
pub struct HangProofFs {
    timeout: Duration,
    circuit_breaker_ttl: Duration,
    unresponsive_mounts: Arc<RwLock<HashMap<PathBuf, Instant>>>,
}

impl Default for HangProofFs {
    fn default() -> Self {
        Self::new(Duration::from_millis(1500), Duration::from_secs(30))
    }
}

impl HangProofFs {
    pub fn new(timeout: Duration, circuit_breaker_ttl: Duration) -> Self {
        Self {
            timeout,
            circuit_breaker_ttl,
            unresponsive_mounts: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Checks if a path or any of its ancestor mounts is currently tripped by the circuit breaker.
    pub fn is_unresponsive<P: AsRef<Path>>(&self, path: P) -> bool {
        let p = path.as_ref();
        let guard = self.unresponsive_mounts.read();

        // Check if path or any ancestor is currently marked unresponsive and within TTL
        for (mount, tripped_at) in guard.iter() {
            if (p == mount || p.starts_with(mount))
                && tripped_at.elapsed() < self.circuit_breaker_ttl
            {
                return true;
            }
        }
        false
    }

    /// Marks a mount point or directory path as unresponsive.
    pub fn mark_unresponsive<P: AsRef<Path>>(&self, path: P) {
        let mut guard = self.unresponsive_mounts.write();
        let p = path.as_ref().to_path_buf();
        warn!(
            "Tripping circuit breaker: marking mount '{}' as unresponsive for {:?}",
            p.display(),
            self.circuit_breaker_ttl
        );
        guard.insert(p, Instant::now());
    }

    /// Clears unresponsive flag for a path.
    pub fn clear_unresponsive<P: AsRef<Path>>(&self, path: P) {
        let mut guard = self.unresponsive_mounts.write();
        guard.remove(path.as_ref());
    }

    /// Inspects metadata for a file or directory with a strict deadline.
    pub async fn stat_hangproof<P: AsRef<Path>>(&self, path: P) -> Result<LocalFileMetadata> {
        let p = path.as_ref().to_path_buf();

        if self.is_unresponsive(&p) {
            return Err(CirrusError::UnresponsiveMount {
                path: p.to_string_lossy().to_string(),
            });
        }

        let p_clone = p.clone();
        let stat_task = tokio::task::spawn_blocking(move || {
            std::fs::symlink_metadata(&p_clone)
                .map(|meta| LocalFileMetadata::from_std_metadata(&p_clone, &meta))
                .map_err(|e| {
                    CirrusError::Io(format!("Stat error on '{}': {}", p_clone.display(), e))
                })
        });

        match tokio::time::timeout(self.timeout, stat_task).await {
            Ok(join_res) => match join_res {
                Ok(stat_res) => stat_res,
                Err(join_err) => Err(CirrusError::Io(format!("Task spawn error: {}", join_err))),
            },
            Err(_) => {
                self.mark_unresponsive(&p);
                error!(
                    "stat on '{}' timed out after {:?}. Marked mount as unresponsive.",
                    p.display(),
                    self.timeout
                );
                Err(CirrusError::UnresponsiveMount {
                    path: p.to_string_lossy().to_string(),
                })
            }
        }
    }

    /// Lists directory entries with a strict timeout on both directory read and per-file stats.
    pub async fn read_dir_hangproof<P: AsRef<Path>>(
        &self,
        dir: P,
    ) -> Result<Vec<LocalFileMetadata>> {
        let d = dir.as_ref().to_path_buf();

        if self.is_unresponsive(&d) {
            return Err(CirrusError::UnresponsiveMount {
                path: d.to_string_lossy().to_string(),
            });
        }

        let d_clone = d.clone();
        let readdir_task = tokio::task::spawn_blocking(move || {
            let entries = std::fs::read_dir(&d_clone).map_err(|e| {
                CirrusError::Io(format!("readdir failed on '{}': {}", d_clone.display(), e))
            })?;

            let mut results = Vec::new();
            for item in entries.flatten() {
                let path = item.path();
                if let Ok(meta) = item.metadata() {
                    results.push(LocalFileMetadata::from_std_metadata(&path, &meta));
                }
            }
            Ok(results)
        });

        match tokio::time::timeout(self.timeout, readdir_task).await {
            Ok(join_res) => match join_res {
                Ok(list_res) => list_res,
                Err(join_err) => Err(CirrusError::Io(format!("Task spawn error: {}", join_err))),
            },
            Err(_) => {
                self.mark_unresponsive(&d);
                error!(
                    "readdir on '{}' timed out after {:?}. Marked mount as unresponsive.",
                    d.display(),
                    self.timeout
                );
                Err(CirrusError::UnresponsiveMount {
                    path: d.to_string_lossy().to_string(),
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_hangproof_fs_stat_and_readdir() {
        let temp = tempdir().unwrap();
        let temp_path = temp.path();

        // Create a test file and test directory
        let file_path = temp_path.join("readme.md");
        std::fs::write(&file_path, "# Hangproof Readme").unwrap();

        let sub_dir = temp_path.join("sub_folder");
        std::fs::create_dir(&sub_dir).unwrap();

        let fs = HangProofFs::default();

        // Stat file
        let meta = fs.stat_hangproof(&file_path).await.unwrap();
        assert_eq!(meta.name, "readme.md");
        assert!(!meta.is_directory);
        assert_eq!(meta.mime_type, "text/markdown");
        assert_eq!(meta.size, 18);
        assert!(meta.allocated_bytes > 0);

        // Readdir
        let list = fs.read_dir_hangproof(temp_path).await.unwrap();
        assert_eq!(list.len(), 2);
        assert!(list.iter().any(|e| e.name == "readme.md"));
        assert!(list
            .iter()
            .any(|e| e.name == "sub_folder" && e.is_directory));
    }

    #[tokio::test]
    async fn test_circuit_breaker_on_unresponsive_mount() {
        let fs = HangProofFs::new(Duration::from_millis(50), Duration::from_secs(2));

        let dead_mount = PathBuf::from("/mnt/dead_nfs_share/project");
        fs.mark_unresponsive(&dead_mount);

        assert!(fs.is_unresponsive(&dead_mount));
        assert!(fs.is_unresponsive(dead_mount.join("sub/path/file.txt")));

        // Stat should fail immediately with UnresponsiveMount without hanging
        let start = Instant::now();
        let res = fs.stat_hangproof(&dead_mount).await;
        let elapsed = start.elapsed();

        assert!(elapsed < Duration::from_millis(20));
        assert!(matches!(res, Err(CirrusError::UnresponsiveMount { .. })));
    }
}
