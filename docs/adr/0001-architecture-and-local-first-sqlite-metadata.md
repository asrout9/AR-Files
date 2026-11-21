# ADR 0001: Architecture, Repository Layout & Local-First SQLite Metadata

## Status
Accepted

## Context
Standard desktop file managers (such as GNOME Files / Nautilus with GVfs and Google Online Accounts) freeze the UI thread when cloud or network mounts experience packet loss, captive portals, rate limits, or high latency. In Nautilus, directory listing and `stat(2)` calls are executed synchronously or blocking on paths that feed the user interface.

Cirrus Files / AR Files aims to replace Nautilus for users mounting cloud and remote storage, delivering the responsiveness of Windows File Explorer with cloud files:
1. Instant browsing of cached directory hierarchies.
2. Placeholder files (zero bytes local disk occupancy, real size presented).
3. On-demand hydration in the background.
4. Guaranteed non-blocking UI under all network and remote mount conditions.

## Decision
1. **Workspace Architecture**:
   The application is organized into a modular Rust workspace with decoupled crates:
   - `crates/core`: Core domain types, state machines, typed errors, identifiers.
   - `crates/db`: Local-first SQLite database layer with WAL mode, FTS5 virtual tables, migrations, and bounded pagination.
   - `crates/providers`: Provider-agnostic `CloudProvider` trait, capabilities, native adapters, and mock provider.
   - `crates/sync`: Sync engine, delta revalidation, hydration manager, priority queue, and upload worker.
   - `crates/ops`: Operations engine (copy, move, delete, trash, undo/redo).
   - `crates/platform`: Freedesktop integration (D-Bus, udisks2, trash, XDG portals, Secret Service, thumbnails).
   - `crates/vfs`: User-space FUSE filesystem (Phase 5) for OS-wide file access.
   - `src-tauri`: Thin Tauri 2 IPC and event dispatch layer.
   - `ui`: React 18 + TypeScript strict webview interface styled with native libadwaita tokens.

2. **Local-First SQLite Metadata**:
   - All folder listings, file attributes, search queries, and sorting are executed strictly against local SQLite tables.
   - The database is configured with:
     - `PRAGMA journal_mode = WAL;` (high concurrency, readers do not block writers).
     - `PRAGMA synchronous = NORMAL;` (durable and performant with WAL).
     - `PRAGMA foreign_keys = ON;`
     - `PRAGMA busy_timeout = 5000;`
   - Indexes:
     - `(parent_id, name)` for directory listings and uniqueness within a folder.
     - `(parent_id, mtime)` for sorted directory views.
     - `(state)` for querying files requiring hydration, upload, or attention.
     - `(account_id, remote_id)` for delta synchronization lookups.
   - Instant Search:
     - SQLite FTS5 table `entries_fts` maintaining full-text index on filename and relative path.
   - Crash Resilience:
     - `sync_journal` table tracking file operations across crashes. In-flight operations are resumed or rolled back atomically.

3. **Stale-While-Revalidate**:
   - Opening a folder reads cached entries from SQLite in `< 10ms`.
   - If a folder is marked stale, a background task queues provider reconciliation (`changes` / `list_children`).
   - When updates arrive, changes are committed in a single SQLite transaction and a diff event is published to the UI.

## Consequences
- The UI never encounters a blocking network operation when navigating folders.
- Initial crawl of large remote drives must be staged incrementally (breadth-first), showing an 'indexing' indicator on partially synced branches.
- Local disk storage must accommodate SQLite metadata and thumbnail cache, bounded by configurable limits.
