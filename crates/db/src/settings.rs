use rusqlite::params;
use serde::{de::DeserializeOwned, Serialize};

use crate::pool::DatabasePool;
use cirrus_core::error::{CirrusError, Result};

#[derive(Clone)]
pub struct SettingsRepository {
    pool: DatabasePool,
}

impl SettingsRepository {
    pub fn new(pool: DatabasePool) -> Self {
        Self { pool }
    }

    pub fn get_string(&self, key: &str) -> Result<Option<String>> {
        let conn = self.pool.get()?;
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let mut rows = stmt
            .query_map(params![key], |row| row.get::<_, String>(0))
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        if let Some(row) = rows.next() {
            row.map(Some)
                .map_err(|e| CirrusError::Database(e.to_string()))
        } else {
            Ok(None)
        }
    }

    pub fn set_string(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| CirrusError::Database(e.to_string()))?;
        Ok(())
    }

    pub fn get_json<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>> {
        if let Some(s) = self.get_string(key)? {
            let parsed = serde_json::from_str(&s).map_err(|e| {
                CirrusError::Validation(format!("Invalid json for key '{}': {}", key, e))
            })?;
            Ok(Some(parsed))
        } else {
            Ok(None)
        }
    }

    pub fn set_json<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        let serialized = serde_json::to_string(value).map_err(|e| {
            CirrusError::Validation(format!("Failed to serialize setting '{}': {}", key, e))
        })?;
        self.set_string(key, &serialized)
    }

    pub fn delete(&self, key: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM settings WHERE key = ?1", params![key])
            .map_err(|e| CirrusError::Database(e.to_string()))?;
        Ok(())
    }
}
