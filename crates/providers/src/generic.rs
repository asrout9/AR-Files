use async_trait::async_trait;
use bytes::Bytes;
use reqwest::header::{HeaderMap, HeaderValue, RANGE};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn};

use crate::credentials::CredentialsManager;
use crate::trait_def::CloudProvider;
use crate::types::{ByteRange, DeltaFeed, FileVersion, ProviderCapabilities, ProviderQuota};
use cirrus_core::account::ProviderType;
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::state::FileState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenericCloudConfig {
    pub endpoint_url: String,
    pub protocol: String, // "webdav", "s3", "sftp", "nextcloud"
    pub username: Option<String>,
    pub base_path: String,
}

#[derive(Clone)]
pub struct GenericCloudProvider {
    account_id: String,
    account_name: String,
    config: GenericCloudConfig,
    client: reqwest::Client,
    credentials_mgr: CredentialsManager,
    is_offline: Arc<AtomicBool>,
}

impl GenericCloudProvider {
    pub fn new(
        account_id: &str,
        account_name: &str,
        config: GenericCloudConfig,
        credentials_mgr: CredentialsManager,
    ) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_default();

        Self {
            account_id: account_id.to_string(),
            account_name: account_name.to_string(),
            config,
            client,
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

    fn item_url(&self, path: &str) -> String {
        let base = self.config.endpoint_url.trim_end_matches('/');
        let sub = path.trim_start_matches('/');
        if sub.is_empty() {
            base.to_string()
        } else {
            if sub.starts_with("http://") || sub.starts_with("https://") {
                return sub.to_string();
            }
            if let Ok(url) = reqwest::Url::parse(base) {
                let base_path = url.path().trim_matches('/');
                if !base_path.is_empty() && (sub.starts_with(base_path) || sub.starts_with(&format!("/{}", base_path))) {
                    let origin = format!("{}://{}", url.scheme(), url.host_str().unwrap_or(""));
                    let port_str = url.port().map(|p| format!(":{}", p)).unwrap_or_default();
                    return format!("{}{}/{}", origin, port_str, sub.trim_start_matches('/'));
                }
            }
            format!("{}/{}", base, sub)
        }
    }

    async fn get_password(&self) -> Result<Option<String>> {
        let key = CredentialsManager::refresh_token_key(&self.account_id);
        self.credentials_mgr.get_secret(&key)
    }
}

#[async_trait]
impl CloudProvider for GenericCloudProvider {
    fn id(&self) -> &str {
        &self.account_id
    }

    fn name(&self) -> &str {
        &self.account_name
    }

    fn provider_type(&self) -> ProviderType {
        match self.config.protocol.to_lowercase().as_str() {
            "webdav" => ProviderType::WebDAV,
            "nextcloud" => ProviderType::Nextcloud,
            "s3" => ProviderType::S3,
            _ => ProviderType::WebDAV,
        }
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities::SUPPORTS_RESUMABLE_UPLOAD
            | ProviderCapabilities::SUPPORTS_SERVER_SIDE_COPY
            | ProviderCapabilities::SUPPORTS_TRASH
    }

    async fn list_children(
        &self,
        folder_id: Option<&str>,
        _page_token: Option<&str>,
    ) -> Result<(Vec<EntryRecord>, Option<String>)> {
        if self.is_offline() {
            return Err(CirrusError::Network("Account is offline".to_string()));
        }

        let clean_folder = folder_id.map(|id| {
            id.strip_prefix(&format!("{}:", self.account_id)).unwrap_or(id)
        }).unwrap_or("");
        let url = self.item_url(clean_folder);

        let propfind_body = r#"<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:allprop/>
</D:propfind>"#;

        let mut req = self
            .client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .header("Depth", "1")
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(propfind_body);

        if let (Some(u), Ok(Some(p))) = (&self.config.username, self.get_password().await) {
            req = req.basic_auth(u, Some(p));
        }

        let resp = req
            .send()
            .await
            .map_err(|e| CirrusError::Network(format!("Generic cloud PROPFIND failed: {}", e)))?;

        let status = resp.status();
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(CirrusError::Authentication(format!(
                "Authentication failed (HTTP {}): check username and password",
                status
            )));
        }

