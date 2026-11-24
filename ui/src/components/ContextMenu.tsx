import React, { useEffect } from "react";
import {
  Pin,
  PinOff,
  Cloud,
  Download,
  Trash2,
  Edit2,
  Info,
  Archive,
  FileArchive,
  Trash,
  Share2,
  XCircle,
  Eye,
  History,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  Terminal,
  AppWindow,
  Sparkles,
  CheckSquare,
  RefreshCw,
  FileDown,
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  Link,
} from "lucide-react";
import { EntryRecord } from "../types";
import { useExplorerStore } from "../store/useExplorerStore";
import { invokeCommand } from "../services/ipc";

interface ContextMenuProps {
  entry: EntryRecord | null;
  x: number;
  y: number;
  onClose: () => void;
  onOpenProperties: (entry: EntryRecord) => void;
  onStartRename: (entry: EntryRecord) => void;
  onBatchRename?: () => void;
  onCompress?: () => void;
  onCompressToSize?: (entry: EntryRecord) => void;
  onExtract?: () => void;
  onDeletePermanently?: (ids?: string[]) => void;
  onOpenWith?: (entry: EntryRecord) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  entry,
  x,
  y,
  onClose,
  onOpenProperties,
  onStartRename,
  onBatchRename,
  onCompress,
  onCompressToSize,
  onExtract,
  onDeletePermanently,
  onOpenWith,
}) => {
  const {
    openItem,
    openNewTab,
    hydrateItem,
    cancelHydration,
    pinItem,
    unpinItem,
    freeUpSpaceItem,
    trashSelected,
    deletePermanently,
    selectedIds,
    selectAll,
    getShareLink,
    setQuickPreviewOpen,
    openVersionHistory,
    showToast,
    setSmartCleanupOpen,
    createFolder,
    currentAccountId,
    currentFolderId,
    breadcrumbs,
    accountMountPaths,
    loadEntries,
    fontSize,
    clipboard,
    copySelected,
    cutSelected,
    pasteClipboard,
    duplicateSelected,
  } = useExplorerStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Dynamic font size scaling based on app preferences
  const currentFontSize = fontSize || 14;
  const scale = currentFontSize / 14;
  const iconSize = Math.max(12, Math.round(15 * scale));
  const menuWidth = Math.max(220, Math.round(230 * scale));
  const itemPaddingY = Math.max(5, Math.round(7 * scale));
  const itemPaddingX = Math.max(8, Math.round(12 * scale));
  const itemGap = Math.max(6, Math.round(10 * scale));
  const shortcutPaddingLeft = Math.round(12 * scale);
  const shortcutFontSize = `${Math.max(9, Math.round(currentFontSize * 0.82))}px`;

  // Dynamic viewport clamping
  const menuHeight = entry ? Math.round(620 * scale) : Math.round(320 * scale);
  const clampedX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 12));
  const clampedY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 12));

  const hasClipboard = Boolean(clipboard && clipboard.entries.length > 0);
  const isMultiSelected = Boolean(entry && selectedIds.size > 1 && selectedIds.has(entry.id));

  const menuContainerStyle: React.CSSProperties = {
    position: "fixed",
    top: clampedY,
    left: clampedX,
    zIndex: 901,
    backgroundColor: "var(--popover-bg)",
    borderRadius: "var(--adw-radius-m)",
    boxShadow: "var(--popover-shadow)",
    padding: `${Math.round(6 * scale)}px 0`,
    minWidth: menuWidth,
    width: menuWidth,
    maxHeight: "calc(100vh - 24px)",
    overflowY: "auto",
    fontSize: `var(--app-font-size, ${currentFontSize}px)`,
    border: "1px solid var(--border-color)",
    display: "flex",
    flexDirection: "column",
  };

  const itemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: itemGap,
    padding: `${itemPaddingY}px ${itemPaddingX}px`,
    fontSize: `var(--app-font-size, ${currentFontSize}px)`,
    fontFamily: "inherit",
    fontWeight: 500,
    color: "var(--window-fg)",
    background: "none",
    border: "none",
    borderRadius: 0,
    width: "100%",
    cursor: "default",
    textAlign: "left",
    lineHeight: 1.35,
    userSelect: "none",
  };

  const shortcutStyle: React.CSSProperties = {
    marginLeft: "auto",
    fontSize: shortcutFontSize,
    color: "var(--dim-fg)",
    paddingLeft: shortcutPaddingLeft,
    whiteSpace: "nowrap",
  };

  const separatorStyle: React.CSSProperties = {
    height: 1,
    backgroundColor: "var(--border-color)",
    margin: `${Math.round(4 * scale)}px 0`,
  };

  const handleCopy = () => {
    if (entry) {
      if (isMultiSelected) {
        copySelected();
      } else {
        copySelected([entry]);
      }
    }
    onClose();
  };

  const handleCut = () => {
    if (entry) {
      if (isMultiSelected) {
        cutSelected();
      } else {
        cutSelected([entry]);
      }
    }
    onClose();
  };

  const handleDuplicate = () => {
    if (entry) {
      if (isMultiSelected) {
        duplicateSelected();
      } else {
        duplicateSelected([entry]);
      }
    }
    onClose();
  };

  const handleCopyPath = () => {
    if (entry) {
      const p = entry.path || entry.id;
      try {
        navigator.clipboard?.writeText(p);
        showToast("Path copied to clipboard");
      } catch {
        showToast("Failed to copy path");
      }
    }
    onClose();
  };

  // When right clicking inside a folder on empty space
  if (!entry) {
    const homePath =
      typeof window !== "undefined" && (window as any).__USER_HOME__
        ? (window as any).__USER_HOME__
        : "/home/abhi";
    const currentPath = currentFolderId || homePath;
    const currentName =
      breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : "Folder";

    const mountPath = currentAccountId ? accountMountPaths[currentAccountId] : null;
    const resolvedPath = mountPath || currentPath;

    const handleCreateFolder = async () => {
      onClose();
      const folderName = window.prompt("Folder name:", "New Folder");
      if (folderName && folderName.trim()) {
        await createFolder(folderName.trim());
        showToast(`Created folder "${folderName.trim()}"`);
      }
    };

    const handleOpenTerminalHere = async () => {
      try {
        await invokeCommand("open_in_terminal", {
          path: resolvedPath,
          account_id: currentAccountId,
        });
        showToast("Terminal opened in current folder");
      } catch (err: any) {
        showToast(err.message || "Failed to open terminal");
      }
      onClose();
    };

    const handleCurrentFolderProperties = () => {
      const syntheticEntry: EntryRecord = {
        id: currentPath,
        account_id: currentAccountId || "acc_local",
        name: currentName,
        path: currentPath,
        is_directory: true,
        size: 0,
        mtime: Date.now(),
        ctime: Date.now(),
        mime_type: "inode/directory",
        state: "available",
        sync_version: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      onOpenProperties(syntheticEntry);
      onClose();
    };

    return (
      <>
        {/* Backdrop */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 900,
          }}
          onClick={onClose}
          onContextMenu={(e) => {
            e.preventDefault();
            onClose();
          }}
        />

        {/* Menu Card for Empty Space / Inside Folder */}
        <div
          role="menu"
          aria-label="Folder context menu"
          className="adw-context-menu"
          style={menuContainerStyle}
        >
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={handleCreateFolder}
          >
            <FolderPlus size={iconSize} color="var(--adw-accent-blue)" />
            <span>New Folder...</span>
            <span style={shortcutStyle}>Ctrl+Shift+N</span>
          </button>

          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={handleOpenTerminalHere}
          >
            <Terminal size={iconSize} />
            <span>Open in Terminal</span>
          </button>

          <div style={separatorStyle} />

          {/* Paste in Empty Space */}
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={{
              ...itemStyle,
              opacity: hasClipboard ? 1 : 0.45,
              cursor: "default",
            }}
            disabled={!hasClipboard}
            onClick={() => {
              if (hasClipboard) {
                pasteClipboard();
                onClose();
              }
            }}
          >
            <ClipboardPaste
              size={iconSize}
              color={hasClipboard ? "var(--adw-accent-blue)" : "var(--dim-fg)"}
            />
            <span>
              {hasClipboard
                ? `Paste (${clipboard!.entries.length} item${clipboard!.entries.length > 1 ? "s" : ""})`
                : "Paste"}
            </span>
            <span style={shortcutStyle}>Ctrl+V</span>
          </button>

          {/* Select All */}
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={() => {
              selectAll();
              onClose();
            }}
          >
            <CheckSquare size={iconSize} />
            <span>Select All</span>
            <span style={shortcutStyle}>Ctrl+A</span>
          </button>

          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={() => {
              loadEntries();
              showToast("Reloaded folder");
              onClose();
            }}
          >
            <RefreshCw size={iconSize} />
            <span>Reload</span>
            <span style={shortcutStyle}>Ctrl+R</span>
          </button>

          <div style={separatorStyle} />

          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={() => {
              setSmartCleanupOpen(true);
              onClose();
            }}
          >
            <Sparkles size={iconSize} color="var(--adw-accent-yellow)" />
            <span>Folder Intelligence & Cleanup...</span>
          </button>

          <div style={separatorStyle} />

          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={handleCurrentFolderProperties}
          >
            <Info size={iconSize} />
            <span>Properties</span>
            <span style={shortcutStyle}>Alt+Enter</span>
          </button>
        </div>
      </>
    );
  }

  const isLocal = entry.account_id === "acc_local";
  const isArchive =
    entry.name.endsWith(".zip") ||
    entry.name.endsWith(".tar.gz") ||
    entry.mime_type.includes("zip") ||
    entry.mime_type.includes("tar");

  const isImageOrPdf =
    !entry.is_directory &&
    (entry.name.toLowerCase().endsWith(".pdf") ||
      entry.mime_type?.toLowerCase().includes("pdf") ||
      entry.mime_type?.toLowerCase().startsWith("image/") ||
      /\.(jpe?g|png|webp|bmp|gif|tiff?|avif)$/i.test(entry.name));

  const handleOpen = () => {
    openItem(entry);
    onClose();
  };

  const handleOpenInNewTab = () => {
    openNewTab(
      entry.account_id === "acc_local" ? null : entry.account_id,
      entry.path || entry.id,
      entry.name
    );
    onClose();
  };

  const handleOpenInTerminal = async () => {
    const mountPath = entry.account_id ? accountMountPaths[entry.account_id] : null;
    const targetPath =
      entry.local_path ||
      (mountPath && entry.path ? `${mountPath}/${entry.path.replace(/^\//, "")}` : null) ||
      entry.path ||
      entry.id;
    try {
      await invokeCommand("open_in_terminal", {
        path: targetPath,
        account_id: entry.account_id,
      });
      showToast("Terminal opened");
    } catch (err: any) {
      showToast(err.message || "Failed to open terminal");
    }
    onClose();
  };

  const handleDownloadNow = () => {
    hydrateItem(entry.id);
    onClose();
  };

  const handleCancelDownload = () => {
    cancelHydration(entry.id);
    onClose();
  };

  const handleAlwaysKeep = () => {
    if (entry.state === "pinned") {
      unpinItem(entry.id);
      showToast("Unpinned from device");
    } else {
      pinItem(entry.id);
      showToast("Pinned to device");
    }
    onClose();
  };

  const handleFreeUpSpace = () => {
    freeUpSpaceItem(entry.id);
    showToast("Freed up local disk space");
    onClose();
  };

  const handleCopyShareLink = async () => {
    try {
      const link = await getShareLink(entry.account_id, entry.id);
      navigator.clipboard?.writeText(link);
      showToast("Share link copied to clipboard");
    } catch {
      const fallback = `https://cloud.ar-files.local/share/${entry.remote_id || entry.id}`;
      navigator.clipboard?.writeText(fallback);
      showToast("Share link copied to clipboard");
    }
    onClose();
  };

  const handleTrash = () => {
    const idsToTrash = selectedIds.has(entry.id)
      ? Array.from(selectedIds)
      : [entry.id];
    trashSelected(idsToTrash);
    showToast(
      `Moved ${idsToTrash.length} item${idsToTrash.length > 1 ? "s" : ""} to Trash`,
      true
    );
    onClose();
  };

  const handleDeletePermanent = () => {
    const idsToDelete = selectedIds.has(entry.id)
      ? Array.from(selectedIds)
      : [entry.id];
    if (onDeletePermanently) {
      onDeletePermanently(idsToDelete);
    } else {
      deletePermanently(idsToDelete);
      showToast(
        `Permanently deleted ${idsToDelete.length} item${idsToDelete.length > 1 ? "s" : ""}`
      );
    }
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 900,
        }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Menu Card for Selected Item(s) */}
      <div
        role="menu"
        aria-label="File context menu"
        className="adw-context-menu"
        style={menuContainerStyle}
      >
        {/* Open Actions */}
        <button
          role="menuitem"
          className="adw-context-menu-item adw-sidebar-item"
          style={itemStyle}
          onClick={handleOpen}
        >
          {entry.is_directory ? <FolderOpen size={iconSize} /> : <ExternalLink size={iconSize} />}
          <span>{entry.is_directory ? "Open Folder" : "Open"}</span>
          <span style={shortcutStyle}>Enter</span>
        </button>

        {entry.is_directory && (
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={handleOpenInNewTab}
          >
            <FolderPlus size={iconSize} />
            <span>Open in New Tab</span>
            <span style={shortcutStyle}>Ctrl+T</span>
          </button>
        )}

        {!entry.is_directory && onOpenWith && (
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={() => {
              onOpenWith(entry);
              onClose();
            }}
          >
            <AppWindow size={iconSize} color="var(--adw-accent-blue)" />
            <span>Open With...</span>
          </button>
        )}

        <button
          role="menuitem"
          className="adw-context-menu-item adw-sidebar-item"
          style={itemStyle}
          onClick={handleOpenInTerminal}
        >
          <Terminal size={iconSize} />
          <span>Open in Terminal</span>
        </button>

        <div style={separatorStyle} />

        {/* Cut */}
        <button
          role="menuitem"
          className="adw-context-menu-item adw-sidebar-item"
          style={itemStyle}
          onClick={handleCut}
        >
          <Scissors size={iconSize} />
          <span>{isMultiSelected ? `Cut (${selectedIds.size} items)` : "Cut"}</span>
          <span style={shortcutStyle}>Ctrl+X</span>
        </button>

        {/* Copy */}
        <button
          role="menuitem"
          className="adw-context-menu-item adw-sidebar-item"
          style={itemStyle}
          onClick={handleCopy}
        >
          <Copy size={iconSize} />
          <span>{isMultiSelected ? `Copy (${selectedIds.size} items)` : "Copy"}</span>
          <span style={shortcutStyle}>Ctrl+C</span>
        </button>

        {/* Paste (if directory: Paste into Folder, otherwise if clipboard has items: Paste) */}
        {entry.is_directory ? (
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={{
              ...itemStyle,
              opacity: hasClipboard ? 1 : 0.45,
              cursor: "default",
            }}
            disabled={!hasClipboard}
            onClick={() => {
              if (hasClipboard) {
                pasteClipboard(entry.path || entry.id);
                onClose();
              }
            }}
          >
            <ClipboardPaste
              size={iconSize}
              color={hasClipboard ? "var(--adw-accent-blue)" : "var(--dim-fg)"}
            />
            <span>
              {hasClipboard
                ? `Paste into Folder (${clipboard!.entries.length})`
                : "Paste into Folder"}
            </span>
            <span style={shortcutStyle}>Ctrl+V</span>
          </button>
        ) : (
          hasClipboard && (
            <button
              role="menuitem"
              className="adw-context-menu-item adw-sidebar-item"
              style={itemStyle}
              onClick={() => {
                pasteClipboard();
                onClose();
              }}
            >
              <ClipboardPaste size={iconSize} color="var(--adw-accent-blue)" />
              <span>
                Paste ({clipboard!.entries.length} item{clipboard!.entries.length > 1 ? "s" : ""})
              </span>
              <span style={shortcutStyle}>Ctrl+V</span>
            </button>
          )
        )}

        {/* Duplicate */}
        <button
          role="menuitem"
          className="adw-context-menu-item adw-sidebar-item"
          style={itemStyle}
          onClick={handleDuplicate}
        >
          <CopyPlus size={iconSize} />
          <span>
            {isMultiSelected ? `Duplicate (${selectedIds.size} items)` : "Duplicate"}
          </span>
          <span style={shortcutStyle}>Ctrl+D</span>
        </button>

        {/* Copy Path */}
        <button
          role="menuitem"
          className="adw-context-menu-item adw-sidebar-item"
          style={itemStyle}
          onClick={handleCopyPath}
        >
          <Link size={iconSize} />
          <span>Copy Path</span>
        </button>

        <div style={separatorStyle} />

        {/* Select All */}
        <button
          role="menuitem"
          className="adw-context-menu-item adw-sidebar-item"
          style={itemStyle}
          onClick={() => {
            selectAll();
            onClose();
          }}
        >
          <CheckSquare size={iconSize} />
          <span>Select All</span>
          <span style={shortcutStyle}>Ctrl+A</span>
        </button>

        <div style={separatorStyle} />

        {/* Cloud-Specific Hydration / Pin / Evict / Share Actions */}
        {!isLocal && (
          <>
            {(entry.state === "cloud_only" || entry.state === "error") && (
              <button
                role="menuitem"
                className="adw-context-menu-item adw-sidebar-item"
                style={itemStyle}
                onClick={handleDownloadNow}
              >
                <Download size={iconSize} />
                <span>Download now</span>
              </button>
            )}

            {entry.state === "hydrating" && (
              <button
                role="menuitem"
                className="adw-context-menu-item adw-sidebar-item"
                style={itemStyle}
                onClick={handleCancelDownload}
              >
                <XCircle size={iconSize} color="var(--state-error)" />
                <span>Cancel download</span>
              </button>
            )}

            <button
              role="menuitem"
              className="adw-context-menu-item adw-sidebar-item"
              style={itemStyle}
              onClick={handleAlwaysKeep}
            >
              {entry.state === "pinned" ? <PinOff size={iconSize} /> : <Pin size={iconSize} />}
              <span>
                {entry.state === "pinned"
                  ? "Unpin from device"
                  : "Always keep on this device"}
              </span>
            </button>

            {(entry.state === "available" || entry.state === "pinned") && (
              <button
                role="menuitem"
                className="adw-context-menu-item adw-sidebar-item"
                style={itemStyle}
                onClick={handleFreeUpSpace}
              >
                <Cloud size={iconSize} />
                <span>Free up space</span>
              </button>
            )}

            <button
              role="menuitem"
              className="adw-context-menu-item adw-sidebar-item"
              style={itemStyle}
              onClick={handleCopyShareLink}
            >
              <Share2 size={iconSize} />
              <span>Copy share link</span>
            </button>

            {!entry.is_directory && (
              <button
                role="menuitem"
                className="adw-context-menu-item adw-sidebar-item"
                style={itemStyle}
                onClick={() => {
                  openVersionHistory(entry);
                  onClose();
                }}
              >
                <History size={iconSize} />
                <span>Version History</span>
              </button>
            )}

            <div style={separatorStyle} />
          </>
        )}

        {/* Quick Preview */}
        {!entry.is_directory && (
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={() => {
              setQuickPreviewOpen(true);
              onClose();
            }}
          >
            <Eye size={iconSize} />
            <span>Quick Preview</span>
            <span style={shortcutStyle}>Space</span>
          </button>
        )}

        {/* Compression & Extraction */}
        {isImageOrPdf && onCompressToSize && (
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={() => {
              onCompressToSize(entry);
              onClose();
            }}
          >
            <FileDown size={iconSize} color="var(--adw-accent-blue)" />
            <span>Compress to Desired Size...</span>
          </button>
        )}

        {isArchive && onExtract && (
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={() => {
              onExtract();
              onClose();
            }}
          >
            <FileArchive size={iconSize} color="var(--adw-accent-blue)" />
            <span>Extract Archive...</span>
          </button>
        )}

        {onCompress && (
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={() => {
              onCompress();
              onClose();
            }}
          >
            <Archive size={iconSize} />
            <span>Compress to ZIP...</span>
          </button>
        )}

        <div style={separatorStyle} />

        {/* Rename & Batch Rename */}
        {isMultiSelected && onBatchRename ? (
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={() => {
              onBatchRename();
              onClose();
            }}
          >
            <Edit2 size={iconSize} />
            <span>Batch Rename ({selectedIds.size} items)...</span>
            <span style={shortcutStyle}>F2</span>
          </button>
        ) : (
          <button
            role="menuitem"
            className="adw-context-menu-item adw-sidebar-item"
            style={itemStyle}
            onClick={() => {
              onStartRename(entry);
              onClose();
            }}
          >
            <Edit2 size={iconSize} />
            <span>Rename...</span>
            <span style={shortcutStyle}>F2</span>
          </button>
        )}

        {/* Delete & Permanent Delete */}
        <button
          role="menuitem"
          className="adw-context-menu-item adw-sidebar-item"
          style={itemStyle}
          onClick={handleTrash}
        >
          <Trash2 size={iconSize} color="var(--state-error)" />
          <span style={{ color: "var(--state-error)" }}>Move to Trash</span>
          <span style={shortcutStyle}>Del</span>
        </button>

        <button
          role="menuitem"
          className="adw-context-menu-item adw-sidebar-item"
          style={itemStyle}
          onClick={handleDeletePermanent}
        >
          <Trash size={iconSize} color="var(--state-error)" />
          <span style={{ color: "var(--state-error)" }}>Delete Permanently</span>
          <span style={shortcutStyle}>Shift+Del</span>
        </button>

        <div style={separatorStyle} />

        {/* Folder Intelligence */}
        <button
          role="menuitem"
          className="adw-context-menu-item adw-sidebar-item"
          style={itemStyle}
          onClick={() => {
            setSmartCleanupOpen(true);
            onClose();
          }}
        >
          <Sparkles size={iconSize} color="var(--adw-accent-yellow)" />
          <span>Folder Intelligence & Cleanup...</span>
        </button>

        {/* Properties */}
        <button
          role="menuitem"
          className="adw-context-menu-item adw-sidebar-item"
          style={itemStyle}
          onClick={() => {
            onOpenProperties(entry);
            onClose();
          }}
        >
          <Info size={iconSize} />
          <span>Properties</span>
          <span style={shortcutStyle}>Alt+Enter</span>
        </button>
      </div>
    </>
  );
};
