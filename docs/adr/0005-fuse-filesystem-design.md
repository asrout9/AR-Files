# ADR 0005: FUSE Filesystem Design & Streaming Hydration

## Status
Accepted

## Context
While the Cirrus Files GUI can display placeholders and trigger hydration on double-click, external applications (such as VS Code, LibreOffice, GIMP, bash/zsh, and media players) access files through the POSIX filesystem API (`open`, `read`, `write`, `stat`). Without OS-level integration, these programs cannot discover or read cloud-only placeholders.

## Decision
1. **User-Space Filesystem via FUSE (`fuser` crate)**:
   - Cirrus Files mounts each connected cloud account as a FUSE filesystem at `~/Cloud/<AccountName>` (configurable).
   - The FUSE driver reads directory structures, attributes, and permissions directly from the local SQLite database.
   - `lookup` and `getattr` return immediately with true file size, accurate `mtime`, and standard POSIX permissions without making network calls.

2. **Streaming Read Hydration**:
   - When an application executes `read(2)` on a `cloud_only` file:
     - The FUSE read handler requests high-priority hydration from the Hydration Manager.
     - If the file is already hydrating, `read` blocks on the downloaded chunk ring buffer or file offset, serving bytes as soon as they arrive over the wire (streaming playback).
     - If the network stalls or deadline is reached, returns `ETIMEDOUT` or `EIO` with a clear desktop notification instead of hanging the entire operating system kernel thread.

3. **Deadlock & UI Isolation**:
   - The FUSE daemon runs on a dedicated Tokio worker thread separate from the Tauri UI and SQLite write transactions.
   - Database reads in FUSE use read-only SQLite connections in WAL mode so FUSE operations cannot block GUI browsing.
   - Unmount is handled gracefully on process shutdown via `fusermount -u -z` (lazy unmount fallback).

## Consequences
- Any standard Linux application can read cloud files seamlessly.
- Requires `fuse3` package on the host system.
- Flatpak packaging requires appropriate `--filesystem` and `/dev/fuse` portal permissions (documented in packaging guide).
