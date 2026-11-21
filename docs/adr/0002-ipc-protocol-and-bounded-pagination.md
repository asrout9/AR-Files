# ADR 0002: IPC Protocol & Bounded Window Pagination

## Status
Accepted

## Context
When displaying directories containing tens or hundreds of thousands of entries (e.g. 100,000 files in a single folder), serializing and passing the entire dataset over the Tauri IPC channel from Rust to the WebKitGTK webview causes:
1. Multi-second JSON serialization and deserialization delays.
2. Webview memory spikes exceeding hundreds of megabytes.
3. Severe garbage collection pauses and frame drops (violating the 60 fps smooth scroll budget).
4. Potential IPC payload size limit violations.

## Decision
1. **Window-Based and Cursor-Based Range Pagination**:
   - The UI communicates viewing windows to the backend: `{ parent_id: string, offset: number, limit: number, sort_by: string, sort_direction: "asc" | "desc", filter?: string }`.
   - The backend reads exact ranges from SQLite using indexed queries:
     `SELECT ... FROM entries WHERE parent_id = ? ORDER BY ... LIMIT ? OFFSET ?`.
   - The frontend integrates `TanStack Virtual` to maintain virtualized DOM rows, rendering only elements visible in the viewport plus a small overscan buffer (e.g., 20–50 items).
   - Additional entries are lazily requested in chunks of 100–250 items.

2. **IPC Payload Bounding**:
   - No single IPC message between Rust and WebKitGTK may exceed 1 MB.
   - Batch responses return metadata objects stripped of superfluous internal fields.
   - Diff events (`entry_added`, `entry_updated`, `entry_removed`) are coalesced and emitted in micro-batches (e.g. at 50ms intervals) to avoid message floods.

3. **Total Item Count and Skeleton Metrics**:
   - The directory listing response returns `total_count`, enabling the virtual list to size its scrollbar accurately without fetching all records.
   - Placeholder rows are rendered instantaneously while the slice is retrieved.

## Consequences
- Navigating into a folder with 100,000 files paints initial visible rows in under 100ms.
- Memory consumption in the webview remains constant regardless of folder size.
- Scroll position and user selection state remain stable across background sync diffs.
