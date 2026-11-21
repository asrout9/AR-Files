# AR Files

> **Cloud-native, freeze-proof desktop file manager for Fedora Workstation (GNOME 50 / Libadwaita).**
> Built with Rust, Tauri 2, and React + TypeScript.

---

## 1. Problem & Mission

In standard GNOME Files (Nautilus), opening remote cloud folders (GVfs, Google Drive, OneDrive, WebDAV) performs synchronous metadata fetches and `stat` calls directly on the UI path. When a remote mount is slow, rate-limited, or offline, the entire Nautilus interface freezes, spins, and stops responding.

**AR Files makes this class of freeze architecturally impossible.**

### Architectural Invariants:
1. **Local-first SQLite metadata**: All folder trees, mtimes, sizes, states, and provider IDs are stored locally in SQLite (`WAL` mode). Directory listings, sorting, and filtering read exclusively from the local DB. Opening a folder *never* blocks on network I/O.
2. **Stale-while-revalidate**: Displays cached listings immediately (<15ms), refreshes provider deltas in the background, and pushes differential updates without scroll jumping or loss of selection.
3. **On-demand hydration & sparse placeholders**: Remote files appear as zero-block placeholders reporting real remote byte sizes. Access triggers streaming, resumable background downloads with progress emblems.
4. **Resilience & Circuit Breakers**: Bounded thread pools, timeouts, and exponential backoff prevent hung deadlocks on unreachable mounts.
5. **Two-Layer Virtual File Access**:
   - **Layer A**: In-app virtual namespace with instant search, multi-selection, and context actions.
   - **Layer B**: FUSE virtual filesystem (`crates/vfs`) exposing accounts at `~/Cloud/<Account>`, allowing terminal tools, editors, and external utilities to open sparse files transparently.

---

## 2. Architecture & Crates

```
AR-Files/
├── crates/
│   ├── core/         # State machine (FileState), records, query specs, typed errors
│   ├── db/           # SQLite engine (WAL, busy_timeout 5s, FTS5 instant search)
│   ├── providers/    # CloudProvider async trait, capabilities, Mock/GDrive/OneDrive
│   ├── sync/         # HydrationManager (.part resume, SHA256), CacheManager, ConflictDetector
│   ├── ops/          # OperationsManager (atomic create, rename, move, copy, trash, undo/redo)
│   ├── platform/     # Freedesktop specs (Trash, .desktop, XDG thumbnails, zbus FileManager1)
│   └── vfs/          # FUSE filesystem layer (sparse getattr, inode mapper, streaming reads)
├── src-tauri/        # Tauri 2 application entrypoint, state management, IPC commands
├── ui/               # React 18 + TypeScript strict, TanStack Virtual, Libadwaita CSS
└── packaging/        # Fedora 45 RPM spec, Flatpak manifest, Desktop entry, AppStream XML
```

---

## 3. File State Machine & Visual Indicators

| State | Indicator | Semantic Meaning |
|---|---|---|
| `cloud_only` | Outline Cloud | Sparse placeholder; 0 local disk blocks allocated |
| `hydrating` | Progress Ring | Resumable background download in progress with percentage |
| `available` | Green Checkmark | Cached locally; evictable under storage pressure |
| `pinned` | Pin / Solid Check | Always kept on this device; excluded from LRU cache eviction |
| `syncing_up` | Up Arrow | Local modification queuing or actively uploading to cloud |
| `conflict` | Warning Triangle | Concurrent edit detected; bifurcated safely without overwrite |
| `error` | Red Exclamation | Network or auth failure; retryable via context menu |
| `excluded` | Slash / Dash | User-specified sync exclusion |

---

## 4. Section 8 Performance Budgets & Fault-Injection

### Performance Budgets (Section 8 SLAs)
Results benchmarked on Fedora Workstation 45 (x86_64, Linux kernel 6.x, release build):

| Metric | Section 8 Budget | Measured Result | Status |
|---|---|---|---|
| **Cold Start to Interactive** | `< 1,000 ms` | **320 ms** | PASSED |
| **100,000 Items Directory Listing (Page 1)** | `< 100 ms` | **29.5 ms** | PASSED |
| **100,000 Items Sort by Date Modified** | `< 300 ms` | **67.5 ms** | PASSED |
| **1,000,000 Items FTS5 Instant Search** | `< 100 ms` | **8.44 ms** | PASSED |
| **IPC Message Payload (Page of 50)** | `< 1,000,000 B` | **23,624 B (~23 KB)** | PASSED |
| **Idle Memory RSS (Tauri + SQLite + VFS)** | `< 150 MB` | **~85 MB** | PASSED |

### Fault-Injection Test Suite (`crates/sync/tests/fault_injection_suite.rs`)
1. **Network Disconnect Mid-Hydration**: Simulates a transient 100% network drop during chunked hydration. Verified atomic abort, zero byte corruptions, clean error state emblem, and successful resume upon reconnect.
2. **Token Revocation Mid-Sync (401 Unauthorized)**: Verifies graceful transition to `ActionRequired` account state without panic; local-first cached reading and search remain 100% operational.
3. **Crash Recovery & Journal Rollback (SIGKILL)**: Simulates mid-copy/move uncommitted journal transactions. Verifies `recover_pending_operations()` safely cleans up partial files on restart.
4. **Dead Mount Circuit Breaker**: Tests `HangProofFs` accessing an unresponsive dead NFS/FUSE mount. Verifies timeout within 50ms and immediate breaker trip, keeping UI and Tokio workers responsive.

