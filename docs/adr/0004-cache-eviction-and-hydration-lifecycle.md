# ADR 0004: Cache Eviction, Hydration Lifecycle & Crash Recovery

## Status
Accepted

## Context
Linux does not have a native Windows Cloud Files API (which provides kernel-level placeholder stubs out-of-the-box). Cirrus Files manages placeholders and cached file replicas on local disk. Local disk space is finite; therefore, cached content must be managed through disciplined hydration, verification, eviction, and crash-resilient journaling.

## Decision
1. **File State Lifecycle**:
   Every item tracked by Cirrus Files is in exactly one of the following states:
   - `cloud_only`: Metadata known, zero bytes on local disk (placeholder).
   - `hydrating`: Active download in progress, byte-range chunks written to `.part` file.
   - `available`: Cached locally and verified against checksum; safe to evict when disk space is needed.
   - `pinned`: Explicitly marked "Always keep on this device". Never evict under any cache pressure.
   - `syncing_up`: Local modifications queued or actively streaming to cloud provider.
   - `conflict`: Fork detected (simultaneous edits on multiple devices). Safe copy created.
   - `error`: Failed operation with error code; retryable.
   - `excluded`: Explicitly excluded by user sync filters.

2. **Hydration Engine**:
   - Priority Queue:
     1. User-initiated interactive file open (immediate high priority).
     2. Explicit pin requests (batch high priority).
     3. Prefetch hints (low background priority).
   - Downloads write to a staging file: `<cache_dir>/hydrating/<entry_id>.part`.
   - Checksum validation: Once download completes, verify SHA256 / provider hash.
   - Atomic rename: Rename `.part` to `<cache_dir>/content/<entry_id>`.
   - SQLite update: Set state to `available` (or `pinned`), update `local_path` and `updated_at`.

3. **LRU Eviction Engine**:
   - Eviction policy runs when local cache exceeds user quota (default 20 GB or 80% free disk threshold).
   - Candidate selection:
     `SELECT id, local_path, size FROM entries WHERE state = 'available' ORDER BY last_accessed_at ASC LIMIT 100`.
   - Invariant: Never evict `pinned` items, items with state `syncing_up`, or items in `sync_journal`.
   - Eviction removes the local file and reverts state to `cloud_only`.

4. **Crash Safety & Journaling**:
   - Every file mutation or transfer logs an intent entry into `sync_journal` within SQLite before starting physical I/O.
   - Upon process restart, an integrity scanner inspects the journal:
     - Unfinished `.part` files are checked for resumption or cleaned up.
     - Interrupted uploads are requeued.
     - Completed atomic renames without finalized state updates are reconciled.

## Consequences
- Guaranteed zero data loss during power cuts or crashes.
- Bounded local disk usage without user intervention.
- Immediate rollback or resume on restart.
