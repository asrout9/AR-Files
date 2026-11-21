# ADR 0003: Cloud Provider Architecture & Backend Strategy

## Status
Accepted

## Context
Cirrus Files must integrate multiple cloud storage services: Google Drive, Microsoft OneDrive, Dropbox, WebDAV, Nextcloud, SFTP, and S3-compatible endpoints. Writing custom API clients from scratch for every provider is error-prone, duplicates maintenance, and slows down feature delivery. However, providers have vastly different capabilities (e.g. Google Drive and OneDrive support change tokens / delta feeds, while basic SFTP or WebDAV requires polling or mtime comparison).

## Decision
1. **Async CloudProvider Trait**:
   - Define a unified async `CloudProvider` trait in `crates/providers` with operations:
     `list_children`, `get_metadata`, `changes`, `download`, `upload`, `create_folder`, `rename`, `move_entry`, `copy_entry`, `delete_entry`, `restore`, `quota`, `share_link`.
   - Each provider implementation exposes a `ProviderCapabilities` bitflags struct:
     - `SUPPORTS_DELTA`: Has efficient change-feed API (e.g. Google Drive `changes.list`, OneDrive `delta`).
     - `SUPPORTS_RESUMABLE_UPLOAD`: Can resume interrupted file uploads via byte ranges.
     - `SUPPORTS_SERVER_SIDE_COPY`: Can duplicate files server-side without streaming bytes locally.
     - `SUPPORTS_TRASH`: Supports non-permanent deletion to provider recycle bin.
     - `SUPPORTS_VERSIONS`: Supports file version history.

2. **Backend Strategy**:
   - **Phase 1-2**: Native Mock Provider for deterministic latency, failure injection, rate limit testing, and CI verification.
   - **Phase 3-4**: Native Google Drive and OneDrive adapters using direct REST/JSON APIs because delta synchronization is critical to the stale-while-revalidate guarantees.
   - **Phase 4+**: Rclone bridge (`rclone rcd` supervised process or OpenDAL) behind the `CloudProvider` trait for generic connectors (WebDAV, Nextcloud, S3, Dropbox, SFTP) to gain broad provider coverage without hand-crafting each wire protocol.

3. **Authentication**:
   - OAuth 2.0 Authorization Code Flow with PKCE (`RFC 7636`).
   - Ephemeral loopback HTTP redirect listener on a random unprivileged port (e.g., `127.0.0.1:0`).
   - Launch default system browser via XDG desktop portal.
   - Secure token storage via Freedesktop Secret Service (GNOME Keyring / `keyring` crate).
   - Per-account circuit breaker: token revocation or network disconnect isolates that account and marks it 'Action Required', never impacting other configured accounts.

## Consequences
- Clean separation between sync engine logic and provider network wire formats.
- High testability: sync engine, hydration manager, and upload queue can be verified against `MockCloudProvider` without external network dependencies.
