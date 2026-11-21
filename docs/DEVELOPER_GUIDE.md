# AR Files - Developer Guide

This document describes how to set up, build, test, extend, and package **AR Files**.

---

## 1. Development Prerequisites

### System Requirements
- **Fedora Workstation 40+** (or modern Linux distribution with GNOME / Wayland)
- **Rust Toolchain**: Stable 1.80+ (`rustup default stable`)
- **Node.js**: 20+ (`node`, `npm`)
- **System Dependencies**:
  ```bash
  sudo dnf install -y \
      gcc gcc-c++ make pkg-config \
      webkit2gtk4.1-devel \
      libadwaita-devel \
      fuse3-devel \
      openssl-devel \
      sqlite-devel \
      dbus-devel
  ```

---

## 2. Repository Architecture & Layout

```
AR-Files/
├── crates/
│   ├── core/         # Domain records, FileState machine, QuerySpec, typed errors (thiserror)
│   ├── db/           # SQLite engine (sqlx/rusqlite, WAL, migrations, FTS5 instant search)
│   ├── providers/    # CloudProvider async trait, capabilities, GDrive, OneDrive, Mock
│   ├── sync/         # HydrationManager (.part resume), CacheManager, ConflictDetector
│   ├── ops/          # OperationsManager (atomic copy, move, rename, trash, batch, undo/redo)
│   ├── platform/     # Freedesktop Trash spec, .desktop parsing, Open With, XDG thumbnails, zbus
│   └── vfs/          # FUSE virtual filesystem (sparse getattr, inode mapper, streaming reads)
├── src-tauri/        # Tauri 2 application runtime, IPC handlers, background worker supervision
├── ui/               # React 18, TypeScript strict, TanStack Virtual, Zustand, Libadwaita CSS
├── packaging/        # RPM spec, Flatpak manifest, desktop entries, appstream metainfo
└── docs/             # Technical architecture, user guide, ADRs
```

---

## 3. Building from Source

### 1. Build the Frontend
```bash
cd ui
npm install
npm run build
cd ..
```

### 2. Build the Rust Backend
```bash
cargo build
```

### 3. Launch Development Mode
To run Tauri in interactive development mode with hot reloading:
```bash
cargo run --bin ar-files
```

---

## 4. Test Suites & Benchmarks

AR Files enforces a rigorous quality and reliability test suite.

### 1. Running Unit & Integration Tests
```bash
cargo test --workspace
```

### 2. Fault-Injection Suite
The fault-injection suite verifies system resilience under harsh operating conditions:
```bash
cargo test --package cirrus-sync --test fault_injection_suite -- --nocapture
```
Verifies:
- Network drop during streaming hydration: atomic rollback to `.part` file, zero disk corruption, and successful resumption upon reconnection.
- Token revocation (401 Unauthorized) mid-sync: clean transition to `ActionRequired` without unhandled panics; local-first cached reading remains fully functional.
- Process crash / SIGKILL mid-operation: operations journal rollbacks pending uncompleted entries on restart.
- Dead / unresponsive NFS/FUSE mounts: `HangProofFs` circuit breaker triggers within 50ms without hanging the thread.

### 3. Section 8 Performance Budget Benchmarks
Verifies adherence to strict non-negotiable performance SLAs:
```bash
cargo test --package cirrus-db --test section8_budgets -- --nocapture
```
Budgets verified:
- **100,000 item directory listing**: Page 1 retrieval under **100 ms** (achieved ~29.5 ms in release).
- **100,000 item sort by modified date**: under **300 ms** (achieved ~67.5 ms in release).
- **1,000,000 item FTS5 search**: under **100 ms** in release mode (achieved ~8.4 ms in release).
- **IPC message payload**: strictly under **1 MB** (achieved ~23.6 KB per 50-item page).

### 4. Scale Benchmark
```bash
cargo test --package cirrus-db --test scale_benchmark -- --nocapture
```

### 5. Frontend Tests & Linting
```bash
cd ui
npm run typecheck
npm test -- --run
npm run build
cd ..
```

### 6. Rust Code Quality & Formatting
```bash
cargo fmt --check
cargo clippy --workspace -- -D warnings
```

---

## 5. Adding a New Cloud Provider

To add support for a new cloud service (e.g., Dropbox, Nextcloud, Box):

1. **Implement `CloudProvider` in `crates/providers`**:
   ```rust
   #[async_trait]
   pub trait CloudProvider: Send + Sync {
       fn id(&self) -> &str;
       fn name(&self) -> &str;
       fn capabilities(&self) -> ProviderCapabilities;

       async fn list_children(
           &self,
           folder_id: Option<&str>,
           page_token: Option<&str>,
       ) -> Result<ProviderFileList, CirrusError>;

       async fn download(
           &self,
           file_id: &str,
           range: Option<(u64, u64)>,
       ) -> Result<Box<dyn AsyncRead + Send + Unpin>, CirrusError>;

       async fn upload(
           &self,
           parent_id: Option<&str>,
           name: &str,
           source: Bytes,
           mime_type: &str,
       ) -> Result<RemoteFile, CirrusError>;

       async fn get_quota(&self) -> Result<QuotaInfo, CirrusError>;
   }
   ```
2. **Register the Provider in `src-tauri/src/main.rs`** in `ProviderRegistry`.
3. **Add Account UI Support in `ui/src/components/PreferencesDialog.tsx`**.

---

## 6. Packaging & Release

### RPM Spec File (`packaging/rpm/ar-files.spec`)
To build native Fedora RPM packages:
```bash
# Prepare source tarball
tar -czvf ~/rpmbuild/SOURCES/ar-files-0.1.0.tar.gz --exclude=target --exclude=node_modules .

# Build RPM binary and source packages
rpmbuild -ba packaging/rpm/ar-files.spec
```

### Flatpak Manifest (`packaging/flatpak/org.arfiles.ARFiles.json`)
Targeting GNOME 47 runtime:
```bash
flatpak-builder --user --install --force-clean build-dir packaging/flatpak/org.arfiles.ARFiles.json
```
Required Flatpak sandbox permissions:
- `--filesystem=xdg-run/dconf`
- `--filesystem=~/CloudDrives:create`
- `--device=all` (for `/dev/fuse`)
- `--talk-name=org.freedesktop.FileManager1`
- `--talk-name=org.freedesktop.secrets`
