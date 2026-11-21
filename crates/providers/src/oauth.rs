use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::time::timeout;
use tracing::{error, info, warn};

use crate::credentials::CredentialsManager;
use cirrus_core::error::{CirrusError, Result};

pub const DEFAULT_GOOGLE_CLIENT_ID: &str =
    "923847291847-arfilesdesktopclientfedora.apps.googleusercontent.com";
pub const GOOGLE_AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const GOOGLE_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
pub const GOOGLE_DRIVE_SCOPE: &str = "https://www.googleapis.com/auth/drive";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
    pub token_type: String,
    pub scope: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PkceChallenge {
    pub verifier: String,
    pub challenge: String,
    pub state: String,
}

impl PkceChallenge {
    pub fn generate() -> Self {
        let mut verifier_bytes = Vec::with_capacity(32);
        verifier_bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
        verifier_bytes.extend_from_slice(uuid::Uuid::new_v4().as_bytes());

        let verifier = URL_SAFE_NO_PAD.encode(&verifier_bytes);

        let mut hasher = Sha256::new();
        hasher.update(verifier.as_bytes());
        let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());

        let state = uuid::Uuid::new_v4().to_string();

        Self {
            verifier,
            challenge,
            state,
        }
    }
}

pub struct GoogleOAuthFlow {
    client_id: String,
    client_secret: Option<String>,
    credentials_mgr: CredentialsManager,
}

impl GoogleOAuthFlow {
    pub fn new(credentials_mgr: CredentialsManager) -> Self {
        let client_id = std::env::var("GOOGLE_DRIVE_CLIENT_ID")
            .unwrap_or_else(|_| DEFAULT_GOOGLE_CLIENT_ID.to_string());
        let client_secret = std::env::var("GOOGLE_DRIVE_CLIENT_SECRET").ok();

        Self {
            client_id,
            client_secret,
            credentials_mgr,
        }
    }

    pub fn with_client(
        client_id: String,
        client_secret: Option<String>,
        credentials_mgr: CredentialsManager,
    ) -> Self {
        Self {
            client_id,
            client_secret,
            credentials_mgr,
        }
    }

    /// Performs the complete interactive OAuth 2.0 PKCE flow:
    /// 1. Spawns loopback HTTP server.
    /// 2. Launches browser with PKCE parameters.
    /// 3. Captures authorization code on loopback redirect.
    /// 4. Exchanges code for tokens.
    /// 5. Stores refresh token securely in Secret Service / Keyring.
    pub async fn execute_flow(&self, account_id: &str) -> Result<OAuthTokenResponse> {
        info!("Initiating Google Drive OAuth 2.0 PKCE authentication flow...");

        // 1. Bind ephemeral loopback listener
        let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| {
            CirrusError::Io(format!("Failed to bind loopback OAuth listener: {}", e))
        })?;
        let port = listener
            .local_addr()
            .map_err(|e| CirrusError::Io(e.to_string()))?
            .port();
        let redirect_uri = format!("http://127.0.0.1:{}", port);

        // 2. Generate PKCE verifier & challenge
        let pkce = PkceChallenge::generate();

