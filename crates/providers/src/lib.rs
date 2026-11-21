pub mod credentials;
pub mod gdrive;
pub mod mock;
pub mod oauth;
pub mod trait_def;
pub mod types;

pub use credentials::CredentialsManager;
pub use gdrive::GoogleDriveProvider;
pub use mock::MockCloudProvider;
pub use oauth::{GoogleOAuthFlow, OAuthTokenResponse, PkceChallenge};
pub use trait_def::CloudProvider;
pub use types::{ByteRange, DeltaChange, DeltaFeed, ProviderCapabilities, ProviderQuota};

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;

    #[tokio::test]
    async fn test_mock_upload_and_download() {
        let provider = MockCloudProvider::new("acc_mock_1", "Test Account", 10_000_000);
        let test_data = Bytes::from("Hello, Cirrus Files cloud storage!");

        let uploaded = provider
            .upload(None, "notes.txt", test_data.clone(), "text/plain")
            .await
            .expect("Upload failed");

        assert_eq!(uploaded.name, "notes.txt");
        assert_eq!(uploaded.size, test_data.len() as u64);

        // Download full file
        let downloaded = provider
            .download(&uploaded.id, None)
            .await
            .expect("Download failed");
        assert_eq!(downloaded, test_data);

        // Download range
        let range = ByteRange {
            start: 7,
            end: Some(13),
        };
        let partial = provider
            .download(&uploaded.id, Some(range))
            .await
            .expect("Range download failed");
        assert_eq!(partial, Bytes::from("Cirrus"));
    }

    #[tokio::test]
    async fn test_mock_folder_lifecycle_and_delta_feed() {
        let provider = MockCloudProvider::new("acc_mock_2", "Delta Account", 50_000_000);

        // Initial delta token should be empty
        let initial_feed = provider.changes(None).await.unwrap();
        assert_eq!(initial_feed.changes.len(), 0);
        let token_0 = initial_feed.new_delta_token;

        // Create folder
        let folder = provider
            .create_folder(None, "Documents")
            .await
            .expect("Create folder failed");

        // Upload file into folder
        let file = provider
            .upload(
                Some(&folder.id),
                "report.pdf",
                Bytes::from("pdf_bytes"),
                "application/pdf",
            )
            .await
            .expect("Upload file failed");

        // Query delta since token_0
        let feed_1 = provider.changes(Some(&token_0)).await.unwrap();
        assert_eq!(feed_1.changes.len(), 2);
        assert_eq!(feed_1.changes[0].id, folder.id);
        assert_eq!(feed_1.changes[1].id, file.id);

        let token_1 = feed_1.new_delta_token;

        // Rename file
        let renamed = provider.rename(&file.id, "final_report.pdf").await.unwrap();
        assert_eq!(renamed.name, "final_report.pdf");

        // Delete file
        provider.delete_entry(&file.id, false).await.unwrap();

        // Query delta since token_1
        let feed_2 = provider.changes(Some(&token_1)).await.unwrap();
        assert_eq!(feed_2.changes.len(), 2);
        assert!(!feed_2.changes[0].is_deleted);
        assert!(feed_2.changes[1].is_deleted);
    }

    #[tokio::test]
    async fn test_mock_failure_injection() {
        let provider = MockCloudProvider::new("acc_mock_3", "Failure Account", 10_000_000);

        // Inject 2 transient network failures
        provider.inject_failures(2);

        // Call 1 fails
        assert!(provider.get_metadata("root").await.is_err());
        // Call 2 fails
        assert!(provider.get_metadata("root").await.is_err());
        // Call 3 succeeds
        let meta = provider.get_metadata("root").await.unwrap();
        assert_eq!(meta.id, "root");

        // Inject 429 rate limit
        provider.inject_rate_limit(Some(5));
        let err = provider.get_metadata("root").await.unwrap_err();
        match err {
            cirrus_core::error::CirrusError::Provider {
                retry_after_secs, ..
            } => {
                assert_eq!(retry_after_secs, Some(5));
            }
            other => panic!("Expected Provider error with retry_after, got: {:?}", other),
        }

        // Inject unauthorized (token revoked)
        provider.inject_unauthorized(true);
        let auth_err = provider.get_metadata("root").await.unwrap_err();
        match auth_err {
            cirrus_core::error::CirrusError::AuthRequired { account_id, .. } => {
                assert_eq!(account_id, "acc_mock_3");
            }
            other => panic!("Expected AuthRequired, got: {:?}", other),
        }
    }
}
