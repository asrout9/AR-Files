use async_trait::async_trait;
use bytes::Bytes;
use reqwest::header::{HeaderMap, HeaderValue, RANGE};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn};

use crate::credentials::CredentialsManager;
use crate::oauth::GoogleOAuthFlow;
use crate::trait_def::CloudProvider;
use crate::types::{
    ByteRange, DeltaChange, DeltaFeed, FileVersion, ProviderCapabilities, ProviderQuota,
};
use cirrus_core::account::ProviderType;
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::state::FileState;

pub const GDRIVE_API_BASE: &str = "https://www.googleapis.com/drive/v3";
pub const GDRIVE_UPLOAD_BASE: &str = "https://www.googleapis.com/upload/drive/v3";
pub const FOLDER_MIME_TYPE: &str = "application/vnd.google-apps.folder";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GDriveFile {
    pub id: String,
    pub name: String,
    #[serde(rename = "mimeType")]
    pub mime_type: Option<String>,
    pub size: Option<String>,
    #[serde(rename = "modifiedTime")]
    pub modified_time: Option<String>,
    #[serde(rename = "md5Checksum")]
    pub md5_checksum: Option<String>,
    pub trashed: Option<bool>,
    pub parents: Option<Vec<String>>,
    #[serde(rename = "webViewLink")]
    pub web_view_link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GDriveFileListResponse {
    pub files: Option<Vec<GDriveFile>>,
    #[serde(rename = "nextPageToken")]
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GDriveStartPageTokenResponse {
    #[serde(rename = "startPageToken")]
    pub start_page_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GDriveChangeItem {
    #[serde(rename = "fileId")]
    pub file_id: String,
    pub removed: Option<bool>,
    pub file: Option<GDriveFile>,
    pub time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GDriveChangesResponse {
    pub changes: Option<Vec<GDriveChangeItem>>,
    #[serde(rename = "nextPageToken")]
    pub next_page_token: Option<String>,
    #[serde(rename = "newStartPageToken")]
    pub new_start_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GDriveStorageQuota {
    pub limit: Option<String>,
    pub usage: Option<String>,
    #[serde(rename = "usageInDriveTrash")]
    pub usage_in_drive_trash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GDriveAboutResponse {
    #[serde(rename = "storageQuota")]
    pub storage_quota: Option<GDriveStorageQuota>,
}

#[derive(Clone)]
pub struct GoogleDriveProvider {
    account_id: String,
    account_name: String,
    client: reqwest::Client,
    oauth_flow: Arc<GoogleOAuthFlow>,
    credentials_mgr: CredentialsManager,
    is_offline: Arc<AtomicBool>,
}

impl GoogleDriveProvider {
    pub fn new(account_id: &str, account_name: &str, credentials_mgr: CredentialsManager) -> Self {
        let oauth_flow = Arc::new(GoogleOAuthFlow::new(credentials_mgr.clone()));
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(45))
            .build()
            .unwrap_or_default();

        Self {
            account_id: account_id.to_string(),
            account_name: account_name.to_string(),
            client,
            oauth_flow,
            credentials_mgr,
            is_offline: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn set_offline(&self, offline: bool) {
        self.is_offline.store(offline, Ordering::SeqCst);
    }

    pub fn is_offline(&self) -> bool {
        self.is_offline.load(Ordering::SeqCst)
    }

    /// Retrieves an authenticated bearer token or refreshes it if needed.
    async fn get_access_token(&self) -> Result<String> {
        if self.is_offline() {
            return Err(CirrusError::Network(
                "Account is operating in offline mode".to_string(),
            ));
        }

        let access_key = CredentialsManager::access_token_key(&self.account_id);
        if let Some(token) = self.credentials_mgr.get_secret(&access_key)? {
            if !token.is_empty() {
                return Ok(token);
            }
        }

        // Try refreshing access token
        self.oauth_flow.refresh_access_token(&self.account_id).await
    }

    /// Converts a Google Drive REST API file object into an AR Files EntryRecord.
    fn convert_gdrive_file(&self, file: &GDriveFile) -> EntryRecord {
        let is_dir = file.mime_type.as_deref() == Some(FOLDER_MIME_TYPE);
        let size = file
            .size
            .as_deref()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);
        let mime = file.mime_type.clone().unwrap_or_else(|| {
            if is_dir {
                "inode/directory".to_string()
            } else {
                "application/octet-stream".to_string()
            }
        });

        let parent_id = file.parents.as_ref().and_then(|p| p.first()).cloned();

        let mtime = file
            .modified_time
            .as_deref()
            .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
            .map(|dt| dt.timestamp_millis())
            .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

        EntryRecord {
            id: file.id.clone(),
            account_id: self.account_id.clone(),
            remote_id: Some(file.id.clone()),
            parent_id,
            name: file.name.clone(),
            path: format!("/{}", file.name),
            is_directory: is_dir,
            size,
            mtime,
            ctime: Some(mtime),
            mime_type: mime,
            etag: None,
            content_hash: file.md5_checksum.clone(),
            state: FileState::CloudOnly,
            local_path: None,
            error_message: None,
            sync_version: 1,
            last_accessed_at: None,
            created_at: mtime,
            updated_at: mtime,
        }
    }

    /// Executes an HTTP request with automatic authorization, token refresh on 401, and exponential backoff retry on 429/503.
    async fn execute_with_retry<F, Fut>(&self, make_request: F) -> Result<reqwest::Response>
    where
        F: Fn(String) -> Fut,
        Fut: std::future::Future<Output = std::result::Result<reqwest::Response, reqwest::Error>>,
    {
        if self.is_offline() {
            return Err(CirrusError::Network("Account is offline".to_string()));
        }

        let mut token = self.get_access_token().await?;
        let mut attempts = 0;
        let max_attempts = 3;
        let mut backoff = Duration::from_millis(500);

        loop {
            attempts += 1;
            match make_request(token.clone()).await {
                Ok(resp) => {
                    let status = resp.status();
                    if status == reqwest::StatusCode::UNAUTHORIZED && attempts < max_attempts {
                        warn!(
                            "Access token expired for '{}', refreshing...",
                            self.account_id
                        );
                        if let Ok(new_token) =
                            self.oauth_flow.refresh_access_token(&self.account_id).await
                        {
                            token = new_token;
                            continue;
                        }
                    }

                    if (status == reqwest::StatusCode::TOO_MANY_REQUESTS
                        || status == reqwest::StatusCode::SERVICE_UNAVAILABLE)
                        && attempts < max_attempts
                    {
                        warn!(
                            "Rate limited or temporary 503 from Google Drive API. Retrying in {:?}",
                            backoff
                        );
                        tokio::time::sleep(backoff).await;
                        backoff *= 2;
                        continue;
                    }

                    if !status.is_success() {
                        let err_text = resp.text().await.unwrap_or_default();
                        return Err(CirrusError::Network(format!(
                            "Google Drive API error (HTTP {}): {}",
                            status, err_text
                        )));
                    }

                    return Ok(resp);
                }
                Err(err) => {
                    if attempts >= max_attempts {
                        return Err(CirrusError::Network(format!(
                            "Google Drive network error: {}",
                            err
                        )));
                    }
                    tokio::time::sleep(backoff).await;
                    backoff *= 2;
                }
            }
        }
    }
}

#[async_trait]
impl CloudProvider for GoogleDriveProvider {
    fn id(&self) -> &str {
        &self.account_id
    }

    fn name(&self) -> &str {
        &self.account_name
    }

    fn provider_type(&self) -> ProviderType {
        ProviderType::GoogleDrive
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities::SUPPORTS_DELTA
            | ProviderCapabilities::SUPPORTS_RESUMABLE_UPLOAD
            | ProviderCapabilities::SUPPORTS_SERVER_SIDE_COPY
            | ProviderCapabilities::SUPPORTS_TRASH
            | ProviderCapabilities::SUPPORTS_SHARED_DRIVES
    }

    async fn list_children(
        &self,
        folder_id: Option<&str>,
        page_token: Option<&str>,
    ) -> Result<(Vec<EntryRecord>, Option<String>)> {
        let parent = folder_id.unwrap_or("root");
        let query = format!("'{}' in parents and trashed = false", parent);

        let mut url = format!(
            "{}/files?q={}&pageSize=100&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,trashed,parents,webViewLink)",
            GDRIVE_API_BASE,
            urlencoding::encode(&query)
        );

        if let Some(token) = page_token {
            url.push_str(&format!("&pageToken={}", urlencoding::encode(token)));
        }

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.get(&req_url).bearer_auth(auth_token).send().await }
            })
            .await?;

        let body: GDriveFileListResponse = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        let records = body
            .files
            .unwrap_or_default()
            .into_iter()
            .map(|f| self.convert_gdrive_file(&f))
            .collect();

        Ok((records, body.next_page_token))
    }

    async fn get_metadata(&self, id: &str) -> Result<EntryRecord> {
        let url = format!(
            "{}/files/{}?fields=id,name,mimeType,size,modifiedTime,md5Checksum,trashed,parents,webViewLink",
            GDRIVE_API_BASE, id
        );

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.get(&req_url).bearer_auth(auth_token).send().await }
            })
            .await?;

        let file: GDriveFile = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_gdrive_file(&file))
    }

    async fn changes(&self, since_token: Option<&str>) -> Result<DeltaFeed> {
        // If no token was provided, fetch the initial startPageToken
        let token = match since_token {
            Some(t) => t.to_string(),
            None => {
                let start_url = format!("{}/changes/startPageToken", GDRIVE_API_BASE);
                let resp = self
                    .execute_with_retry(|auth_token| {
                        let req_url = start_url.clone();
                        let client = self.client.clone();
                        async move { client.get(&req_url).bearer_auth(auth_token).send().await }
                    })
                    .await?;
                let start_body: GDriveStartPageTokenResponse = resp
                    .json()
                    .await
                    .map_err(|e| CirrusError::Serialization(e.to_string()))?;
                return Ok(DeltaFeed {
                    changes: Vec::new(),
                    new_delta_token: start_body.start_page_token,
                    has_more: false,
                });
            }
        };

        let url = format!(
            "{}/changes?pageToken={}&pageSize=100&fields=nextPageToken,newStartPageToken,changes(fileId,removed,time,file(id,name,mimeType,size,modifiedTime,md5Checksum,trashed,parents))",
            GDRIVE_API_BASE,
            urlencoding::encode(&token)
        );

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.get(&req_url).bearer_auth(auth_token).send().await }
            })
            .await?;

        let body: GDriveChangesResponse = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        let mut changes = Vec::new();
        for item in body.changes.unwrap_or_default() {
            let is_deleted = item.removed.unwrap_or(false)
                || item.file.as_ref().and_then(|f| f.trashed).unwrap_or(false);

            let entry = item.file.as_ref().map(|f| self.convert_gdrive_file(f));
            let timestamp = item
                .time
                .as_deref()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| dt.timestamp_millis())
                .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

            changes.push(DeltaChange {
                id: item.file_id,
                is_deleted,
                entry,
                timestamp,
            });
        }

        let new_token = body
            .new_start_page_token
            .or(body.next_page_token)
            .unwrap_or(token);

        Ok(DeltaFeed {
            changes,
            new_delta_token: new_token,
            has_more: false,
        })
    }

    async fn download(&self, id: &str, range: Option<ByteRange>) -> Result<Bytes> {
        let url = format!("{}/files/{}?alt=media", GDRIVE_API_BASE, id);

        let mut headers = HeaderMap::new();
        if let Some(r) = range {
            let range_header_val = match r.end {
                Some(end) => format!("bytes={}-{}", r.start, end),
                None => format!("bytes={}-", r.start),
            };
            if let Ok(hv) = HeaderValue::from_str(&range_header_val) {
                headers.insert(RANGE, hv);
            }
        }

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let hdrs = headers.clone();
                async move {
                    client
                        .get(&req_url)
                        .bearer_auth(auth_token)
                        .headers(hdrs)
                        .send()
                        .await
                }
            })
            .await?;

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| CirrusError::Io(format!("Failed to stream download bytes: {}", e)))?;

        Ok(bytes)
    }

    async fn upload(
        &self,
        parent_id: Option<&str>,
        name: &str,
        data: Bytes,
        mime_type: &str,
    ) -> Result<EntryRecord> {
        let url = format!("{}/files?uploadType=multipart", GDRIVE_UPLOAD_BASE);

        let pid_opt = parent_id.map(|s| s.to_string());
        let name_owned = name.to_string();
        let mime_owned = mime_type.to_string();

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let d = data.clone();
                let n = name_owned.clone();
                let m = mime_owned.clone();
                let p = pid_opt.clone();
                async move {
                    let mut metadata = serde_json::json!({
                        "name": n,
                    });
                    if let Some(pid) = p {
                        metadata["parents"] = serde_json::json!([pid]);
                    }

                    let part_meta = reqwest::multipart::Part::text(metadata.to_string())
                        .mime_str("application/json")
                        .unwrap_or_else(|_| reqwest::multipart::Part::text(""));

                    let part_data = reqwest::multipart::Part::bytes(d.to_vec())
                        .mime_str(&m)
                        .unwrap_or_else(|_| reqwest::multipart::Part::bytes(d.to_vec()));

                    let form = reqwest::multipart::Form::new()
                        .part("metadata", part_meta)
                        .part("file", part_data);

                    client
                        .post(&req_url)
                        .bearer_auth(auth_token)
                        .multipart(form)
                        .send()
                        .await
                }
            })
            .await?;

        let file: GDriveFile = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        info!("Uploaded file '{}' to Google Drive (id: {})", name, file.id);
        Ok(self.convert_gdrive_file(&file))
    }

    async fn create_folder(&self, parent_id: Option<&str>, name: &str) -> Result<EntryRecord> {
        let url = format!("{}/files", GDRIVE_API_BASE);

        let mut body = serde_json::json!({
            "name": name,
            "mimeType": FOLDER_MIME_TYPE,
        });
        if let Some(pid) = parent_id {
            body["parents"] = serde_json::json!([pid]);
        }

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let req_body = body.clone();
                async move {
                    client
                        .post(&req_url)
                        .bearer_auth(auth_token)
                        .json(&req_body)
                        .send()
                        .await
                }
            })
            .await?;

        let file: GDriveFile = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_gdrive_file(&file))
    }

    async fn rename(&self, id: &str, new_name: &str) -> Result<EntryRecord> {
        let url = format!("{}/files/{}", GDRIVE_API_BASE, id);
        let body = serde_json::json!({ "name": new_name });

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let req_body = body.clone();
                async move {
                    client
                        .patch(&req_url)
                        .bearer_auth(auth_token)
                        .json(&req_body)
                        .send()
                        .await
                }
            })
            .await?;

        let file: GDriveFile = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_gdrive_file(&file))
    }

    async fn move_entry(&self, id: &str, new_parent_id: Option<&str>) -> Result<EntryRecord> {
        let current = self.get_metadata(id).await?;
        let remove_parents = current.parent_id.unwrap_or_else(|| "root".to_string());
        let add_parents = new_parent_id.unwrap_or("root");

        let url = format!(
            "{}/files/{}?addParents={}&removeParents={}",
            GDRIVE_API_BASE,
            id,
            urlencoding::encode(add_parents),
            urlencoding::encode(&remove_parents)
        );

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.patch(&req_url).bearer_auth(auth_token).send().await }
            })
            .await?;

        let file: GDriveFile = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_gdrive_file(&file))
    }

    async fn copy_entry(
        &self,
        id: &str,
        destination_parent_id: Option<&str>,
        new_name: Option<&str>,
    ) -> Result<EntryRecord> {
        let url = format!("{}/files/{}/copy", GDRIVE_API_BASE, id);

        let mut body = serde_json::json!({});
        if let Some(name) = new_name {
            body["name"] = serde_json::json!(name);
        }
        if let Some(dest) = destination_parent_id {
            body["parents"] = serde_json::json!([dest]);
        }

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let req_body = body.clone();
                async move {
                    client
                        .post(&req_url)
                        .bearer_auth(auth_token)
                        .json(&req_body)
                        .send()
                        .await
                }
            })
            .await?;

        let file: GDriveFile = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_gdrive_file(&file))
    }

    async fn delete_entry(&self, id: &str, permanent: bool) -> Result<()> {
        if permanent {
            let url = format!("{}/files/{}", GDRIVE_API_BASE, id);
            self.execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.delete(&req_url).bearer_auth(auth_token).send().await }
            })
            .await?;
        } else {
            let url = format!("{}/files/{}", GDRIVE_API_BASE, id);
            let body = serde_json::json!({ "trashed": true });
            self.execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let req_body = body.clone();
                async move {
                    client
                        .patch(&req_url)
                        .bearer_auth(auth_token)
                        .json(&req_body)
                        .send()
                        .await
                }
            })
            .await?;
        }

        Ok(())
    }

    async fn restore(&self, id: &str) -> Result<EntryRecord> {
        let url = format!("{}/files/{}", GDRIVE_API_BASE, id);
        let body = serde_json::json!({ "trashed": false });

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let req_body = body.clone();
                async move {
                    client
                        .patch(&req_url)
                        .bearer_auth(auth_token)
                        .json(&req_body)
                        .send()
                        .await
                }
            })
            .await?;

        let file: GDriveFile = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_gdrive_file(&file))
    }

    async fn quota(&self) -> Result<ProviderQuota> {
        let url = format!("{}/about?fields=storageQuota", GDRIVE_API_BASE);

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.get(&req_url).bearer_auth(auth_token).send().await }
            })
            .await?;

        let body: GDriveAboutResponse = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        let sq = body.storage_quota.unwrap_or(GDriveStorageQuota {
            limit: None,
            usage: None,
            usage_in_drive_trash: None,
        });

        let total_bytes = sq
            .limit
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(15 * 1024 * 1024 * 1024);
        let used_bytes = sq.usage.and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
        let trash_bytes = sq.usage_in_drive_trash.and_then(|s| s.parse::<u64>().ok());

        Ok(ProviderQuota {
            total_bytes,
            used_bytes,
            trash_bytes,
        })
    }

    async fn share_link(&self, id: &str) -> Result<String> {
        let file = self.get_metadata(id).await?;
        Ok(format!("https://drive.google.com/file/d/{}/view", file.id))
    }

    async fn versions(&self, id: &str) -> Result<Vec<FileVersion>> {
        let url = format!(
            "{}/files/{}/revisions?fields=revisions(id,modifiedTime,size,lastModifyingUser(displayName))",
            GDRIVE_API_BASE, id
        );

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.get(&req_url).bearer_auth(auth_token).send().await }
            })
            .await;

        match resp {
            Ok(r) => {
                let val: serde_json::Value = r
                    .json()
                    .await
                    .map_err(|e| CirrusError::Serialization(e.to_string()))?;

                let mut list = Vec::new();
                if let Some(revisions) = val.get("revisions").and_then(|v| v.as_array()) {
                    for rev in revisions {
                        let rev_id = rev
                            .get("id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let size = rev
                            .get("size")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse::<u64>().ok())
                            .unwrap_or(0);
                        let mtime = rev
                            .get("modifiedTime")
                            .and_then(|v| v.as_str())
                            .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                            .map(|dt| dt.timestamp_millis())
                            .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
                        let author = rev
                            .get("lastModifyingUser")
                            .and_then(|u| u.get("displayName"))
                            .and_then(|d| d.as_str())
                            .map(|s| s.to_string());

                        list.push(FileVersion {
                            id: format!("{}_{}", id, rev_id),
                            version_id: rev_id,
                            size,
                            modified_time: mtime,
                            author,
                            download_url: None,
                        });
                    }
                }
                Ok(list)
            }
            Err(_) => Ok(Vec::new()),
        }
    }
}
