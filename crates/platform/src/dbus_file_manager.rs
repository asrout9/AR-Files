use tokio::sync::mpsc::Sender;
use tracing::info;
use zbus::interface;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileManagerRequest {
    ShowFolders {
        uris: Vec<String>,
        startup_id: String,
    },
    ShowItems {
        uris: Vec<String>,
        startup_id: String,
    },
    ShowItemProperties {
        uris: Vec<String>,
        startup_id: String,
    },
}

pub struct FileManager1Service {
    sender: Sender<FileManagerRequest>,
}

impl FileManager1Service {
    pub fn new(sender: Sender<FileManagerRequest>) -> Self {
        Self { sender }
    }
}

#[interface(name = "org.freedesktop.FileManager1")]
impl FileManager1Service {
    pub async fn show_folders(
        &self,
        uris: Vec<String>,
        startup_id: String,
    ) -> zbus::fdo::Result<()> {
        info!(
            "D-Bus FileManager1::ShowFolders called with {} uris (startup_id: {})",
            uris.len(),
            startup_id
        );
        let _ = self
            .sender
            .send(FileManagerRequest::ShowFolders { uris, startup_id })
            .await;
        Ok(())
    }

    pub async fn show_items(&self, uris: Vec<String>, startup_id: String) -> zbus::fdo::Result<()> {
        info!(
            "D-Bus FileManager1::ShowItems called with {} uris (startup_id: {})",
            uris.len(),
            startup_id
        );
        let _ = self
            .sender
            .send(FileManagerRequest::ShowItems { uris, startup_id })
            .await;
        Ok(())
    }

    pub async fn show_item_properties(
        &self,
        uris: Vec<String>,
        startup_id: String,
    ) -> zbus::fdo::Result<()> {
        info!(
            "D-Bus FileManager1::ShowItemProperties called with {} uris (startup_id: {})",
            uris.len(),
            startup_id
        );
        let _ = self
            .sender
            .send(FileManagerRequest::ShowItemProperties { uris, startup_id })
            .await;
        Ok(())
    }
}

/// Registers the org.freedesktop.FileManager1 service on the user session D-Bus.
pub async fn register_file_manager_service(
    sender: Sender<FileManagerRequest>,
) -> zbus::Result<zbus::connection::Connection> {
    let service = FileManager1Service::new(sender);
    let conn = zbus::connection::Builder::session()?
        .name("org.freedesktop.FileManager1")?
        .serve_at("/org/freedesktop/FileManager1", service)?
        .build()
        .await?;
    Ok(conn)
}
