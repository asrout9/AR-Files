use chrono::Local;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;

use cirrus_core::error::{CirrusError, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrashedItem {
    pub id: String,
    pub original_path: PathBuf,
    pub deletion_date: String,
    pub trash_file_path: PathBuf,
    pub trash_info_path: PathBuf,
}

pub struct TrashManager {
    trash_dir: PathBuf,
}

impl TrashManager {
    pub fn new() -> Result<Self> {
        let xdg_data_home = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                let home = std::env::var_os("HOME").unwrap_or_default();
                PathBuf::from(home).join(".local").join("share")
            });

        let trash_dir = xdg_data_home.join("Trash");
        Self::with_trash_dir(trash_dir)
    }

    pub fn with_trash_dir<P: AsRef<Path>>(dir: P) -> Result<Self> {
        let trash_dir = dir.as_ref().to_path_buf();
        let files_dir = trash_dir.join("files");
        let info_dir = trash_dir.join("info");

        fs::create_dir_all(&files_dir).map_err(|e| {
            CirrusError::Storage(format!("Failed to create trash files dir: {}", e))
        })?;
        fs::create_dir_all(&info_dir)
            .map_err(|e| CirrusError::Storage(format!("Failed to create trash info dir: {}", e)))?;

        Ok(Self { trash_dir })
    }

    /// Moves a file or folder into the Freedesktop Trash, writing the corresponding .trashinfo file.
    pub fn move_to_trash<P: AsRef<Path>>(&self, path: P) -> Result<TrashedItem> {
        let path = path.as_ref();
        if !path.exists() {
            return Err(CirrusError::NotFound {
                entity: "File".to_string(),
                id: path.display().to_string(),
            });
        }

        let abs_path = path
            .canonicalize()
            .map_err(|e| CirrusError::Io(format!("Canonicalize failed: {}", e)))?;

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| CirrusError::Validation("Invalid file name".to_string()))?;

        let timestamp = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();

        let files_dir = self.trash_dir.join("files");
        let info_dir = self.trash_dir.join("info");

        // First try native FreeDesktop gio trash (handles external mounts and multi-drive partitions)
        let gio_status = std::process::Command::new("gio")
            .arg("trash")
            .arg(&abs_path)
            .status();
        if let Ok(status) = gio_status {
            if status.success() {
                info!("Successfully trashed '{}' via gio trash", abs_path.display());
                return Ok(TrashedItem {
                    id: file_name.to_string(),
                    original_path: abs_path,
                    deletion_date: timestamp,
                    trash_file_path: files_dir.join(file_name),
                    trash_info_path: info_dir.join(format!("{}.trashinfo", file_name)),
                });
            }
        }

        // Determine non-colliding trash file name
        let mut dest_name = file_name.to_string();
        let mut counter = 1;
        while files_dir.join(&dest_name).exists()
            || info_dir.join(format!("{}.trashinfo", dest_name)).exists()
        {
            dest_name = format!("{}.{}", file_name, counter);
            counter += 1;
        }

        let trash_file_path = files_dir.join(&dest_name);
        let trash_info_path = info_dir.join(format!("{}.trashinfo", dest_name));

        // Format according to Freedesktop Trash Specification v1.0
        let trashinfo_content = format!(
            "[Trash Info]\nPath={}\nDeletionDate={}\n",
            abs_path.display(),
            timestamp
        );

        fs::write(&trash_info_path, trashinfo_content)
            .map_err(|e| CirrusError::Io(format!("Failed to write .trashinfo: {}", e)))?;

        // Move the file into files/
        if let Err(err) = fs::rename(&abs_path, &trash_file_path) {
            if abs_path.is_file() {
                fs::copy(&abs_path, &trash_file_path)
                    .map_err(|e| CirrusError::Io(format!("Failed to copy file to trash: {}", e)))?;
                let _ = fs::remove_file(&abs_path);
            } else {
                let _ = fs::remove_file(&trash_info_path);
                return Err(CirrusError::Io(format!("Failed to move file to trash: {}", err)));
            }
        }

        info!(
            "Trashed '{}' -> {}",
            abs_path.display(),
            trash_file_path.display()
        );

        Ok(TrashedItem {
            id: dest_name,
            original_path: abs_path,
            deletion_date: timestamp,
            trash_file_path,
            trash_info_path,
        })
    }

    /// Lists all items currently in the trash.
    pub fn list_trash(&self) -> Result<Vec<TrashedItem>> {
        let info_dir = self.trash_dir.join("info");
        let files_dir = self.trash_dir.join("files");
        let mut items = Vec::new();

        if !info_dir.exists() {
            return Ok(items);
        }

        for entry in fs::read_dir(&info_dir).map_err(|e| CirrusError::Io(e.to_string()))? {
            let entry = entry.map_err(|e| CirrusError::Io(e.to_string()))?;
            let info_path = entry.path();
            if info_path.extension().and_then(|s| s.to_str()) == Some("trashinfo") {
                let stem = info_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default();
                let file_path = files_dir.join(stem);

                if let Ok(content) = fs::read_to_string(&info_path) {
                    let mut orig_path = PathBuf::new();
                    let mut date = String::new();

                    for line in content.lines() {
                        if let Some(rest) = line.strip_prefix("Path=") {
                            orig_path = PathBuf::from(rest);
                        } else if let Some(rest) = line.strip_prefix("DeletionDate=") {
                            date = rest.to_string();
                        }
                    }

                    if !orig_path.as_os_str().is_empty() {
                        items.push(TrashedItem {
                            id: stem.to_string(),
                            original_path: orig_path,
                            deletion_date: date,
                            trash_file_path: file_path,
                            trash_info_path: info_path,
                        });
                    }
                }
            }
        }

        Ok(items)
    }

    /// Restores a trashed item back to its original location.
    pub fn restore_item(&self, item_id: &str) -> Result<PathBuf> {
        let info_path = self
            .trash_dir
            .join("info")
            .join(format!("{}.trashinfo", item_id));
        let file_path = self.trash_dir.join("files").join(item_id);

        if !info_path.exists() || !file_path.exists() {
            return Err(CirrusError::NotFound {
                entity: "TrashedItem".to_string(),
                id: item_id.to_string(),
            });
        }

        let content = fs::read_to_string(&info_path)
            .map_err(|e| CirrusError::Io(format!("Failed to read .trashinfo: {}", e)))?;

        let mut original_path = None;
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix("Path=") {
                original_path = Some(PathBuf::from(rest));
                break;
            }
        }

        let dest = original_path.ok_or_else(|| {
            CirrusError::Validation("Invalid .trashinfo: missing Path field".to_string())
        })?;

        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| CirrusError::Io(format!("Failed to create restore parent: {}", e)))?;
        }

        fs::rename(&file_path, &dest)
            .map_err(|e| CirrusError::Io(format!("Failed to restore file from trash: {}", e)))?;
        let _ = fs::remove_file(&info_path);

        info!("Restored '{}' -> {}", item_id, dest.display());
        Ok(dest)
    }

    /// Empties the entire trash bin.
    pub fn empty_trash(&self) -> Result<()> {
        let files_dir = self.trash_dir.join("files");
        let info_dir = self.trash_dir.join("info");

        if files_dir.exists() {
            fs::remove_dir_all(&files_dir)
                .map_err(|e| CirrusError::Io(format!("Failed to clear trash files: {}", e)))?;
            fs::create_dir_all(&files_dir).map_err(|e| CirrusError::Io(e.to_string()))?;
        }

        if info_dir.exists() {
            fs::remove_dir_all(&info_dir)
                .map_err(|e| CirrusError::Io(format!("Failed to clear trash info: {}", e)))?;
            fs::create_dir_all(&info_dir).map_err(|e| CirrusError::Io(e.to_string()))?;
        }

        info!("Emptied trash");
        Ok(())
    }
}