        // 3. Build Auth URL
        let auth_url = format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
            GOOGLE_AUTH_ENDPOINT,
            urlencoding::encode(&self.client_id),
            urlencoding::encode(&redirect_uri),
            urlencoding::encode(GOOGLE_DRIVE_SCOPE),
            urlencoding::encode(&pkce.challenge),
            urlencoding::encode(&pkce.state)
        );

        info!("Launching browser for OAuth authorization at: {}", auth_url);

        // 4. Open default system browser via xdg-open
        let open_status = tokio::process::Command::new("xdg-open")
            .arg(&auth_url)
            .status()
            .await;
        if let Err(e) = open_status {
            warn!(
                "Failed to launch xdg-open: {}. Please visit auth URL manually: {}",
                e, auth_url
            );
        }

        // 5. Await incoming loopback redirect (120s timeout)
        let (mut socket, _) = timeout(Duration::from_secs(120), listener.accept())
            .await
            .map_err(|_| CirrusError::Timeout)?
            .map_err(|e| CirrusError::Io(format!("Failed to accept OAuth redirect: {}", e)))?;

        let mut buffer = [0u8; 4096];
        let bytes_read = socket
            .read(&mut buffer)
            .await
            .map_err(|e| CirrusError::Io(e.to_string()))?;
        let request_str = String::from_utf8_lossy(&buffer[..bytes_read]);

        // Parse HTTP request line for query params
        let (code, state) = parse_oauth_callback(&request_str)?;

        if state != pkce.state {
            let error_html = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n<html><body><h2>State Mismatch Error</h2></body></html>";
            let _ = socket.write_all(error_html.as_bytes()).await;
            return Err(CirrusError::Validation(
                "OAuth state mismatch detected".to_string(),
            ));
        }

        // Send Adwaita-styled success response to the browser
        let success_html = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n\
            <!DOCTYPE html>\
            <html lang=\"en\">\
            <head>\
              <meta charset=\"utf-8\">\
              <title>AR Files Authentication</title>\
              <style>\
                body { font-family: system-ui, -apple-system, sans-serif; background: #242424; color: #ffffff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }\
                .card { background: #303030; border: 1px solid #454545; border-radius: 12px; padding: 32px 40px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.4); max-width: 420px; }\
                h2 { color: #78aeed; margin-top: 0; }\
                p { color: #d0d0d0; font-size: 14px; line-height: 1.5; }\
              </style>\
            </head>\
            <body>\
              <div class=\"card\">\
                <h2>Connected to Google Drive</h2>\
                <p>Authentication succeeded! You can close this tab and return to AR Files.</p>\
              </div>\
            </body>\
            </html>";
        let _ = socket.write_all(success_html.as_bytes()).await;
        let _ = socket.flush().await;

        // 6. Exchange authorization code for tokens
        let token_resp = self
            .exchange_code(&code, &redirect_uri, &pkce.verifier)
            .await?;

        // 7. Store refresh token in keyring
        if let Some(ref refresh_token) = token_resp.refresh_token {
            let key = CredentialsManager::refresh_token_key(account_id);
            self.credentials_mgr.store_secret(&key, refresh_token)?;
            info!(
                "Stored Google Drive refresh token in keyring for account '{}'",
                account_id
            );
        }

        // Also store access token
        let access_key = CredentialsManager::access_token_key(account_id);
        self.credentials_mgr
            .store_secret(&access_key, &token_resp.access_token)?;

        Ok(token_resp)
    }

    /// Exchanges the received authorization code for tokens at Google's token endpoint.
    pub async fn exchange_code(
        &self,
        code: &str,
        redirect_uri: &str,
        verifier: &str,
    ) -> Result<OAuthTokenResponse> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| CirrusError::Io(e.to_string()))?;

        let mut params = vec![
            ("client_id", self.client_id.as_str()),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri),
            ("code_verifier", verifier),
        ];

        let secret_ref = self.client_secret.as_deref().unwrap_or("");
        if !secret_ref.is_empty() {
            params.push(("client_secret", secret_ref));
        }

        let resp = client
            .post(GOOGLE_TOKEN_ENDPOINT)
            .form(&params)
            .send()
            .await
            .map_err(|e| CirrusError::Network(format!("Token exchange request failed: {}", e)))?;

        if !resp.status().is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            error!("Google token exchange error: {}", err_text);
            return Err(CirrusError::Network(format!(
                "Token exchange failed: {}",
                err_text
            )));
        }

        let token_data: OAuthTokenResponse = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        Ok(token_data)
    }

    /// Refreshes an expired access token using the stored refresh token.
    pub async fn refresh_access_token(&self, account_id: &str) -> Result<String> {
        let key = CredentialsManager::refresh_token_key(account_id);
        let refresh_token = self.credentials_mgr.get_secret(&key)?.ok_or_else(|| {
            CirrusError::Authentication("No refresh token stored in Keyring".to_string())
        })?;

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| CirrusError::Io(e.to_string()))?;

        let mut params = vec![
            ("client_id", self.client_id.as_str()),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ];

        let secret_ref = self.client_secret.as_deref().unwrap_or("");
        if !secret_ref.is_empty() {
            params.push(("client_secret", secret_ref));
        }

        let resp = client
            .post(GOOGLE_TOKEN_ENDPOINT)
            .form(&params)
            .send()
            .await
            .map_err(|e| CirrusError::Network(format!("Token refresh request failed: {}", e)))?;

        if !resp.status().is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            warn!(
                "Google token refresh failed: {}. Account requires re-login.",
                err_text
            );
            return Err(CirrusError::Authentication(format!(
                "Refresh token invalid: {}",
                err_text
            )));
        }

        let token_data: OAuthTokenResponse = resp
            .json()
            .await
            .map_err(|e| CirrusError::Serialization(e.to_string()))?;

        let access_key = CredentialsManager::access_token_key(account_id);
        self.credentials_mgr
            .store_secret(&access_key, &token_data.access_token)?;

        Ok(token_data.access_token)
    }
}

/// Helper function to parse `code` and `state` parameters from raw HTTP GET request line.
fn parse_oauth_callback(request_str: &str) -> Result<(String, String)> {
    let first_line = request_str
        .lines()
        .next()
        .ok_or_else(|| CirrusError::Validation("Empty HTTP request".to_string()))?;

    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 || parts[0] != "GET" {
        return Err(CirrusError::Validation(
            "Invalid HTTP request line".to_string(),
        ));
    }

    let uri = parts[1];
    let query_str = uri.split('?').nth(1).unwrap_or("");

    let mut code = None;
    let mut state = None;

    for param in query_str.split('&') {
        let mut kv = param.split('=');
        if let (Some(k), Some(v)) = (kv.next(), kv.next()) {
            let decoded_val = urlencoding::decode(v).unwrap_or_default().to_string();
            if k == "code" {
                code = Some(decoded_val);
            } else if k == "state" {
                state = Some(decoded_val);
            }
        }
    }

    let code = code.ok_or_else(|| {
        CirrusError::Validation("Missing 'code' parameter in OAuth redirect".to_string())
    })?;
    let state = state.ok_or_else(|| {
        CirrusError::Validation("Missing 'state' parameter in OAuth redirect".to_string())
    })?;

    Ok((code, state))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pkce_challenge_generation() {
        let pkce = PkceChallenge::generate();
        assert!(!pkce.verifier.is_empty());
        assert!(!pkce.challenge.is_empty());
        assert!(!pkce.state.is_empty());
        assert_ne!(pkce.verifier, pkce.challenge);
    }

    #[test]
    fn test_parse_oauth_callback() {
        let req = "GET /?code=4%2F0AeaYSHD83921&state=test_state_1234 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        let (code, state) = parse_oauth_callback(req).unwrap();
        assert_eq!(code, "4/0AeaYSHD83921");
        assert_eq!(state, "test_state_1234");
    }
}
