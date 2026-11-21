use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::path::Path;
use tracing::info;

use crate::migrations::apply_migrations;
use cirrus_core::error::{CirrusError, Result};

#[derive(Clone)]
pub struct DatabasePool {
    pool: Pool<SqliteConnectionManager>,
}

impl DatabasePool {
    fn configure_connection(conn: &mut Connection) -> rusqlite::Result<()> {
        conn.busy_timeout(std::time::Duration::from_millis(5000))?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "cache_size", -64000)?; // 64MB cache
        conn.pragma_update(None, "temp_store", "MEMORY")?;
        Ok(())
    }

    /// Opens an isolated temporary database configured with WAL mode for testing.
    pub fn open_in_memory() -> Result<Self> {
        let unique_id = uuid::Uuid::new_v4();
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join(format!("cirrus_test_{}.db", unique_id));
        Self::open_at_path(db_path)
    }

    /// Opens or creates a persistent SQLite database at the specified path with WAL mode.
    pub fn open_at_path<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| CirrusError::Storage(format!("Failed to create db dir: {}", e)))?;
        }

        info!("Opening SQLite database at {}", path.display());

        // Initialize database file, WAL mode, and apply schema migrations with a single standalone connection
        {
            let mut conn = Connection::open(path)
                .map_err(|e| CirrusError::Database(format!("Failed to open db for init: {}", e)))?;
            conn.query_row("PRAGMA journal_mode = WAL", [], |_| Ok(()))
                .map_err(|e| CirrusError::Database(format!("Failed to set WAL mode: {}", e)))?;
            Self::configure_connection(&mut conn).map_err(|e| {
                CirrusError::Database(format!("Failed to configure initial connection: {}", e))
            })?;
            apply_migrations(&mut conn)?;
        }

        let manager = SqliteConnectionManager::file(path).with_init(|conn: &mut Connection| {
            Self::configure_connection(conn)?;
            Ok(())
        });

        let pool = Pool::builder()
            .max_size(8)
            .min_idle(Some(1))
            .build(manager)
            .map_err(|e| CirrusError::Database(format!("Failed to build pool: {}", e)))?;

        Ok(Self { pool })
    }

    pub fn get(&self) -> Result<r2d2::PooledConnection<SqliteConnectionManager>> {
        self.pool.get().map_err(|e| {
            CirrusError::Database(format!("Failed to get connection from pool: {}", e))
        })
    }
}
