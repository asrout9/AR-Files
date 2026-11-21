use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{info, warn};

use cirrus_core::error::Result;

pub const SERVICE_NAME: &str = "org.arfiles.ARFiles";

/// Credentials manager using the system Secret Service / Keyring with an in-memory fallback for testing.
#[derive(Clone)]
pub struct CredentialsManager {
    service: String,
    memory_store: Arc<RwLock<HashMap<String, String>>>,
}

impl Default for CredentialsManager {
    fn default() -> Self {
        Self::new(SERVICE_NAME)
    }
}

impl CredentialsManager {
    pub fn new(service: &str) -> Self {
        Self {
            service: service.to_string(),
            memory_store: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Stores a secret credential for an account (e.g. refresh_token or access_token).
    pub fn store_secret(&self, key: &str, secret: &str) -> Result<()> {
        let entry = keyring::Entry::new(&self.service, key);
        match entry {
            Ok(keyring_entry) => {
                if let Err(e) = keyring_entry.set_password(secret) {
                    warn!(
                        "Keyring set_password failed for key '{}': {}. Falling back to secure memory cache.",
                        key, e
                    );
                    self.memory_store
                        .write()
                        .insert(key.to_string(), secret.to_string());
                } else {
                    info!(
                        "Successfully saved credential for key '{}' to system Keyring",
                        key
                    );
                    self.memory_store
                        .write()
                        .insert(key.to_string(), secret.to_string());
                }
            }
            Err(e) => {
                warn!(
                    "Keyring entry creation failed for key '{}': {}. Storing in secure memory cache.",
                    key, e
                );
                self.memory_store
                    .write()
                    .insert(key.to_string(), secret.to_string());
            }
        }
        Ok(())
    }

    /// Retrieves a secret credential for an account.
    pub fn get_secret(&self, key: &str) -> Result<Option<String>> {
        // Check memory store first for rapid retrieval
        if let Some(secret) = self.memory_store.read().get(key) {
            return Ok(Some(secret.clone()));
        }

        let entry = keyring::Entry::new(&self.service, key);
        match entry {
            Ok(keyring_entry) => match keyring_entry.get_password() {
                Ok(secret) => {
                    self.memory_store
                        .write()
                        .insert(key.to_string(), secret.clone());
                    Ok(Some(secret))
                }
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(e) => {
                    warn!("Keyring get_password failed for key '{}': {}", key, e);
                    Ok(None)
                }
            },
            Err(e) => {
                warn!("Keyring entry lookup failed for key '{}': {}", key, e);
                Ok(None)
            }
        }
    }

    /// Deletes a stored secret credential.
    pub fn delete_secret(&self, key: &str) -> Result<()> {
        self.memory_store.write().remove(key);
        if let Ok(entry) = keyring::Entry::new(&self.service, key) {
            let _ = entry.delete_credential();
        }
        Ok(())
    }

    /// Generates the standard key name for an account's refresh token.
    pub fn refresh_token_key(account_id: &str) -> String {
        format!("{}:refresh_token", account_id)
    }

    /// Generates the standard key name for an account's access token.
    pub fn access_token_key(account_id: &str) -> String {
        format!("{}:access_token", account_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credentials_storage_and_retrieval() {
        let creds = CredentialsManager::new("org.arfiles.TestService");
        let key = CredentialsManager::refresh_token_key("acc_test_google");
        let secret = "1//04test_oauth_refresh_token_secret";

        creds.store_secret(&key, secret).unwrap();
        let retrieved = creds.get_secret(&key).unwrap();
        assert_eq!(retrieved, Some(secret.to_string()));

        creds.delete_secret(&key).unwrap();
        let after_delete = creds.get_secret(&key).unwrap();
        assert_eq!(after_delete, None);
    }
}
