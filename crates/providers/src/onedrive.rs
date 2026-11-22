use async_trait::async_trait;
use bytes::Bytes;
use reqwest::header::{HeaderMap, HeaderValue, RANGE};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn};

use crate::credentials::CredentialsManager;
use crate::oauth::OneDriveOAuthFlow;
use crate::trait_def::CloudProvider;
use crate::types::{
    ByteRange, DeltaChange, DeltaFeed, FileVersion, ProviderCapabilities, ProviderQuota,
};
use cirrus_core::account::ProviderType;
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::state::FileState;

pub const ONEDRIVE_API_BASE: &str = "https://graph.microsoft.com/v1.0/me/drive";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OneDriveItem {
    pub id: String,
    pub name: String,
    pub size: Option<u64>,
    #[serde(rename = "lastModifiedDateTime")]
    pub last_modified_date_time: Option<String>,
    pub file: Option<serde_json::Value>,
    pub folder: Option<serde_json::Value>,
    #[serde(rename = "parentReference")]
    pub parent_reference: Option<OneDriveParentRef>,
    #[serde(rename = "webUrl")]
    pub web_url: Option<String>,
    pub deleted: Option<serde_json::Value>,
    pub thumbnails: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OneDriveParentRef {
    pub id: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OneDriveListResponse {
    pub value: Option<Vec<OneDriveItem>>,
    #[serde(rename = "@odata.nextLink")]
    pub next_link: Option<String>,
    #[serde(rename = "@odata.deltaLink")]
    pub delta_link: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OneDriveDriveResponse {
    pub quota: Option<OneDriveQuota>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OneDriveQuota {
    pub total: Option<u64>,
    pub used: Option<u64>,
    pub deleted: Option<u64>,
}

#[derive(Clone)]
pub struct OneDriveProvider {
    account_id: String,
    account_name: String,
    client: reqwest::Client,
    oauth_flow: Arc<OneDriveOAuthFlow>,
    credentials_mgr: CredentialsManager,
    is_offline: Arc<AtomicBool>,
}

impl OneDriveProvider {
    pub fn new(account_id: &str, account_name: &str, credentials_mgr: CredentialsManager) -> Self {
        let oauth_flow = Arc::new(OneDriveOAuthFlow::new(credentials_mgr.clone()));
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

    pub fn with_oauth_flow(
        account_id: &str,
        account_name: &str,
        oauth_flow: Arc<OneDriveOAuthFlow>,
        credentials_mgr: CredentialsManager,
    ) -> Self {
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

    pub async fn fetch_about(&self) -> Result<(Option<String>, String, ProviderQuota)> {
        // Fetch user profile email first from /v1.0/me
        let profile_url = "https://graph.microsoft.com/v1.0/me";
        let email = if let Ok(resp) = self
            .execute_with_retry(|t| {
                let u = profile_url.to_string();
                let c = self.client.clone();
                async move { c.get(&u).bearer_auth(t).send().await }
            })
            .await
        {
            if let Ok(val) = resp.json::<serde_json::Value>().await {
                val.get("mail")
                    .and_then(|v| v.as_str())
                    .or_else(|| val.get("userPrincipalName").and_then(|v| v.as_str()))
                    .map(|s| s.to_string())
            } else {
                None
            }
        } else {
            None
        };

        // Fetch drive quota (calls /v1.0/me/drive)
        let quota = match self.quota().await {
            Ok(q) => q,
            Err(CirrusError::AuthRequired { account_id, reason }) => {
                let user_hint = match &email {
                    Some(m) => format!("for Microsoft account '{}'", m),
                    None => "for your Microsoft account".to_string(),
                };
                return Err(CirrusError::AuthRequired {
                    account_id,
                    reason: format!(
                        "Token {} lacks OneDrive permissions: {}. In Microsoft Graph Explorer, run 'GET https://graph.microsoft.com/v1.0/me/drive' and click 'Consent' next to Files.ReadWrite.",
                        user_hint, reason
                    ),
                });
            }
            Err(e) => return Err(e),
        };

        // Fetch root drive folder ID
        let root_url = format!("{}/root?select=id", ONEDRIVE_API_BASE);
        let root_id = if let Ok(resp) = self
            .execute_with_retry(|t| {
                let u = root_url.clone();
                let c = self.client.clone();
                async move { c.get(&u).bearer_auth(t).send().await }
            })
            .await
        {
            if let Ok(val) = resp.json::<serde_json::Value>().await {
                val.get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("root")
                    .to_string()
            } else {
                "root".to_string()
            }
        } else {
            "root".to_string()
        };

        Ok((email, root_id, quota))
    }

    async fn get_access_token(&self) -> Result<String> {
        if self.is_offline() {
            return Err(CirrusError::Network(
                "OneDrive account is operating in offline mode".to_string(),
            ));
        }

        let access_key = CredentialsManager::access_token_key(&self.account_id);
        if let Some(token) = self.credentials_mgr.get_secret(&access_key)? {
            let clean = token
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .trim_start_matches("Bearer ")
                .trim_start_matches("bearer ")
                .trim();
            if !clean.is_empty() {
                return Ok(clean.to_string());
            }
        }

        // Try refreshing access token
        self.oauth_flow.refresh_access_token(&self.account_id).await
    }

    fn convert_onedrive_item(&self, item: &OneDriveItem) -> EntryRecord {
        let is_dir = item.folder.is_some();
        let size = item.size.unwrap_or(0);
        let mime = if is_dir {
            "inode/directory".to_string()
        } else if let Some(ref f) = item.file {
            f.get("mimeType")
                .and_then(|v| v.as_str())
                .unwrap_or("application/octet-stream")
                .to_string()
        } else {
            "application/octet-stream".to_string()
        };

        let parent_id = item.parent_reference.as_ref().and_then(|p| p.id.clone());

        let mtime = item
            .last_modified_date_time
            .as_deref()
            .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
            .map(|dt| dt.timestamp_millis())
            .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

        let thumbnail_url = item.thumbnails.as_ref().and_then(|sets| {
            sets.first().and_then(|set| {
                set.get("medium")
                    .or_else(|| set.get("large"))
                    .or_else(|| set.get("small"))
                    .and_then(|size_obj| size_obj.get("url"))
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string())
            })
        });

        EntryRecord {
            id: item.id.clone(),
            account_id: self.account_id.clone(),
            remote_id: Some(item.id.clone()),
            parent_id,
            name: item.name.clone(),
            path: format!("/{}", item.name),
            is_directory: is_dir,
            size,
            mtime,
            ctime: Some(mtime),
            mime_type: mime,
            etag: None,
            content_hash: None,
            state: FileState::CloudOnly,
            local_path: None,
            thumbnail_url,
            error_message: None,
            sync_version: 1,
            last_accessed_at: None,
            created_at: mtime,
            updated_at: mtime,
        }
    }

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
                            "Access token expired for OneDrive account '{}', refreshing...",
                            self.account_id
                        );
                        if let Ok(new_token) =
                            self.oauth_flow.refresh_access_token(&self.account_id).await
                        {
                            token = new_token;
                            continue;
                        }
                    }

                    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
                        let err_text = resp.text().await.unwrap_or_default();
                        let raw_msg = serde_json::from_str::<serde_json::Value>(&err_text)
                            .ok()
                            .and_then(|v| {
                                v.get("error")
                                    .and_then(|e| e.get("message"))
                                    .and_then(|m| m.as_str())
                                    .map(|s| s.to_string())
                            })
                            .unwrap_or_else(|| {
                                if err_text.trim().is_empty() {
                                    format!("OneDrive access token rejected ({})", status.as_u16())
                                } else {
                                    err_text
                                }
                            });

                        let error_msg = if raw_msg.to_lowercase().contains("access denied")
                            || raw_msg.to_lowercase().contains("invalidauthenticationtoken")
                            || raw_msg.to_lowercase().contains("permission")
                            || raw_msg.to_lowercase().contains("rejected")
                        {
                            format!(
                                "{} (Status {}). The token has expired or lacks OneDrive permissions. Please reconnect via browser.",
                                raw_msg,
                                status.as_u16()
                            )
                        } else {
                            raw_msg
                        };

                        return Err(CirrusError::AuthRequired {
                            account_id: self.account_id.clone(),
                            reason: error_msg,
                        });
                    }

                    if (status == reqwest::StatusCode::TOO_MANY_REQUESTS
                        || status == reqwest::StatusCode::SERVICE_UNAVAILABLE)
                        && attempts < max_attempts
                    {
                        warn!("OneDrive API throttled or 503. Retrying in {:?}", backoff);
                        tokio::time::sleep(backoff).await;
                        backoff *= 2;
                        continue;
                    }

                    if !status.is_success() {
                        let err_text = resp.text().await.unwrap_or_default();
                        return Err(CirrusError::Network(format!(
                            "OneDrive API error (HTTP {}): {}",
                            status, err_text
                        )));
                    }

                    return Ok(resp);
                }
                Err(err) => {
                    if attempts >= max_attempts {
                        return Err(CirrusError::Network(format!(
                            "OneDrive connection error: {}",
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
impl CloudProvider for OneDriveProvider {
    fn id(&self) -> &str {
        &self.account_id
    }

    fn name(&self) -> &str {
        &self.account_name
    }

    fn provider_type(&self) -> ProviderType {
        ProviderType::OneDrive
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities::SUPPORTS_DELTA
            | ProviderCapabilities::SUPPORTS_RESUMABLE_UPLOAD
            | ProviderCapabilities::SUPPORTS_SERVER_SIDE_COPY
            | ProviderCapabilities::SUPPORTS_TRASH
            | ProviderCapabilities::SUPPORTS_VERSIONS
    }

    async fn list_children(
        &self,
        folder_id: Option<&str>,
        page_token: Option<&str>,
    ) -> Result<(Vec<EntryRecord>, Option<String>)> {
        let url = if let Some(token) = page_token {
            token.to_string()
        } else {
            match folder_id {
                Some(id) if id != "root" && !id.is_empty() => {
                    format!("{}/items/{}/children?$expand=thumbnails", ONEDRIVE_API_BASE, id)
                }
                _ => format!("{}/root/children?$expand=thumbnails", ONEDRIVE_API_BASE),
            }
        };

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.get(&req_url).bearer_auth(auth_token).send().await }
            })
            .await?;

        let body: OneDriveListResponse = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        let records = body
            .value
            .unwrap_or_default()
            .into_iter()
            .map(|it| self.convert_onedrive_item(&it))
            .collect();

        Ok((records, body.next_link))
    }

    async fn get_metadata(&self, id: &str) -> Result<EntryRecord> {
        let url = if id == "root" || id.is_empty() {
            format!("{}/root?$expand=thumbnails", ONEDRIVE_API_BASE)
        } else {
            format!("{}/items/{}?$expand=thumbnails", ONEDRIVE_API_BASE, id)
        };

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.get(&req_url).bearer_auth(auth_token).send().await }
            })
            .await?;

        let item: OneDriveItem = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_onedrive_item(&item))
    }

    async fn changes(&self, since_token: Option<&str>) -> Result<DeltaFeed> {
        let url = match since_token {
            Some(t) => t.to_string(),
            None => format!("{}/root/delta", ONEDRIVE_API_BASE),
        };

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.get(&req_url).bearer_auth(auth_token).send().await }
            })
            .await?;

        let body: OneDriveListResponse = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        let mut changes = Vec::new();
        for item in body.value.unwrap_or_default() {
            let is_deleted = item.deleted.is_some();
            let entry = if is_deleted {
                None
            } else {
                Some(self.convert_onedrive_item(&item))
            };

            let mtime = item
                .last_modified_date_time
                .as_deref()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| dt.timestamp_millis())
                .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

            changes.push(DeltaChange {
                id: item.id,
                is_deleted,
                entry,
                timestamp: mtime,
            });
        }

        let next_token = body
            .delta_link
            .or(body.next_link)
            .unwrap_or_else(|| url.clone());

        Ok(DeltaFeed {
            changes,
            new_delta_token: next_token,
            has_more: false,
        })
    }

    async fn download(&self, id: &str, range: Option<ByteRange>) -> Result<Bytes> {
        let url = format!("{}/items/{}/content", ONEDRIVE_API_BASE, id);

        let mut headers = HeaderMap::new();
        if let Some(r) = range {
            let range_str = match r.end {
                Some(end) => format!("bytes={}-{}", r.start, end),
                None => format!("bytes={}-", r.start),
            };
            if let Ok(hv) = HeaderValue::from_str(&range_str) {
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
            .map_err(|e| CirrusError::Io(format!("Failed to stream OneDrive bytes: {}", e)))?;

        Ok(bytes)
    }

    async fn upload(
        &self,
        parent_id: Option<&str>,
        name: &str,
        data: Bytes,
        mime_type: &str,
    ) -> Result<EntryRecord> {
        let pid = parent_id.unwrap_or("root");
        let url = format!("{}/items/{}:/{}:/content", ONEDRIVE_API_BASE, pid, name);
        let mime_owned = mime_type.to_string();

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let d = data.clone();
                let m = mime_owned.clone();
                async move {
                    client
                        .put(&req_url)
                        .bearer_auth(auth_token)
                        .header("Content-Type", m)
                        .body(d)
                        .send()
                        .await
                }
            })
            .await?;

        let item: OneDriveItem = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        info!("Uploaded file '{}' to OneDrive (id: {})", name, item.id);
        Ok(self.convert_onedrive_item(&item))
    }

    async fn create_folder(&self, parent_id: Option<&str>, name: &str) -> Result<EntryRecord> {
        let pid = parent_id.unwrap_or("root");
        let url = format!("{}/items/{}/children", ONEDRIVE_API_BASE, pid);

        let body = serde_json::json!({
            "name": name,
            "folder": {},
            "@microsoft.graph.conflictBehavior": "rename"
        });

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let b = body.clone();
                async move {
                    client
                        .post(&req_url)
                        .bearer_auth(auth_token)
                        .json(&b)
                        .send()
                        .await
                }
            })
            .await?;

        let item: OneDriveItem = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_onedrive_item(&item))
    }

    async fn rename(&self, id: &str, new_name: &str) -> Result<EntryRecord> {
        let url = format!("{}/items/{}", ONEDRIVE_API_BASE, id);
        let body = serde_json::json!({ "name": new_name });

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let b = body.clone();
                async move {
                    client
                        .patch(&req_url)
                        .bearer_auth(auth_token)
                        .json(&b)
                        .send()
                        .await
                }
            })
            .await?;

        let item: OneDriveItem = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_onedrive_item(&item))
    }

    async fn move_entry(&self, id: &str, new_parent_id: Option<&str>) -> Result<EntryRecord> {
        let url = format!("{}/items/{}", ONEDRIVE_API_BASE, id);
        let pid = new_parent_id.unwrap_or("root");
        let body = serde_json::json!({
            "parentReference": {
                "id": pid
            }
        });

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let b = body.clone();
                async move {
                    client
                        .patch(&req_url)
                        .bearer_auth(auth_token)
                        .json(&b)
                        .send()
                        .await
                }
            })
            .await?;

        let item: OneDriveItem = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_onedrive_item(&item))
    }

    async fn copy_entry(
        &self,
        id: &str,
        destination_parent_id: Option<&str>,
        new_name: Option<&str>,
    ) -> Result<EntryRecord> {
        let url = format!("{}/items/{}/copy", ONEDRIVE_API_BASE, id);
        let pid = destination_parent_id.unwrap_or("root");

        let mut body = serde_json::json!({
            "parentReference": {
                "id": pid
            }
        });
        if let Some(n) = new_name {
            body["name"] = serde_json::json!(n);
        }

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let b = body.clone();
                async move {
                    client
                        .post(&req_url)
                        .bearer_auth(auth_token)
                        .json(&b)
                        .send()
                        .await
                }
            })
            .await?;

        let item: OneDriveItem = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_onedrive_item(&item))
    }

    async fn delete_entry(&self, id: &str, _permanent: bool) -> Result<()> {
        let url = format!("{}/items/{}", ONEDRIVE_API_BASE, id);

        self.execute_with_retry(|auth_token| {
            let req_url = url.clone();
            let client = self.client.clone();
            async move { client.delete(&req_url).bearer_auth(auth_token).send().await }
        })
        .await?;

        Ok(())
    }

    async fn restore(&self, id: &str) -> Result<EntryRecord> {
        let url = format!("{}/items/{}/restore", ONEDRIVE_API_BASE, id);

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.post(&req_url).bearer_auth(auth_token).send().await }
            })
            .await?;

        let item: OneDriveItem = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(self.convert_onedrive_item(&item))
    }

    async fn quota(&self) -> Result<ProviderQuota> {
        let url = ONEDRIVE_API_BASE.to_string();

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                async move { client.get(&req_url).bearer_auth(auth_token).send().await }
            })
            .await?;

        let body: OneDriveDriveResponse = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        let q = body.quota.unwrap_or(OneDriveQuota {
            total: Some(1024 * 1024 * 1024 * 1024), // 1 TB
            used: Some(0),
            deleted: None,
        });

        Ok(ProviderQuota {
            total_bytes: q.total.unwrap_or(1024 * 1024 * 1024 * 1024),
            used_bytes: q.used.unwrap_or(0),
            trash_bytes: q.deleted,
        })
    }

    async fn share_link(&self, id: &str) -> Result<String> {
        let url = format!("{}/items/{}/createLink", ONEDRIVE_API_BASE, id);
        let body = serde_json::json!({
            "type": "view",
            "scope": "anonymous"
        });

        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.clone();
                let client = self.client.clone();
                let b = body.clone();
                async move {
                    client
                        .post(&req_url)
                        .bearer_auth(auth_token)
                        .json(&b)
                        .send()
                        .await
                }
            })
            .await?;

        let val: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        let link = val
            .get("link")
            .and_then(|l| l.get("webUrl"))
            .and_then(|u| u.as_str())
            .unwrap_or("")
            .to_string();

        Ok(link)
    }

    async fn versions(&self, id: &str) -> Result<Vec<FileVersion>> {
        let url = format!("{}/items/{}/versions", ONEDRIVE_API_BASE, id);

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
                if let Some(items) = val.get("value").and_then(|v| v.as_array()) {
                    for v in items {
                        let ver_id = v
                            .get("id")
                            .and_then(|s| s.as_str())
                            .unwrap_or("")
                            .to_string();
                        let size = v.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                        let mtime = v
                            .get("lastModifiedDateTime")
                            .and_then(|s| s.as_str())
                            .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                            .map(|dt| dt.timestamp_millis())
                            .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
                        let author = v
                            .get("lastModifiedBy")
                            .and_then(|u| u.get("user"))
                            .and_then(|n| n.get("displayName"))
                            .and_then(|d| d.as_str())
                            .map(|s| s.to_string());

                        list.push(FileVersion {
                            id: format!("{}_{}", id, ver_id),
                            version_id: ver_id,
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

    async fn fetch_thumbnail_bytes(&self, url: &str) -> Result<Bytes> {
        let resp = self
            .execute_with_retry(|auth_token| {
                let req_url = url.to_string();
                let client = self.client.clone();
                async move {
                    client
                        .get(&req_url)
                        .bearer_auth(auth_token)
                        .send()
                        .await
                }
            })
            .await?;

        resp.bytes()
            .await
            .map_err(|e| CirrusError::Network(format!("Failed to read thumbnail bytes: {}", e)))
    }
}
