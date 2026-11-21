use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tracing::info;

use fuser::{BackgroundSession, Config, MountOption};

use cirrus_core::error::{CirrusError, Result};
use cirrus_db::EntryRepository;

use crate::fuse_fs::{CirrusFuseFs, HydrationCallback};
use crate::inode::InodeManager;

pub struct ActiveMount {
    pub account_id: String,
    pub mount_path: PathBuf,
    session: Option<BackgroundSession>,
}

impl Drop for ActiveMount {
    fn drop(&mut self) {
        if let Some(session) = self.session.take() {
            info!("Dropping FUSE session for mount '{:?}'", self.mount_path);
            drop(session);
        }
        let _ = Command::new("fusermount3")
            .args(["-u", "-z", &self.mount_path.to_string_lossy()])
            .output();
    }
}

pub struct MountManager {
    mounts: Arc<RwLock<HashMap<String, ActiveMount>>>,
    base_mount_dir: PathBuf,
}

impl MountManager {
    pub fn new<P: AsRef<Path>>(base_mount_dir: P) -> Self {
        let base = base_mount_dir.as_ref().to_path_buf();
        let _ = std::fs::create_dir_all(&base);
        Self {
            mounts: Arc::new(RwLock::new(HashMap::new())),
            base_mount_dir: base,
        }
    }

    pub fn default_mount_dir() -> PathBuf {
        if let Some(home) = std::env::var_os("HOME") {
            PathBuf::from(home).join("CloudDrives")
        } else {
            PathBuf::from("/tmp/ar-files-mounts")
        }
    }

    /// Recovers from previous unclean exits or daemon crashes by unmounting stale mounts.
    pub fn cleanup_stale_mount(&self, mount_path: &Path) {
        if !mount_path.exists() {
            return;
        }

        // Test if the directory is an unresponsive or dead FUSE mount
        let path_str = mount_path.to_string_lossy();
        let is_stale = match std::fs::metadata(mount_path) {
            Err(e) if e.raw_os_error() == Some(libc::ENOTCONN) => true,
            _ => {
                // Also check /proc/mounts
                if let Ok(mounts_info) = std::fs::read_to_string("/proc/mounts") {
                    mounts_info.lines().any(|l| l.contains(&*path_str))
                } else {
                    false
                }
            }
        };

        if is_stale {
            info!(
                "Crash recovery: detaching stale FUSE mount at '{}'",
                path_str
            );
            let _ = Command::new("fusermount3")
                .args(["-u", "-z", &path_str])
                .output();
            std::thread::sleep(std::time::Duration::from_millis(150));
        }
    }

    /// Mounts an account tree to a local directory so all desktop apps can access placeholders.
    pub fn mount_account(
        &self,
        account_id: &str,
        account_name: &str,
        entries_repo: EntryRepository,
        cache_dir: PathBuf,
        hydration_cb: Option<HydrationCallback>,
    ) -> Result<PathBuf> {
        let sanitized_name =
            account_name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
        let target_path = self.base_mount_dir.join(&sanitized_name);

        // Crash recovery: unmount any dead mount lingering at this path
        self.cleanup_stale_mount(&target_path);

        if !target_path.exists() {
            std::fs::create_dir_all(&target_path).map_err(|e| {
                CirrusError::Io(format!(
                    "Failed to create mount directory {:?}: {}",
                    target_path, e
                ))
            })?;
        }

        info!(
            "Mounting account '{}' via FUSE at '{:?}'",
            account_name, target_path
        );

        let inode_mgr = Arc::new(InodeManager::new());
        let fs = CirrusFuseFs::new(account_id, cache_dir, entries_repo, inode_mgr, hydration_cb);

        let mut config = Config::default();
        config.mount_options = vec![
            MountOption::FSName(format!("ar-files-{}", account_id)),
            MountOption::AutoUnmount,
            MountOption::RW,
        ];

        let session = fuser::spawn_mount(fs, &target_path, &config).map_err(|e| {
            CirrusError::Io(format!(
                "FUSE spawn_mount failed on {:?}: {}",
                target_path, e
            ))
        })?;

        let active = ActiveMount {
            account_id: account_id.to_string(),
            mount_path: target_path.clone(),
            session: Some(session),
        };

        self.mounts.write().insert(account_id.to_string(), active);

        Ok(target_path)
    }

    /// Cleanly unmounts a specific account FUSE virtual filesystem.
    pub fn unmount_account(&self, account_id: &str) -> Result<()> {
        if let Some(mut active) = self.mounts.write().remove(account_id) {
            info!(
                "Unmounting FUSE virtual filesystem for account '{}'",
                account_id
            );
            if let Some(session) = active.session.take() {
                drop(session);
            }
            let _ = Command::new("fusermount3")
                .args(["-u", "-z", &active.mount_path.to_string_lossy()])
                .output();
        }
        Ok(())
    }

    /// Cleanly unmounts all active account mounts on application shutdown.
    pub fn unmount_all(&self) {
        let mut map = self.mounts.write();
        for (acc_id, mut active) in map.drain() {
            info!("Unmounting active FUSE mount for account '{}'", acc_id);
            if let Some(session) = active.session.take() {
                drop(session);
            }
            let _ = Command::new("fusermount3")
                .args(["-u", "-z", &active.mount_path.to_string_lossy()])
                .output();
        }
    }

    pub fn is_mounted(&self, account_id: &str) -> bool {
        self.mounts.read().contains_key(account_id)
    }

    pub fn get_mount_path(&self, account_id: &str) -> Option<PathBuf> {
        self.mounts
            .read()
            .get(account_id)
            .map(|m| m.mount_path.clone())
    }

    pub fn list_active_mounts(&self) -> Vec<(String, PathBuf)> {
        self.mounts
            .read()
            .iter()
            .map(|(k, v)| (k.clone(), v.mount_path.clone()))
            .collect()
    }
}

impl Drop for MountManager {
    fn drop(&mut self) {
        self.unmount_all();
    }
}
