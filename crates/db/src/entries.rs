use rusqlite::{params, Connection, Row};
use std::str::FromStr;

use crate::pool::DatabasePool;
use cirrus_core::entry::EntryRecord;
use cirrus_core::error::{CirrusError, Result};
use cirrus_core::query::{FolderListingQuery, PagedResult, SortDirection, SortField};
use cirrus_core::state::FileState;

#[derive(Clone)]
pub struct EntryRepository {
    pool: DatabasePool,
}

impl EntryRepository {
    pub fn new(pool: DatabasePool) -> Self {
        Self { pool }
    }

    fn row_to_entry(row: &Row) -> rusqlite::Result<EntryRecord> {
        let state_str: String = row.get("state")?;
        let state = FileState::from_str(&state_str).map_err(|_| rusqlite::Error::InvalidQuery)?;

        let is_dir_int: i64 = row.get("is_directory")?;

        Ok(EntryRecord {
            id: row.get("id")?,
            account_id: row.get("account_id")?,
            remote_id: row.get("remote_id")?,
            parent_id: row.get("parent_id")?,
            name: row.get("name")?,
            path: row.get("path")?,
            is_directory: is_dir_int != 0,
            size: row.get::<_, i64>("size")? as u64,
            mtime: row.get("mtime")?,
            ctime: row.get("ctime")?,
            mime_type: row.get("mime_type")?,
            etag: row.get("etag")?,
            content_hash: row.get("content_hash")?,
            state,
            local_path: row.get("local_path")?,
            error_message: row.get("error_message")?,
            sync_version: row.get("sync_version")?,
            last_accessed_at: row.get("last_accessed_at")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }

    pub fn upsert_entry(&self, entry: &EntryRecord) -> Result<()> {
        let conn = self.pool.get()?;
        Self::execute_upsert(&conn, entry)
    }

    pub fn upsert_entries_batch(&self, entries: &[EntryRecord]) -> Result<()> {
        let mut conn = self.pool.get()?;
        let tx = conn
            .transaction()
            .map_err(|e| CirrusError::Database(format!("Failed to begin tx: {}", e)))?;

        for entry in entries {
            Self::execute_upsert(&tx, entry)?;
        }

        tx.commit()
            .map_err(|e| CirrusError::Database(format!("Failed to commit batch: {}", e)))?;
        Ok(())
    }

    fn execute_upsert(conn: &Connection, entry: &EntryRecord) -> Result<()> {
        conn.execute(
            "
            INSERT INTO entries (
                id, account_id, remote_id, parent_id, name, path,
                is_directory, size, mtime, ctime, mime_type, etag,
                content_hash, state, local_path, error_message,
                sync_version, last_accessed_at, created_at, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                ?7, ?8, ?9, ?10, ?11, ?12,
                ?13, ?14, ?15, ?16,
                ?17, ?18, ?19, ?20
            )
            ON CONFLICT(id) DO UPDATE SET
                account_id = excluded.account_id,
                remote_id = excluded.remote_id,
                parent_id = excluded.parent_id,
                name = excluded.name,
                path = excluded.path,
                is_directory = excluded.is_directory,
                size = excluded.size,
                mtime = excluded.mtime,
                ctime = excluded.ctime,
                mime_type = excluded.mime_type,
                etag = excluded.etag,
                content_hash = excluded.content_hash,
                state = excluded.state,
                local_path = excluded.local_path,
                error_message = excluded.error_message,
                sync_version = entries.sync_version + 1,
                last_accessed_at = excluded.last_accessed_at,
                updated_at = excluded.updated_at
            ",
            params![
                entry.id,
                entry.account_id,
                entry.remote_id,
                entry.parent_id,
                entry.name,
                entry.path,
                if entry.is_directory { 1 } else { 0 },
                entry.size as i64,
                entry.mtime,
                entry.ctime,
                entry.mime_type,
                entry.etag,
                entry.content_hash,
                entry.state.as_str(),
                entry.local_path,
                entry.error_message,
                entry.sync_version,
                entry.last_accessed_at,
                entry.created_at,
                entry.updated_at,
            ],
        )
        .map_err(|e| {
            CirrusError::Database(format!("Upsert failed for entry '{}': {}", entry.id, e))
        })?;

        Ok(())
    }

    pub fn get_entry(&self, id: &str) -> Result<Option<EntryRecord>> {
        let conn = self.pool.get()?;
        let mut stmt = conn
            .prepare("SELECT * FROM entries WHERE id = ?1")
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let mut rows = stmt
            .query_map(params![id], Self::row_to_entry)
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        if let Some(row) = rows.next() {
            row.map(Some)
                .map_err(|e| CirrusError::Database(e.to_string()))
        } else {
            Ok(None)
        }
    }

    pub fn get_entry_by_remote_id(
        &self,
        account_id: &str,
        remote_id: &str,
    ) -> Result<Option<EntryRecord>> {
        let conn = self.pool.get()?;
        let mut stmt = conn
            .prepare("SELECT * FROM entries WHERE account_id = ?1 AND remote_id = ?2")
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let mut rows = stmt
            .query_map(params![account_id, remote_id], Self::row_to_entry)
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        if let Some(row) = rows.next() {
            row.map(Some)
                .map_err(|e| CirrusError::Database(e.to_string()))
        } else {
            Ok(None)
        }
    }

    pub fn list_children_paged(
        &self,
        query: &FolderListingQuery,
    ) -> Result<PagedResult<EntryRecord>> {
        let conn = self.pool.get()?;

        let mut where_clauses = Vec::new();
        let mut count_clauses = Vec::new();

        if let Some(ref pid) = query.parent_id {
            where_clauses.push(format!("parent_id = '{}'", pid.replace('\'', "''")));
            count_clauses.push(format!("parent_id = '{}'", pid.replace('\'', "''")));
        } else {
            where_clauses.push("parent_id IS NULL".to_string());
            count_clauses.push("parent_id IS NULL".to_string());
        }

        if let Some(ref aid) = query.account_id {
            where_clauses.push(format!("account_id = '{}'", aid.replace('\'', "''")));
            count_clauses.push(format!("account_id = '{}'", aid.replace('\'', "''")));
        }

        if !query.show_hidden {
            where_clauses.push("name NOT LIKE '.%'".to_string());
            count_clauses.push("name NOT LIKE '.%'".to_string());
        }

        if let Some(ref filter) = query.filter {
            if !filter.trim().is_empty() {
                let sanitized = filter.replace('\'', "''");
                where_clauses.push(format!("name LIKE '%{}%'", sanitized));
                count_clauses.push(format!("name LIKE '%{}%'", sanitized));
            }
        }

        let where_sql = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };

        // Total count
        let count_sql = format!("SELECT COUNT(*) FROM entries {}", where_sql);
        let total_count: usize = conn
            .query_row(&count_sql, [], |row| row.get(0))
            .map_err(|e| CirrusError::Database(format!("Count query failed: {}", e)))?;

        // Order by: folders first, then chosen field
        let sort_column = match query.sort_by {
            SortField::Name => "name COLLATE NOCASE",
            SortField::Size => "size",
            SortField::Modified => "mtime",
            SortField::Created => "ctime",
            SortField::Type => "mime_type",
            SortField::State => "state",
        };

        let sort_dir = match query.sort_direction {
            SortDirection::Asc => "ASC",
            SortDirection::Desc => "DESC",
        };

        let list_sql = format!(
            "SELECT * FROM entries {} ORDER BY is_directory DESC, {} {} LIMIT {} OFFSET {}",
            where_sql, sort_column, sort_dir, query.limit, query.offset
        );

        let mut stmt = conn
            .prepare(&list_sql)
            .map_err(|e| CirrusError::Database(format!("List prepare failed: {}", e)))?;

        let rows = stmt
            .query_map([], Self::row_to_entry)
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r.map_err(|e| CirrusError::Database(e.to_string()))?);
        }