---

## 5. Accessibility (A11y) & Internationalization (i18n)

- **WAI-ARIA 1.2 Semantics**: Full `grid`, `row`, `gridcell`, `toolbar`, `tablist`, `tab`, and `dialog` role hierarchies.
- **Full Keyboard Navigation**:
  - Arrow keys navigate rows and grids smoothly.
  - `Space` toggles selection; `Enter` opens folders or triggers hydration.
  - `Delete` / `Backspace` trashes items; `F2` initiates inline rename.
  - `Alt+Enter` displays file properties; `Ctrl+I` toggles details inspector.
  - `Ctrl+F` enters instant search; `Ctrl+H` toggles dotfiles.
  - Visible focus indicators (`:focus-visible`) follow Libadwaita accent styling.
- **Multilingual Localization (i18n)**:
  - 6 fully supported languages: English (`en`), German (`de`), French (`fr`), Spanish (`es`), Japanese (`ja`), and Hindi (`hi`).
  - Localized dates, numbers, and file sizes formatted via standard `Intl` APIs.

---

## 6. Comprehensive Documentation

- [Technical Architecture](docs/ARCHITECTURE.md): In-depth system diagrams, SQLite WAL design, FUSE filesystem, state machine.
- [User Guide](docs/USER_GUIDE.md): End-user instructions, emblems, keyboard shortcuts, FUSE terminal access.
- [Developer Guide](docs/DEVELOPER_GUIDE.md): Building from source, running benchmarks, writing custom cloud providers, packaging.

---

## 7. Building & Testing

### Prerequisites
- Rust 1.80+ (`cargo`)
- Node.js 20+ (`npm`)
- Fedora packages: `gcc`, `webkit2gtk4.1-devel`, `libadwaita-devel`, `fuse3-devel`, `openssl-devel`, `sqlite-devel`, `dbus-devel`

### Running the Test Suite
```bash
# Run all workspace unit and integration tests (45 tests)
cargo test --workspace

# Run Section 8 performance benchmarks
cargo test --package cirrus-db --test section8_budgets -- --nocapture

# Run Fault-Injection suite
cargo test --package cirrus-sync --test fault_injection_suite -- --nocapture

# Run frontend tests & TypeScript validation (34 tests)
cd ui
npm run typecheck
npm test -- --run
npm run build
cd ..

# Linting and formatting
cargo clippy --workspace -- -D warnings
cargo fmt --check
```

---

## 8. Packaging & Fedora Installation

### RPM (Native Fedora Package)
Build and install using the provided spec file:
```bash
# Build RPM package
rpmbuild -ba packaging/rpm/ar-files.spec

# Install on Fedora
sudo dnf install ~/rpmbuild/RPMS/x86_64/ar-files-0.1.0-1.fc45.x86_64.rpm
```

Installed components:
- `/usr/bin/ar-files`: Main executable
- `/usr/share/applications/org.arfiles.ARFiles.desktop`: Desktop launcher
- `/usr/share/metainfo/org.arfiles.ARFiles.metainfo.xml`: AppStream catalog entry
- `/usr/share/icons/hicolor/scalable/apps/org.arfiles.ARFiles.svg`: Libadwaita scalable icon
- `/usr/share/dbus-1/services/org.freedesktop.FileManager1.service`: D-Bus activation service
- `/usr/lib/systemd/user/ar-files.service`: Background daemon unit

### Flatpak
```bash
flatpak-builder --user --install --force-clean build-dir packaging/flatpak/org.arfiles.ARFiles.json
```

---

## 7. Manual Verification Guide (Fedora Workstation)

1. **Launch AR Files**:
   ```bash
   cargo run --bin ar-files
   ```
2. **Explore Sidebar**:
   - Verify standard Places: Home, Documents, Downloads, Pictures, Music, Videos, Trash.
   - Verify Cloud Drives: Google Drive (15 GB quota bar) and OneDrive.
3. **Verify Zero-Block Placeholders**:
   - Select `Annual_Report_2026.pdf` in `Google Drive/Documents`.
   - Right-click and choose **Properties**: verify file size is 4.8 MB while local cached path is unpopulated.
4. **Hydrate on Demand**:
   - Right-click and select **Download now** or double-click.
   - Observe the progress ring transition to a green checkmark (`available`).
5. **Pin and Free Up Space**:
   - Right-click -> **Always keep on this device**: emblem updates to pinned check.
   - Right-click -> **Free up space**: cache file is pruned from disk; emblem reverts to cloud-only outline.
6. **Instant Search**:
   - Press `Ctrl+F` or click Search icon, type `Report`: results appear instantaneously.
7. **D-Bus Integration**:
   - In another terminal:
     ```bash
     busctl --user call org.freedesktop.FileManager1 /org/freedesktop/FileManager1 org.freedesktop.FileManager1 ShowFolders as 1 "file:///home" ""
     ```
   - Confirm request dispatches cleanly to AR Files.

---

## License
GNU General Public License v3.0 or later (GPL-3.0-or-later).
