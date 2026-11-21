pub mod dbus_file_manager;
pub mod desktop_entry;
pub mod theme;
pub mod thumbnail;
pub mod trash;
pub mod watcher;

pub use dbus_file_manager::{
    register_file_manager_service, FileManager1Service, FileManagerRequest,
};
pub use desktop_entry::{DesktopEntry, DesktopEntryManager};
pub use theme::{ColorScheme, GnomeAppearance, ThemeManager};
pub use thumbnail::{ThumbnailManager, ThumbnailSize};
pub use trash::{TrashManager, TrashedItem};
pub use watcher::LocalFsWatcher;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use tempfile::tempdir;

    #[test]
    fn test_freedesktop_trash_lifecycle() {
        let temp = tempdir().unwrap();
        let trash_dir = temp.path().join("Trash");
        let work_dir = temp.path().join("work");
        fs::create_dir_all(&work_dir).unwrap();

        let trash_mgr = TrashManager::with_trash_dir(&trash_dir).unwrap();

        // Create a test file
        let file_path = work_dir.join("report.docx");
        fs::write(&file_path, "sample document content").unwrap();

        // Trash the file
        let trashed = trash_mgr.move_to_trash(&file_path).unwrap();
        assert!(!file_path.exists());
        assert!(trashed.trash_file_path.exists());
        assert!(trashed.trash_info_path.exists());

        // Verify .trashinfo content complies with freedesktop spec
        let info_content = fs::read_to_string(&trashed.trash_info_path).unwrap();
        assert!(info_content.contains("[Trash Info]"));
        assert!(info_content.contains("Path="));
        assert!(info_content.contains("DeletionDate="));

        // List trash
        let items = trash_mgr.list_trash().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, trashed.id);

        // Restore file
        let restored_path = trash_mgr.restore_item(&trashed.id).unwrap();
        assert!(restored_path.exists());
        assert_eq!(restored_path, file_path);
        assert!(!trashed.trash_file_path.exists());
        assert!(!trashed.trash_info_path.exists());
    }

    #[test]
    fn test_desktop_entry_exec_token_replacement() {
        let files = [
            Path::new("/home/user/doc1.txt"),
            Path::new("/home/user/doc2.txt"),
        ];

        // Single file code %f
        let tokens_f = DesktopEntryManager::format_exec_tokens("gedit --new-window %f", &files);
        assert_eq!(
            tokens_f,
            vec!["gedit", "--new-window", "/home/user/doc1.txt"]
        );

        // Multi file code %F
        let tokens_big_f = DesktopEntryManager::format_exec_tokens("gedit %F", &files);
        assert_eq!(
            tokens_big_f,
            vec!["gedit", "/home/user/doc1.txt", "/home/user/doc2.txt"]
        );

        // URL code %u
        let tokens_u = DesktopEntryManager::format_exec_tokens("firefox %u", &files);
        assert_eq!(tokens_u, vec!["firefox", "file:///home/user/doc1.txt"]);
    }

    #[tokio::test]
    async fn test_dbus_file_manager_requests() {
        let (tx, mut rx) = tokio::sync::mpsc::channel(10);
        let service = FileManager1Service::new(tx);

        service
            .show_items(
                vec!["file:///home/user/test.txt".to_string()],
                "test-id".to_string(),
            )
            .await
            .expect("show_items failed");

        let received = rx.recv().await.expect("No request received");
        match received {
            FileManagerRequest::ShowItems { uris, startup_id } => {
                assert_eq!(uris, vec!["file:///home/user/test.txt"]);
                assert_eq!(startup_id, "test-id");
            }
            _ => panic!("Unexpected request variant"),
        }
    }
}