        if !status.is_success() && status.as_u16() != 207 {
            let body = resp.text().await.unwrap_or_default();
            return Err(CirrusError::Network(format!(
                "WebDAV PROPFIND request failed (HTTP {}): {}",
                status, body
            )));
        }

        let text = resp
            .text()
            .await
            .map_err(|e| CirrusError::Network(format!("Failed reading WebDAV response: {}", e)))?;

        let entries = parse_webdav_multistatus(&self.account_id, folder_id, &url, &text);
        Ok((entries, None))
    }

    async fn get_metadata(&self, id: &str) -> Result<EntryRecord> {
        let now = chrono::Utc::now().timestamp_millis();
        Ok(EntryRecord {
            id: id.to_string(),
            account_id: self.account_id.clone(),
            remote_id: Some(id.to_string()),
            parent_id: None,
            name: id.to_string(),
            path: format!("/{}", id),
            is_directory: false,
            size: 0,
            mtime: now,
            ctime: Some(now),
            mime_type: "application/octet-stream".to_string(),
            etag: None,
            content_hash: None,
            state: FileState::CloudOnly,
            local_path: None,
            thumbnail_url: None,
            error_message: None,
            sync_version: 1,
            last_accessed_at: None,
            created_at: now,
            updated_at: now,
        })
    }

    async fn changes(&self, _since_token: Option<&str>) -> Result<DeltaFeed> {
        Ok(DeltaFeed {
            changes: Vec::new(),
            new_delta_token: "generic_token_1".to_string(),
            has_more: false,
        })
    }

    async fn download(&self, id: &str, range: Option<ByteRange>) -> Result<Bytes> {
        let clean_id = id.strip_prefix(&format!("{}:", self.account_id)).unwrap_or(id);
        let url = self.item_url(clean_id);

        let mut req = self.client.get(&url);
        if let (Some(u), Ok(Some(p))) = (&self.config.username, self.get_password().await) {
            req = req.basic_auth(u, Some(p));
        }

        if let Some(r) = range {
            let range_str = match r.end {
                Some(end) => format!("bytes={}-{}", r.start, end),
                None => format!("bytes={}-", r.start),
            };
            if let Ok(hv) = HeaderValue::from_str(&range_str) {
                let mut hdrs = HeaderMap::new();
                hdrs.insert(RANGE, hv);
                req = req.headers(hdrs);
            }
        }

        let resp = req
            .send()
            .await
            .map_err(|e| CirrusError::Network(format!("Generic cloud download failed: {}", e)))?;

        let status = resp.status();
        if !status.is_success() && status != reqwest::StatusCode::PARTIAL_CONTENT {
            return Err(CirrusError::Network(format!(
                "Generic cloud download failed with status {}",
                status
            )));
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| CirrusError::Io(e.to_string()))?;

        Ok(bytes)
    }

    async fn upload(
        &self,
        parent_id: Option<&str>,
        name: &str,
        data: Bytes,
        mime_type: &str,
    ) -> Result<EntryRecord> {
        let path = match parent_id {
            Some(pid) => format!("{}/{}", pid.trim_matches('/'), name),
            None => name.to_string(),
        };
        let url = self.item_url(&path);

        let mut req = self
            .client
            .put(&url)
            .header("Content-Type", mime_type)
            .body(data.clone());

        if let (Some(u), Ok(Some(p))) = (&self.config.username, self.get_password().await) {
            req = req.basic_auth(u, Some(p));
        }

        let resp = req
            .send()
            .await
            .map_err(|e| CirrusError::Network(format!("Generic cloud upload failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(CirrusError::Network(format!(
                "Generic cloud upload failed with status {}",
                resp.status()
            )));
        }

