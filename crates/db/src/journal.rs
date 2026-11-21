use rusqlite::{params, Row};

use crate::pool::DatabasePool;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::journal::{JobStatus, JournalOpType, JournalRecord};

#[derive(Clone)]
pub struct JournalRepository {
    pool: DatabasePool,
}

impl JournalRepository {
    pub fn new(pool: DatabasePool) -> Self {
        Self { pool }
    }

    fn row_to_journal(row: &Row) -> rusqlite::Result<JournalRecord> {
        let op_str: String = row.get("op_type")?;
        let op_type = match op_str.as_str() {
            "download" => JournalOpType::Download,
            "upload" => JournalOpType::Upload,
            "copy" => JournalOpType::Copy,
            "move" => JournalOpType::Move,
            "delete" => JournalOpType::Delete,
            "trash" => JournalOpType::Trash,
            "restore" => JournalOpType::Restore,
            "rename" => JournalOpType::Rename,
            _ => JournalOpType::Evict,
        };

        let status_str: String = row.get("status")?;
        let status = match status_str.as_str() {
            "pending" => JobStatus::Pending,
            "running" => JobStatus::Running,
            "completed" => JobStatus::Completed,
            "failed" => JobStatus::Failed,
            "paused" => JobStatus::Paused,
            _ => JobStatus::Cancelled,
        };

        Ok(JournalRecord {
            id: row.get("id")?,
            account_id: row.get("account_id")?,
            op_type,
            entry_id: row.get("entry_id")?,
            source_path: row.get("source_path")?,
            destination_path: row.get("destination_path")?,
            payload: row.get("payload")?,
            status,
            bytes_transferred: row.get::<_, i64>("bytes_transferred")? as u64,
            total_bytes: row.get::<_, i64>("total_bytes")? as u64,
            error_message: row.get("error_message")?,
            retry_count: row.get::<_, i64>("retry_count")? as u32,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }

    pub fn record_intent(&self, record: &JournalRecord) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute(
            "
            INSERT INTO sync_journal (
                id, account_id, op_type, entry_id, source_path,
                destination_path, payload, status, bytes_transferred,
                total_bytes, error_message, retry_count, created_at, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5,
                ?6, ?7, ?8, ?9,
                ?10, ?11, ?12, ?13, ?14
            )
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                bytes_transferred = excluded.bytes_transferred,
                error_message = excluded.error_message,
                retry_count = excluded.retry_count,
                updated_at = excluded.updated_at
            ",
            params![
                record.id,
                record.account_id,
                record.op_type.as_str(),
                record.entry_id,
                record.source_path,
                record.destination_path,
                record.payload,
                record.status.as_str(),
                record.bytes_transferred as i64,
                record.total_bytes as i64,
                record.error_message,
                record.retry_count as i64,
                record.created_at,
                record.updated_at,
            ],
        )
        .map_err(|e| CirrusError::Database(format!("Failed to record journal intent: {}", e)))?;

        Ok(())
    }

    pub fn update_progress(
        &self,
        id: &str,
        bytes_transferred: u64,
        status: JobStatus,
    ) -> Result<()> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE sync_journal SET bytes_transferred = ?1, status = ?2, updated_at = ?3 WHERE id = ?4",
            params![bytes_transferred as i64, status.as_str(), now, id],
        )
        .map_err(|e| CirrusError::Database(e.to_string()))?;
        Ok(())
    }

    pub fn mark_completed(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE sync_journal SET status = 'completed', updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )
        .map_err(|e| CirrusError::Database(e.to_string()))?;
        Ok(())
    }

    pub fn get_uncompleted_jobs(&self) -> Result<Vec<JournalRecord>> {
        let conn = self.pool.get()?;
        let mut stmt = conn
            .prepare(
                "SELECT * FROM sync_journal WHERE status IN ('pending', 'running') ORDER BY created_at ASC",
            )
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let rows = stmt
            .query_map([], Self::row_to_journal)
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let mut jobs = Vec::new();
        for r in rows {
            jobs.push(r.map_err(|e| CirrusError::Database(e.to_string()))?);
        }
        Ok(jobs)
    }

    pub fn delete_job(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM sync_journal WHERE id = ?1", params![id])
            .map_err(|e| CirrusError::Database(e.to_string()))?;
        Ok(())
    }
}
