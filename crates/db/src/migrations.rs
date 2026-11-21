use rusqlite::Connection;
use tracing::info;

use cirrus_core::error::{CirrusError, Result};

pub const CURRENT_SCHEMA_VERSION: i32 = 1;

pub fn apply_migrations(conn: &mut Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        );
        ",
    )
    .map_err(|e| CirrusError::Database(format!("Failed to create schema_migrations: {}", e)))?;

    let current_version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if current_version < 1 {
        info!("Applying migration v1 (initial schema with WAL, indexes, FTS5, and triggers)...");
        let tx = conn
            .transaction()
            .map_err(|e| CirrusError::Database(format!("Failed to start transaction: {}", e)))?;

        tx.execute_batch(
            "
            -- Accounts table
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                provider_type TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT,
                root_folder_id TEXT,
                quota_total INTEGER,
                quota_used INTEGER,
                sync_status TEXT NOT NULL,
                delta_token TEXT,
                mount_path TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            -- Files and Folders entries table
            CREATE TABLE IF NOT EXISTS entries (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                remote_id TEXT,
                parent_id TEXT,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                is_directory INTEGER NOT NULL,
                size INTEGER NOT NULL,
                mtime INTEGER NOT NULL,
                ctime INTEGER,
                mime_type TEXT NOT NULL,
                etag TEXT,
                content_hash TEXT,
                state TEXT NOT NULL,
                local_path TEXT,
                error_message TEXT,
                sync_version INTEGER NOT NULL DEFAULT 1,
                last_accessed_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            -- Indexes for sub-10ms directory listings and sorting
            CREATE INDEX IF NOT EXISTS idx_entries_parent_dir_name ON entries(parent_id, is_directory DESC, name COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_entries_parent_name ON entries(parent_id, name);
            CREATE INDEX IF NOT EXISTS idx_entries_parent_mtime ON entries(parent_id, mtime DESC);
            CREATE INDEX IF NOT EXISTS idx_entries_parent_size ON entries(parent_id, size DESC);
            CREATE INDEX IF NOT EXISTS idx_entries_state ON entries(state);
            CREATE INDEX IF NOT EXISTS idx_entries_account_remote ON entries(account_id, remote_id);
            CREATE INDEX IF NOT EXISTS idx_entries_account_path ON entries(account_id, path);
            CREATE INDEX IF NOT EXISTS idx_entries_eviction ON entries(state, last_accessed_at ASC);

            -- FTS5 full-text search index
            CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
                entry_id UNINDEXED,
                name,
                path
            );

            -- Triggers to synchronize FTS5 index automatically on insert/update/delete
            CREATE TRIGGER IF NOT EXISTS trg_entries_fts_insert AFTER INSERT ON entries BEGIN
                INSERT INTO entries_fts(entry_id, name, path)
                VALUES (new.id, new.name, new.path);
            END;

            CREATE TRIGGER IF NOT EXISTS trg_entries_fts_update AFTER UPDATE OF name, path ON entries BEGIN
                DELETE FROM entries_fts WHERE entry_id = old.id;
                INSERT INTO entries_fts(entry_id, name, path)
                VALUES (new.id, new.name, new.path);
            END;

            CREATE TRIGGER IF NOT EXISTS trg_entries_fts_delete AFTER DELETE ON entries BEGIN
                DELETE FROM entries_fts WHERE entry_id = old.id;
            END;

            -- Sync Journal table for crash recovery and atomic state tracking
            CREATE TABLE IF NOT EXISTS sync_journal (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                op_type TEXT NOT NULL,
                entry_id TEXT,
                source_path TEXT,
                destination_path TEXT,
                payload TEXT NOT NULL,
                status TEXT NOT NULL,
                bytes_transferred INTEGER NOT NULL DEFAULT 0,
                total_bytes INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_journal_status ON sync_journal(status, created_at ASC);
            CREATE INDEX IF NOT EXISTS idx_journal_account ON sync_journal(account_id);

            -- Hydration Queue table
            CREATE TABLE IF NOT EXISTS hydration_queue (
                id TEXT PRIMARY KEY,
                entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
                priority INTEGER NOT NULL DEFAULT 0,
                bytes_downloaded INTEGER NOT NULL DEFAULT 0,
                total_bytes INTEGER NOT NULL,
                status TEXT NOT NULL,
                part_file_path TEXT,
                started_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_hydration_priority ON hydration_queue(status, priority DESC, started_at ASC);

            -- Key-Value settings table (e.g. per-folder view modes, app configuration)
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Record migration version
            INSERT INTO schema_migrations (version, applied_at)
            VALUES (1, strftime('%s', 'now'));
            ",
        )
        .map_err(|e| CirrusError::Database(format!("Failed to execute migration v1: {}", e)))?;

        tx.commit()
            .map_err(|e| CirrusError::Database(format!("Failed to commit migration v1: {}", e)))?;
        info!("Migration v1 applied successfully.");
    }

    Ok(())
}