        let has_more = query.offset + items.len() < total_count;

        Ok(PagedResult {
            items,
            total_count,
            offset: query.offset,
            limit: query.limit,
            has_more,
        })
    }

    /// Full-text search over indexed filenames and paths using SQLite FTS5.
    pub fn search_fts(&self, search_term: &str, limit: usize) -> Result<Vec<EntryRecord>> {
        let conn = self.pool.get()?;
        let sanitized = search_term.replace('"', "\"\"").trim().to_string();
        if sanitized.is_empty() {
            return Ok(Vec::new());
        }

        // Prefix matching query for instant search-as-you-type
        let fts_query = format!("\"{}\"*", sanitized);

        let sql = "
            SELECT e.* FROM entries_fts fts
            JOIN entries e ON e.id = fts.entry_id
            WHERE entries_fts MATCH ?1
            ORDER BY rank
            LIMIT ?2
        ";

        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| CirrusError::Database(format!("FTS prepare failed: {}", e)))?;

        let rows = stmt
            .query_map(params![fts_query, limit as i64], Self::row_to_entry)
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r.map_err(|e| CirrusError::Database(e.to_string()))?);
        }

        Ok(results)
    }

    pub fn update_state(
        &self,
        id: &str,
        new_state: FileState,
        local_path: Option<&str>,
        error_message: Option<&str>,
    ) -> Result<()> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            "
            UPDATE entries SET
                state = ?1,
                local_path = COALESCE(?2, local_path),
                error_message = ?3,
                updated_at = ?4
            WHERE id = ?5
            ",
            params![new_state.as_str(), local_path, error_message, now, id],
        )
        .map_err(|e| CirrusError::Database(format!("Update state failed for '{}': {}", id, e)))?;

        Ok(())
    }

    pub fn record_access(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE entries SET last_accessed_at = ?1 WHERE id = ?2",
            params![now, id],
        )
        .map_err(|e| CirrusError::Database(e.to_string()))?;
        Ok(())
    }

    /// Selects candidate files eligible for LRU cache eviction (state = 'available').
    pub fn get_evictable_entries(&self, limit: usize) -> Result<Vec<EntryRecord>> {
        let conn = self.pool.get()?;
        let sql = "
            SELECT * FROM entries
            WHERE state = 'available' AND is_directory = 0
            ORDER BY COALESCE(last_accessed_at, mtime) ASC
            LIMIT ?1
        ";

        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let rows = stmt
            .query_map(params![limit as i64], Self::row_to_entry)
            .map_err(|e| CirrusError::Database(e.to_string()))?;

        let mut results = Vec::new();
        for r in rows {
            results.push(r.map_err(|e| CirrusError::Database(e.to_string()))?);
        }

        Ok(results)
    }

    pub fn delete_entry(&self, id: &str) -> Result<()> {
        let conn = self.pool.get()?;
        conn.execute("DELETE FROM entries WHERE id = ?1", params![id])
            .map_err(|e| CirrusError::Database(format!("Delete failed: {}", e)))?;
        Ok(())
    }
}
