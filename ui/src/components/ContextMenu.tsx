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

  // Keep menu within the visible viewport
  const menuWidth = 220;
  const menuHeight = entry ? 440 : 250;
  const clampedX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 12));
  const clampedY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 12));

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
          style={{
            position: "fixed",
            top: clampedY,
            left: clampedX,
            zIndex: 901,
            backgroundColor: "var(--popover-bg)",
            borderRadius: "var(--adw-radius-m)",
            boxShadow: "var(--popover-shadow)",
            padding: "6px 0",
            minWidth: 220,
            border: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={handleCreateFolder}
          >
            <FolderPlus size={15} color="var(--adw-accent-blue)" />
            <span>New Folder...</span>
          </button>

          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={handleOpenTerminalHere}
          >
            <Terminal size={15} />
            <span>Open in Terminal</span>
          </button>

          <div
            style={{
              height: 1,
              backgroundColor: "var(--border-color)",
              margin: "4px 0",
            }}
          />

          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              setSmartCleanupOpen(true);
              onClose();
            }}
          >
            <Sparkles size={15} color="var(--adw-accent-yellow)" />
            <span>Folder Intelligence & Cleanup...</span>
          </button>

          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              selectAll();
              onClose();
            }}
          >
            <CheckSquare size={15} />
            <span>Select All</span>
          </button>

          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              loadEntries();
              showToast("Reloaded folder");
              onClose();
            }}
          >
            <RefreshCw size={15} />
            <span>Reload</span>
          </button>

          <div
            style={{
              height: 1,
              backgroundColor: "var(--border-color)",
              margin: "4px 0",
            }}
          />

          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={handleCurrentFolderProperties}
          >
            <Info size={15} />
            <span>Properties (Alt+Enter)</span>
          </button>
        </div>
      </>
    );
  }

  const isLocal = entry.account_id === "acc_local";
  const isMultiSelected = selectedIds.size > 1 && selectedIds.has(entry.id);
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

      {/* Menu Card */}
      <div
        role="menu"
        aria-label="File context menu"
        style={{
          position: "fixed",
          top: clampedY,
          left: clampedX,
          zIndex: 901,
          backgroundColor: "var(--popover-bg)",
          borderRadius: "var(--adw-radius-m)",
          boxShadow: "var(--popover-shadow)",
          padding: "6px 0",
          minWidth: 210,
          border: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Open Actions */}
        <button
          role="menuitem"
          className="adw-sidebar-item"
          style={{
            borderRadius: 0,
            border: "none",
            background: "none",
            width: "100%",
          }}
          onClick={handleOpen}
        >
          {entry.is_directory ? <FolderOpen size={15} /> : <ExternalLink size={15} />}
          <span>{entry.is_directory ? "Open Folder" : "Open"}</span>
        </button>

        {entry.is_directory && (
          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={handleOpenInNewTab}
          >
            <FolderPlus size={15} />
            <span>Open in New Tab</span>
          </button>
        )}

        {!entry.is_directory && onOpenWith && (
          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              onOpenWith(entry);
              onClose();
            }}
          >
            <AppWindow size={15} color="var(--adw-accent-blue)" />
            <span>Open With...</span>
          </button>
        )}

        <button
          role="menuitem"
          className="adw-sidebar-item"
          style={{
            borderRadius: 0,
            border: "none",
            background: "none",
            width: "100%",
          }}
          onClick={async () => {
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
          }}
        >
          <Terminal size={15} />
          <span>Open in Terminal</span>
        </button>

        {/* Separator */}
        <div
          style={{
            height: 1,
            backgroundColor: "var(--border-color)",
            margin: "4px 0",
          }}
        />

        {/* Cloud-Specific Hydration / Pin / Evict / Share Actions */}
        {!isLocal && (
          <>
            {(entry.state === "cloud_only" || entry.state === "error") && (
              <button
                role="menuitem"
                className="adw-sidebar-item"
                style={{
                  borderRadius: 0,
                  border: "none",
                  background: "none",
                  width: "100%",
                }}
                onClick={handleDownloadNow}
              >
                <Download size={15} />
                <span>Download now</span>
              </button>
            )}

            {entry.state === "hydrating" && (
              <button
                role="menuitem"
                className="adw-sidebar-item"
                style={{
                  borderRadius: 0,
                  border: "none",
                  background: "none",
                  width: "100%",
                }}
                onClick={handleCancelDownload}
              >
                <XCircle size={15} color="var(--state-error)" />
                <span>Cancel download</span>
              </button>
            )}

            <button
              role="menuitem"
              className="adw-sidebar-item"
              style={{
                borderRadius: 0,
                border: "none",
                background: "none",
                width: "100%",
              }}
              onClick={handleAlwaysKeep}
            >
              {entry.state === "pinned" ? <PinOff size={15} /> : <Pin size={15} />}
              <span>
                {entry.state === "pinned"
                  ? "Unpin from device"
                  : "Always keep on this device"}
              </span>
            </button>

            {(entry.state === "available" || entry.state === "pinned") && (
              <button
                role="menuitem"
                className="adw-sidebar-item"
                style={{
                  borderRadius: 0,
                  border: "none",
                  background: "none",
                  width: "100%",
                }}
                onClick={handleFreeUpSpace}
              >
                <Cloud size={15} />
                <span>Free up space</span>
              </button>
            )}

            <button
              role="menuitem"
              className="adw-sidebar-item"
              style={{
                borderRadius: 0,
                border: "none",
                background: "none",
                width: "100%",
              }}
              onClick={handleCopyShareLink}
            >
              <Share2 size={15} />
              <span>Copy share link</span>
            </button>

            {!entry.is_directory && (
              <button
                role="menuitem"
                className="adw-sidebar-item"
                style={{
                  borderRadius: 0,
                  border: "none",
                  background: "none",
                  width: "100%",
                }}
                onClick={() => {
                  openVersionHistory(entry);
                  onClose();
                }}
              >
                <History size={15} />
                <span>Version History</span>
              </button>
            )}

            <div
              style={{
                height: 1,
                backgroundColor: "var(--border-color)",
                margin: "4px 0",
              }}
            />
          </>
        )}

        {/* Quick Preview */}
        {!entry.is_directory && (
          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              setQuickPreviewOpen(true);
              onClose();
            }}
          >
            <Eye size={15} />
            <span>Quick Preview (Space)</span>
          </button>
        )}

        {/* Compression & Extraction */}
        {isImageOrPdf && onCompressToSize && (
          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              onCompressToSize(entry);
              onClose();
            }}
          >
            <FileDown size={15} color="var(--adw-accent-blue)" />
            <span>Compress to Desired Size...</span>
          </button>
        )}

        {isArchive && onExtract && (
          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              onExtract();
              onClose();
            }}
          >
            <FileArchive size={15} color="var(--adw-accent-blue)" />
            <span>Extract Archive...</span>
          </button>
        )}

        {onCompress && (
          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              onCompress();
              onClose();
            }}
          >
            <Archive size={15} />
            <span>Compress to ZIP...</span>
          </button>
        )}

        <div
          style={{
            height: 1,
            backgroundColor: "var(--border-color)",
            margin: "4px 0",
          }}
        />

        {/* Rename & Batch Rename */}
        {isMultiSelected && onBatchRename ? (
          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              onBatchRename();
              onClose();
            }}
          >
            <Edit2 size={15} />
            <span>Batch Rename ({selectedIds.size} items)...</span>
          </button>
        ) : (
          <button
            role="menuitem"
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              onStartRename(entry);
              onClose();
            }}
          >
            <Edit2 size={15} />
            <span>Rename...</span>
          </button>
        )}

        {/* Delete & Permanent Delete */}
        <button
          role="menuitem"
          className="adw-sidebar-item"
          style={{
            borderRadius: 0,
            border: "none",
            background: "none",
            width: "100%",
          }}
          onClick={handleTrash}
        >
          <Trash2 size={15} color="var(--state-error)" />
          <span style={{ color: "var(--state-error)" }}>Move to Trash</span>
        </button>

        <button
          role="menuitem"
          className="adw-sidebar-item"
          style={{
            borderRadius: 0,
            border: "none",
            background: "none",
            width: "100%",
          }}
          onClick={handleDeletePermanent}
        >
          <Trash size={15} color="var(--state-error)" />
          <span style={{ color: "var(--state-error)" }}>
            Delete Permanently (Shift+Del)
          </span>
        </button>

        <div
          style={{
            height: 1,
            backgroundColor: "var(--border-color)",
            margin: "4px 0",
          }}
        />

        {/* Folder Intelligence */}
        <button
          role="menuitem"
          className="adw-sidebar-item"
          style={{
            borderRadius: 0,
            border: "none",
            background: "none",
            width: "100%",
          }}
          onClick={() => {
            setSmartCleanupOpen(true);
            onClose();
          }}
        >
          <Sparkles size={15} color="var(--adw-accent-yellow)" />
          <span>Folder Intelligence & Cleanup...</span>
        </button>

        {/* Properties */}
        <button
          role="menuitem"
          className="adw-sidebar-item"
          style={{
            borderRadius: 0,
            border: "none",
            background: "none",
            width: "100%",
          }}
          onClick={() => {
            onOpenProperties(entry);
            onClose();
          }}
        >
          <Info size={15} />
          <span>Properties (Alt+Enter)</span>
        </button>
      </div>
    </>
  );
};