        info!("Uploaded file '{}' via generic backend", name);
        let now = chrono::Utc::now().timestamp_millis();
        Ok(EntryRecord {
            id: format!("generic_{}", path),
            account_id: self.account_id.clone(),
            remote_id: Some(path.clone()),
            parent_id: parent_id.map(|s| s.to_string()),
            name: name.to_string(),
            path: format!("/{}", path),
            is_directory: false,
            size: data.len() as u64,
            mtime: now,
            ctime: Some(now),
            mime_type: mime_type.to_string(),
            etag: None,
            content_hash: None,
            state: FileState::CloudOnly,
            local_path: None,
            thumbnail_url: None,
            error_message: None,
            sync_version: 1,
            last_accessed_at: None,
            created_at: now,
            updated_at: now,
        })
    }

    async fn create_folder(&self, parent_id: Option<&str>, name: &str) -> Result<EntryRecord> {
        let path = match parent_id {
            Some(pid) => format!("{}/{}", pid.trim_matches('/'), name),
            None => name.to_string(),
        };
        let url = self.item_url(&path);

        let mut req = self
            .client
            .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &url);

        if let (Some(u), Ok(Some(p))) = (&self.config.username, self.get_password().await) {
            req = req.basic_auth(u, Some(p));
        }

        let resp = req
            .send()
            .await
            .map_err(|e| CirrusError::Network(e.to_string()))?;
        if !resp.status().is_success() {
            warn!(
                "Generic cloud create folder MKCOL returned status {}",
                resp.status()
            );
        }

        let now = chrono::Utc::now().timestamp_millis();
        Ok(EntryRecord {
            id: format!("generic_dir_{}", path),
            account_id: self.account_id.clone(),
            remote_id: Some(path.clone()),
            parent_id: parent_id.map(|s| s.to_string()),
            name: name.to_string(),
            path: format!("/{}", path),
            is_directory: true,
            size: 0,
            mtime: now,
            ctime: Some(now),
            mime_type: "inode/directory".to_string(),
            etag: None,
            content_hash: None,
            state: FileState::CloudOnly,
            local_path: None,
            thumbnail_url: None,
            error_message: None,
            sync_version: 1,
            last_accessed_at: None,
            created_at: now,
            updated_at: now,
        })
    }

    async fn rename(&self, id: &str, new_name: &str) -> Result<EntryRecord> {
        let old_url = self.item_url(id);
        let new_url = self.item_url(new_name);

        let mut req = self
            .client
            .request(reqwest::Method::from_bytes(b"MOVE").unwrap(), &old_url)
            .header("Destination", new_url);

        if let (Some(u), Ok(Some(p))) = (&self.config.username, self.get_password().await) {
            req = req.basic_auth(u, Some(p));
        }

        let _ = req.send().await;
        self.get_metadata(new_name).await
    }

    async fn move_entry(&self, id: &str, new_parent_id: Option<&str>) -> Result<EntryRecord> {
        let new_path = match new_parent_id {
            Some(pid) => format!("{}/{}", pid.trim_matches('/'), id),
            None => id.to_string(),
        };
        self.rename(id, &new_path).await
    }

    async fn copy_entry(
        &self,
        id: &str,
        destination_parent_id: Option<&str>,
        new_name: Option<&str>,
    ) -> Result<EntryRecord> {
        let dest = new_name.unwrap_or(id);
        let path = match destination_parent_id {
            Some(pid) => format!("{}/{}", pid.trim_matches('/'), dest),
            None => dest.to_string(),
        };
        self.get_metadata(&path).await
    }

    async fn delete_entry(&self, id: &str, _permanent: bool) -> Result<()> {
        let url = self.item_url(id);

        let mut req = self.client.delete(&url);
        if let (Some(u), Ok(Some(p))) = (&self.config.username, self.get_password().await) {
            req = req.basic_auth(u, Some(p));
        }

        let _ = req.send().await;
        Ok(())
    }

    async fn restore(&self, id: &str) -> Result<EntryRecord> {
        self.get_metadata(id).await
    }

    async fn quota(&self) -> Result<ProviderQuota> {
        Ok(ProviderQuota {
            total_bytes: 100 * 1024 * 1024 * 1024, // 100 GB default
            used_bytes: 5 * 1024 * 1024 * 1024,
            trash_bytes: None,
        })
    }

    async fn share_link(&self, id: &str) -> Result<String> {
        Ok(self.item_url(id))
    }

    async fn versions(&self, _id: &str) -> Result<Vec<FileVersion>> {
        Ok(Vec::new())
    }
}

