use rusqlite::{params, Row};

use crate::pool::DatabasePool;
use cirrus_core::account::{AccountRecord, AccountSyncStatus, ProviderType};
use cirrus_core::error::{CirrusError, Result};

#[derive(Clone)]
pub struct AccountRepository {
    pool: DatabasePool,
}

impl AccountRepository {
    pub fn new(pool: DatabasePool) -> Self {
        Self { pool }
    }

    fn row_to_account(row: &Row) -> rusqlite::Result<AccountRecord> {
        let provider_str: String = row.get("provider_type")?;
        let provider_type = match provider_str.as_str() {
            "google_drive" => ProviderType::GoogleDrive,
            "onedrive" => ProviderType::OneDrive,
            "dropbox" => ProviderType::Dropbox,
            "nextcloud" => ProviderType::Nextcloud,
            "webdav" => ProviderType::WebDAV,
            "s3" => ProviderType::S3,
            "local" => ProviderType::Local,
            _ => ProviderType::Mock,
        };

        let status_str: String = row.get("sync_status")?;
        let sync_status = match status_str.as_str() {
            "idle" => AccountSyncStatus::Idle,
            "indexing" => AccountSyncStatus::Indexing,
            "syncing" => AccountSyncStatus::Syncing,
            "paused" => AccountSyncStatus::Paused,
            "offline" => AccountSyncStatus::Offline,
            "action_required" => AccountSyncStatus::ActionRequired,
            _ => AccountSyncStatus::Error,
        };

        Ok(AccountRecord {
            id: row.get("id")?,
            provider_type,
            name: row.get("name")?,
            email: row.get("email")?,
            root_folder_id: row.get("root_folder_id")?,
            quota_total: row.get::<_, Option<i64>>("quota_total")?.map(|v| v as u64),
            quota_used: row.get::<_, Option<i64>>("quota_used")?.map(|v| v as u64),
            sync_status,
            delta_token: row.get("delta_token")?,
            mount_path: row.get("mount_path")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }

    pub fn upsert_account(&self, account: &AccountRecord) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute(
            "
            INSERT INTO accounts (
                id, provider_type, name, email, root_folder_id,
                quota_total, quota_used, sync_status, delta_token, mount_path,
                created_at, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5,
                ?6, ?7, ?8, ?9, ?10,
                ?11, ?12
            )
            ON CONFLICT(id) DO UPDATE SET
                provider_type = excluded.provider_type,
                name = excluded.name,
                email = excluded.email,
                root_folder_id = excluded.root_folder_id,
                quota_total = excluded.quota_total,
                quota_used = excluded.quota_used,
                sync_status = excluded.sync_status,
                delta_token = excluded.delta_token,
                mount_path = excluded.mount_path,
                updated_at = excluded.updated_at
            ",
            params![
                account.id,
                account.provider_type.as_str(),
                account.name,
                account.email,
                account.root_folder_id,
                account.quota_total.map(|v| v as i64),
                account.quota_used.map(|v| v as i64),
                account.sync_status.as_str(),
                account.delta_token,
                account.mount_path,
                account.created_at,
                account.updated_at,
            ],
        )
        .map_err(|e| CirrusError::Database(format!("Upsert account failed: {}", e)))?;

        Ok(())
    }

    pub fn get_account(&self, id: &str) -> Result<Option<AccountRecord>> {
        let conn = self.pool.get()?;
        let mut stmt = conn
            .prepare("SELECT * FROM accounts WHERE id = ?1")
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let mut rows = stmt
            .query_map(params![id], Self::row_to_account)
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        if let Some(row) = rows.next() {
            row.map(Some)
                .map_err(|e| CirrusError::Database(e.to_string()))
        } else {
            Ok(None)
        }
    }

    pub fn list_accounts(&self) -> Result<Vec<AccountRecord>> {
        let conn = self.pool.get()?;
        let mut stmt = conn
            .prepare("SELECT * FROM accounts ORDER BY created_at ASC")
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let rows = stmt
            .query_map([], Self::row_to_account)
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let mut accounts = Vec::new();
        for r in rows {
            accounts.push(r.map_err(|e| CirrusError::Database(e.to_string()))?);
        }
        Ok(accounts)
    }

    pub fn update_sync_status(
        &self,
        id: &str,
        status: AccountSyncStatus,
        delta_token: Option<&str>,
    ) -> Result<()> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            "
            UPDATE accounts SET
                sync_status = ?1,
                delta_token = COALESCE(?2, delta_token),
                updated_at = ?3
            WHERE id = ?4
            ",
            params![status.as_str(), delta_token, now, id],
        )
        .map_err(|e| CirrusError::Database(format!("Failed to update sync status: {}", e)))?;

        Ok(())
    }

    pub fn update_account_quota(&self, id: &str, total: u64, used: u64) -> Result<()> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            "
            UPDATE accounts SET
                quota_total = ?1,
                quota_used = ?2,
                updated_at = ?3
            WHERE id = ?4
            ",
            params![total as i64, used as i64, now, id],
        )
        .map_err(|e| CirrusError::Database(format!("Failed to update account quota: {}", e)))?;

        Ok(())
    }

    pub fn delete_account(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])
            .map_err(|e| CirrusError::Database(format!("Delete account failed: {}", e)))?;
        Ok(())
    }
}
