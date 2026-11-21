use chrono::Utc;
use std::path::Path;

use cirrus_core::entry::EntryRecord;
use cirrus_core::state::FileState;

pub struct ConflictDetector;

impl ConflictDetector {
    /// Checks if a remote delta change conflicts with a local pending or modified entry.
    pub fn is_conflict(local: &EntryRecord, remote: &EntryRecord) -> bool {
        // If local has edits pending or uploading
        if local.state == FileState::SyncingUp {
            // If remote has a different etag or newer mtime
            if let (Some(l_etag), Some(r_etag)) = (&local.etag, &remote.etag) {
                if l_etag != r_etag {
                    return true;
                }
            } else if remote.mtime > local.mtime {
                return true;
            }
        }
        false
    }

    /// Generates the standard conflict filename: `name (conflict from <device> <date>).ext`.
    pub fn generate_conflict_name(original_name: &str, device_name: &str) -> String {
        let now = Utc::now().format("%Y-%m-%d %H-%M-%S").to_string();
        let path = Path::new(original_name);
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(original_name);
        let ext = path.extension().and_then(|e| e.to_str());

        match ext {
            Some(e) => format!("{} (conflict from {} {}).{}", stem, device_name, now, e),
            None => format!("{} (conflict from {} {})", stem, device_name, now),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conflict_naming() {
        let name = "financial_plan.xlsx";
        let conflict_name = ConflictDetector::generate_conflict_name(name, "Fedora-Laptop");
        assert!(conflict_name.starts_with("financial_plan (conflict from Fedora-Laptop 202"));
        assert!(conflict_name.ends_with(".xlsx"));
    }
}