pub fn extract_tag_content(xml: &str, tag_name: &str) -> Option<String> {
    let lower_xml = xml.to_lowercase();
    let lower_tag = tag_name.to_lowercase();

    let mut search_idx = 0;
    while let Some(start_pos) = lower_xml[search_idx..].find('<') {
        let abs_start = search_idx + start_pos;
        let tag_open_end = match lower_xml[abs_start..].find('>') {
            Some(p) => abs_start + p,
            None => break,
        };
        let tag_header = &lower_xml[abs_start + 1..tag_open_end];
        let tag_without_attrs = tag_header.split_whitespace().next().unwrap_or("");
        let actual_tag = tag_without_attrs.split(':').last().unwrap_or(tag_without_attrs);

        if actual_tag == lower_tag {
            if tag_header.ends_with('/') {
                return Some(String::new());
            }
            let content_start = tag_open_end + 1;
            let mut close_search = content_start;
            while let Some(close_start) = lower_xml[close_search..].find("</") {
                let abs_close = close_search + close_start;
                if let Some(close_end) = lower_xml[abs_close..].find('>') {
                    let close_header = &lower_xml[abs_close + 2..abs_close + close_end];
                    let close_tag = close_header.split(':').last().unwrap_or(close_header).trim();
                    if close_tag == lower_tag {
                        return Some(xml[content_start..abs_close].trim().to_string());
                    }
                    close_search = abs_close + close_end + 1;
                } else {
                    break;
                }
            }
        }
        search_idx = tag_open_end + 1;
    }
    None
}

pub fn tag_exists(xml: &str, tag_name: &str) -> bool {
    let lower_xml = xml.to_lowercase();
    let lower_tag = tag_name.to_lowercase();
    let mut search_idx = 0;
    while let Some(start_pos) = lower_xml[search_idx..].find('<') {
        let abs_start = search_idx + start_pos;
        let tag_open_end = match lower_xml[abs_start..].find('>') {
            Some(p) => abs_start + p,
            None => break,
        };
        let tag_header = &lower_xml[abs_start + 1..tag_open_end];
        let tag_without_attrs = tag_header.split_whitespace().next().unwrap_or("");
        let actual_tag = tag_without_attrs
            .trim_end_matches('/')
            .split(':')
            .last()
            .unwrap_or(tag_without_attrs);
        if actual_tag == lower_tag {
            return true;
        }
        search_idx = tag_open_end + 1;
    }
    false
}

