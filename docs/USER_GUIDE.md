# AR Files - User Guide

Welcome to **AR Files**, the cloud-native, freeze-proof desktop file manager designed for Fedora Workstation and GNOME.

---

## 1. Getting Started

### Installation on Fedora
AR Files is packaged natively as an RPM package and as a sandboxed Flatpak:

#### Native RPM Installation
```bash
sudo dnf install ar-files
```

#### Flatpak Installation
```bash
flatpak install org.arfiles.ARFiles
```

### Launching AR Files
- Open the GNOME Overview (press the `Super` key) and type **AR Files**.
- Or run `ar-files` in your terminal.

---

## 2. Navigating the Interface

AR Files adheres to the GNOME 50 / Libadwaita Human Interface Guidelines with dark mode support and fractional Wayland scaling.

### Header Bar
- **Navigation Controls**: Back (`Alt+Left`), Forward (`Alt+Right`), and Parent Folder (`Alt+Up`).
- **Path Bar & Breadcrumbs**: Click any folder segment to navigate directly, or double-click (or press `Ctrl+L`) to enter path edit mode.
- **Instant Search**: Click the magnifying glass or press `Ctrl+F` to search file names instantaneously across your drive. Toggle between searching the current directory or all connected accounts (`Global FTS5 Search`).
- **Hidden Files**: Toggle hidden dotfiles (`Ctrl+H`).
- **Sorting**: Sort by Name, Size, or Date Modified in Ascending or Descending order (`Ctrl+1`, `Ctrl+2`, `Ctrl+3`).
- **View Toggle**: Switch between List View (`Ctrl+1`) and Grid View (`Ctrl+2`).
- **Details & Properties Pane**: Press `Ctrl+I` to open the sidebar inspector displaying file attributes, MIME type, hashes, and cloud sync status.
- **Preferences**: Access settings from the three-dot menu or press `Ctrl+,`.
- **Diagnostics**: View system health, SQLite WAL size, and provider connection status (`Ctrl+Shift+D`).

### Sidebar & Places
- **Places**: Quick access to Home, Documents, Downloads, Pictures, Music, Videos, and Trash.
- **Cloud Drives**: Shows your connected cloud accounts (Google Drive, OneDrive, Nextcloud, WebDAV, etc.) with real-time storage quota progress bars.
  - **Online/Offline Toggle**: Click the cloud icon to work offline. Any changes you make will be safely journaled and synced when you go back online.
  - **Sync Now**: Force an immediate background delta reconciliation.

---

## 3. Understanding Cloud Files & Emblems

Every cloud file in AR Files displays a status emblem indicating its local and remote state:

| Emblem | Meaning | Explanation |
|---|---|---|
| ☁️ **Outline Cloud** | `cloud_only` | A sparse placeholder. The file's metadata and real size are shown, but zero local disk bytes are consumed. |
| 🔄 **Progress Ring** | `hydrating` | The file is actively downloading in the background. A percentage indicator shows progress. |
| ✅ **Green Check** | `available` | Fully downloaded and cached locally. Can be evicted to free up disk space when needed. |
| 📌 **Solid Pin** | `pinned` | "Always keep on this device". The file is pinned locally and will never be automatically evicted by cache management. |
| ⬆️ **Up Arrow** | `syncing_up` | You have modified this file locally, and the update is uploading to the cloud. |
| ⚠️ **Warning Triangle** | `conflict` | A conflicting remote edit occurred. Both versions have been preserved without data loss. |
| ❗ **Red Exclamation** | `error` | A download or sync operation failed (e.g. transient network disconnect). Right-click to retry. |

---

## 4. Working with Cloud Files

### Opening & Downloading Files
- **Double-click** or select and press `Enter` on any placeholder file.
- AR Files will download the file in the background while displaying progress.
- Once downloaded, it opens seamlessly in your default desktop application (e.g., LibreOffice, Document Viewer, GIMP).

### Context Menu Actions
Right-click on any file to access cloud actions:
- **Download Now**: Hydrate a placeholder file immediately.
- **Always keep on this device**: Pin the file so it is permanently cached offline.
- **Free up space**: Evict local content back to a zero-byte placeholder while retaining metadata.
- **Copy Share Link**: Generate a shareable link to collaborate with others.
- **Version History**: View and restore prior revisions stored on the cloud provider.
- **Move to Trash**: Delete the item safely to the provider's trash or local trash.

---

## 5. FUSE Virtual Mount: Access from Any App or Terminal

AR Files exposes your cloud accounts through a high-performance FUSE3 virtual filesystem mounted at:
`~/CloudDrives/<Account_Name>`

You can interact with your cloud files using terminal commands and external utilities:
```bash
# View sparse cloud placeholders
ls -lh ~/CloudDrives/Google_Drive/

# Reading a file automatically hydrates it transparently
cat ~/CloudDrives/Google_Drive/notes.txt

# Open directly in VS Code or Vim
code ~/CloudDrives/Google_Drive/Projects/
```

---

## 6. Offline Mode & Conflict Resolution

### Working Offline
When you are on an airplane or have no internet connection:
- Browsing, sorting, and searching still work with zero latency using local SQLite metadata.
- Hydrated and pinned files open normally.
- Local edits are safely journaled in SQLite.
- The status bar displays `Offline • N changes pending`.
- When internet connectivity returns, changes are uploaded automatically.

### Conflict Resolution
If a file is edited on another device while you edited it locally:
- AR Files never silently overwrites your data.
- The file receives a `conflict` badge.
- Opening the file or right-clicking displays the Conflict Resolution Dialog where you can choose to:
  1. Keep Local Version (overwrites remote).
  2. Keep Remote Version (replaces local).
  3. Keep Both (renames local copy to `<name> (conflict from <device> <date>)`).

---

## 7. Keyboard Shortcuts Reference

| Shortcut | Action |
|---|---|
| `ArrowUp` / `ArrowDown` | Move selection up / down |
| `Space` | Toggle selection on focused item |
| `Enter` | Open folder or hydrate/open file |
| `Delete` / `Backspace` | Move selected items to Trash |
| `F2` | Rename selected item |
| `Alt+Enter` | Show File Properties dialog |
| `Ctrl+T` | Open new tab |
| `Ctrl+W` | Close current tab |
| `Ctrl+Shift+N` | Create new folder |
| `Ctrl+F` | Open Search bar |
| `Ctrl+H` | Toggle hidden files |
| `Ctrl+I` | Toggle Details & Properties pane |
| `Ctrl+1` | Switch to List View |
| `Ctrl+2` | Switch to Grid View |
| `Ctrl+,` | Open Preferences |
| `Ctrl+Shift+D` | Open Diagnostics & System Health |
| `Escape` | Dismiss modal / Close search |
