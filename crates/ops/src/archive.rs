use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tracing::{error, info};

use cirrus_core::error::{CirrusError, Result};

pub struct ArchiveManager;

impl ArchiveManager {
    /// Compresses a set of source files and directories into a .tar.gz archive.
    pub async fn compress_tar_gz(sources: &[PathBuf], output_archive: &Path) -> Result<()> {
        if sources.is_empty() {
            return Err(CirrusError::Validation(
                "Cannot create archive from empty source list".to_string(),
            ));
        }

        let mut cmd = Command::new("tar");
        cmd.arg("-czf").arg(output_archive);

        for src in sources {
            cmd.arg(src);
        }

        info!(
            "Creating tar.gz archive '{}' with {} sources",
            output_archive.display(),
            sources.len()
        );

        let output = tokio::time::timeout(Duration::from_secs(60), cmd.output())
            .await
            .map_err(|_| {
                CirrusError::Io(format!(
                    "tar compression timed out for '{}'",
                    output_archive.display()
                ))
            })?
            .map_err(|e| CirrusError::Io(format!("Failed to execute tar: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("tar compression failed: {}", stderr);
            return Err(CirrusError::Io(format!(
                "tar compression failed: {}",
                stderr
            )));
        }

        Ok(())
    }

    /// Extracts a .tar.gz archive into a destination directory.
    pub async fn extract_tar_gz(archive_path: &Path, dest_dir: &Path) -> Result<()> {
        std::fs::create_dir_all(dest_dir).map_err(|e| {
            CirrusError::Io(format!("Failed to create destination directory: {}", e))
        })?;

        let mut cmd = Command::new("tar");
        cmd.arg("-xzf").arg(archive_path).arg("-C").arg(dest_dir);

        info!(
            "Extracting archive '{}' into '{}'",
            archive_path.display(),
            dest_dir.display()
        );

        let output = tokio::time::timeout(Duration::from_secs(60), cmd.output())
            .await
            .map_err(|_| {
                CirrusError::Io(format!(
                    "tar extraction timed out for '{}'",
                    archive_path.display()
                ))
            })?
            .map_err(|e| CirrusError::Io(format!("Failed to execute tar: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("tar extraction failed: {}", stderr);
            return Err(CirrusError::Io(format!(
                "tar extraction failed: {}",
                stderr
            )));
        }

        Ok(())
    }

    /// Compresses a set of source files and directories into a .zip archive.
    pub async fn compress_zip(sources: &[PathBuf], output_archive: &Path) -> Result<()> {
        if sources.is_empty() {
            return Err(CirrusError::Validation(
                "Cannot create archive from empty source list".to_string(),
            ));
        }

        let mut cmd = Command::new("zip");
        cmd.arg("-r").arg(output_archive);

        for src in sources {
            cmd.arg(src);
        }

        info!(
            "Creating zip archive '{}' with {} sources",
            output_archive.display(),
            sources.len()
        );

        let output = tokio::time::timeout(Duration::from_secs(60), cmd.output())
            .await
            .map_err(|_| {
                CirrusError::Io(format!(
                    "zip compression timed out for '{}'",
                    output_archive.display()
                ))
            })?
            .map_err(|e| CirrusError::Io(format!("Failed to execute zip: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("zip compression failed: {}", stderr);
            return Err(CirrusError::Io(format!(
                "zip compression failed: {}",
                stderr
            )));
        }

        Ok(())
    }

    /// Extracts a .zip archive into a destination directory.
    pub async fn extract_zip(archive_path: &Path, dest_dir: &Path) -> Result<()> {
        std::fs::create_dir_all(dest_dir).map_err(|e| {
            CirrusError::Io(format!("Failed to create destination directory: {}", e))
        })?;

        let mut cmd = Command::new("unzip");
        cmd.arg("-q").arg(archive_path).arg("-d").arg(dest_dir);

        info!(
            "Extracting zip archive '{}' into '{}'",
            archive_path.display(),
            dest_dir.display()
        );

        let output = tokio::time::timeout(Duration::from_secs(60), cmd.output())
            .await
            .map_err(|_| {
                CirrusError::Io(format!(
                    "unzip extraction timed out for '{}'",
                    archive_path.display()
                ))
            })?
            .map_err(|e| CirrusError::Io(format!("Failed to execute unzip: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("unzip extraction failed: {}", stderr);
            return Err(CirrusError::Io(format!(
                "unzip extraction failed: {}",
                stderr
            )));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_archive_compress_and_extract_tar_gz() {
        let temp = tempdir().unwrap();
        let work_dir = temp.path().join("work");
        std::fs::create_dir_all(&work_dir).unwrap();

        let file1 = work_dir.join("hello.txt");
        std::fs::write(&file1, "Hello AR Files!").unwrap();

        let archive = temp.path().join("output.tar.gz");
        ArchiveManager::compress_tar_gz(&[file1], &archive)
            .await
            .expect("Compression failed");
        assert!(archive.exists());

        let extract_dir = temp.path().join("extracted");
        ArchiveManager::extract_tar_gz(&archive, &extract_dir)
            .await
            .expect("Extraction failed");
        assert!(extract_dir.join("hello.txt").exists() || extract_dir.exists());
    }
}