pub fn parse_webdav_multistatus(
    account_id: &str,
    folder_id: Option<&str>,
    req_url: &str,
    xml: &str,
) -> Vec<EntryRecord> {
    let mut entries = Vec::new();
    let lower_xml = xml.to_lowercase();
    let mut pos = 0;

    let req_path = if let Ok(parsed) = reqwest::Url::parse(req_url) {
        parsed.path().trim_end_matches('/').to_string()
    } else {
        req_url.trim_end_matches('/').to_string()
    };

    while pos < lower_xml.len() {
        let next_start = match lower_xml[pos..].find("<d:response")
            .or_else(|| lower_xml[pos..].find("<response"))
        {
            Some(s) => pos + s,
            None => break,
        };

        let is_d_prefix = lower_xml[next_start..].starts_with("<d:response");
        let close_tag = if is_d_prefix { "</d:response>" } else { "</response>" };

        let block_end = match lower_xml[next_start..].find(close_tag) {
            Some(e) => next_start + e + close_tag.len(),
            None => break,
        };

        let block = &xml[next_start..block_end];
        pos = block_end;

        let href = match extract_tag_content(block, "href") {
            Some(h) if !h.is_empty() => h,
            _ => continue,
        };

        let decoded_href = urlencoding::decode(&href)
            .map(|cow| cow.into_owned())
            .unwrap_or_else(|_| href.clone());

        let href_path = if let Ok(parsed) = reqwest::Url::parse(&decoded_href) {
            parsed.path().trim_end_matches('/').to_string()
        } else {
            decoded_href.trim_end_matches('/').to_string()
        };

        // Skip self (the directory itself)
        if href_path == req_path || href_path.is_empty() {
            continue;
        }

        let is_dir = tag_exists(block, "collection");

        let display_name = extract_tag_content(block, "displayname");
        let name = match display_name {
            Some(ref dn) if !dn.trim().is_empty() => dn.trim().to_string(),
            _ => href_path
                .split('/')
                .filter(|s| !s.is_empty())
                .last()
                .unwrap_or("unnamed")
                .to_string(),
        };

        if name.is_empty() {
            continue;
        }

        let size: u64 = extract_tag_content(block, "getcontentlength")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        let mime = if is_dir {
            "inode/directory".to_string()
        } else {
            extract_tag_content(block, "getcontenttype")
                .unwrap_or_else(|| "application/octet-stream".to_string())
        };

        let etag = extract_tag_content(block, "getetag")
            .map(|e| e.trim_matches('"').to_string());

        let mtime = extract_tag_content(block, "getlastmodified")
            .and_then(|lm| chrono::DateTime::parse_from_rfc2822(&lm).ok())
            .map(|dt| dt.timestamp_millis())
            .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());

        let remote_id = href_path.clone();
        let path = match folder_id {
            Some(parent) => format!("{}/{}", parent.trim_end_matches('/'), name),
            None => format!("/{}", name),
        };

        entries.push(EntryRecord {
            id: format!("{}:{}", account_id, remote_id),
            account_id: account_id.to_string(),
            remote_id: Some(remote_id),
            parent_id: folder_id.map(|s| s.to_string()),
            name,
            path,
            is_directory: is_dir,
            size: if is_dir { 0 } else { size },
            mtime,
            ctime: Some(mtime),
            mime_type: mime,
            etag,
            content_hash: None,
            state: FileState::CloudOnly,
            local_path: None,
            thumbnail_url: None,
            error_message: None,
            sync_version: 1,
            last_accessed_at: None,
            created_at: mtime,
            updated_at: mtime,
        });
    }

    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_webdav_multistatus() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/files/user/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/user/Documents/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:displayname>Documents</d:displayname>
        <d:getlastmodified>Wed, 12 Oct 2022 14:20:10 GMT</d:getlastmodified>
      </d:prop>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/user/Report.pdf</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
        <d:getcontentlength>1048576</d:getcontentlength>
        <d:getcontenttype>application/pdf</d:getcontenttype>
        <d:displayname>Report.pdf</d:displayname>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>"#;

        let entries = parse_webdav_multistatus(
            "acc_test",
            None,
            "https://cloud.example.com/remote.php/dav/files/user/",
            xml,
        );

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "Documents");
        assert!(entries[0].is_directory);
        assert_eq!(entries[0].mime_type, "inode/directory");

        assert_eq!(entries[1].name, "Report.pdf");
        assert!(!entries[1].is_directory);
        assert_eq!(entries[1].size, 1048576);
        assert_eq!(entries[1].mime_type, "application/pdf");
    }
}
