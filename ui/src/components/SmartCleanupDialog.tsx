import React, { useState, useRef } from "react";
import {
  X,
  Sparkles,
  Trash2,
  Copy,
  FolderX,
  FolderSync,
  Check,
  RefreshCw,
  Eye,
  CheckSquare,
  Square,
  Loader2,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { formatLocalizedDate, formatLocalizedFileSize } from "../i18n";
import { FileIcon } from "./FileIcon";

type CleanupTab = "duplicates" | "empty_folders" | "duplicate_folders";

export const SmartCleanupDialog: React.FC = () => {
  const {
    isSmartCleanupOpen,
    setSmartCleanupOpen,
    folderIntelligence,
    isAnalyzingIntelligence,
    runFolderIntelligenceScan,
    currentFolderId,
    breadcrumbs,
    language,
    trashSelected,
    showToast,
    openItem,
    entries,
  } = useExplorerStore();

  const [activeTab, setActiveTab] = useState<CleanupTab>("duplicates");
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set());
  const [selectedEmptyFolderIds, setSelectedEmptyFolderIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState<{
    completed: number;
    total: number;
    currentName?: string;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelDeletion = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  if (!isSmartCleanupOpen) return null;

  const currentFolderName = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : "Folder";

  const emptyFolders = folderIntelligence?.empty_folders || [];
  const duplicateFiles = folderIntelligence?.duplicate_files || [];
  const duplicateFolders = folderIntelligence?.duplicate_folders || [];
  const summary = folderIntelligence?.summary || {
    empty_folder_count: 0,
    duplicate_group_count: 0,
    duplicate_file_count: 0,
    duplicate_folder_group_count: 0,
    reclaimable_bytes: 0,
  };

  // Toggle selection for a duplicate file ID
  const toggleDuplicateSelect = (id: string) => {
    setSelectedDuplicateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle selection for an empty folder ID
  const toggleEmptyFolderSelect = (id: string) => {
    setSelectedEmptyFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Helper to get created time (ctime with fallback to mtime)
  const getCreatedTime = (item: { ctime?: number | null; mtime: number }): number => {
    return item.ctime || item.mtime || 0;
  };

  // Select all newer duplicates across all groups (keeping the oldest in each group by created time)
  const selectKeepOldest = () => {
    const toDelete = new Set<string>();
    duplicateFiles.forEach((group) => {
      if (group.items.length <= 1) return;
      const sorted = [...group.items].sort((a, b) => {
        const ca = getCreatedTime(a);
        const cb = getCreatedTime(b);
        if (ca !== cb) return ca - cb;
        if (a.mtime !== b.mtime) return a.mtime - b.mtime;
        return a.id.localeCompare(b.id);
      });
      sorted.slice(1).forEach((item) => toDelete.add(item.id));
    });
    setSelectedDuplicateIds(toDelete);
  };

  // Select all older duplicates across all groups (keeping the newest in each group by created time)
  const selectKeepNewest = () => {
    const toDelete = new Set<string>();
    duplicateFiles.forEach((group) => {
      if (group.items.length <= 1) return;
      const sorted = [...group.items].sort((a, b) => {
        const ca = getCreatedTime(a);
        const cb = getCreatedTime(b);
        if (ca !== cb) return cb - ca;
        if (a.mtime !== b.mtime) return b.mtime - a.mtime;
        return a.id.localeCompare(b.id);
      });
      sorted.slice(1).forEach((item) => toDelete.add(item.id));
    });
    setSelectedDuplicateIds(toDelete);
  };

  // Select all duplicates keeping the largest copy in each group (e.g. keep 7.1 KB over 7.0 KB)
  const selectKeepLargest = () => {
    const toDelete = new Set<string>();
    duplicateFiles.forEach((group) => {
      if (group.items.length <= 1) return;
      const sorted = [...group.items].sort((a, b) => {
        if (b.size !== a.size) return b.size - a.size;
        const ca = getCreatedTime(a);
        const cb = getCreatedTime(b);
        if (ca !== cb) return cb - ca;
        return a.id.localeCompare(b.id);
      });
      sorted.slice(1).forEach((item) => toDelete.add(item.id));
    });
    setSelectedDuplicateIds(toDelete);
  };

  // Select all duplicates keeping any one arbitrary copy of each group
  const selectKeepAnyOne = () => {
    const toDelete = new Set<string>();
    duplicateFiles.forEach((group) => {
      if (group.items.length <= 1) return;
      group.items.slice(1).forEach((item) => toDelete.add(item.id));
    });
    setSelectedDuplicateIds(toDelete);
  };

  // Per-group selection helper
  const setGroupSelection = (group: typeof duplicateFiles[0], mode: "oldest" | "newest" | "largest") => {
    setSelectedDuplicateIds((prev) => {
      const next = new Set(prev);
      group.items.forEach((it) => next.delete(it.id));

      let keeperId = group.items[0].id;
      if (mode === "oldest") {
        const sorted = [...group.items].sort((a, b) => {
          const ca = getCreatedTime(a);
          const cb = getCreatedTime(b);
          if (ca !== cb) return ca - cb;
          return a.mtime - b.mtime;
        });
        keeperId = sorted[0].id;
      } else if (mode === "newest") {
        const sorted = [...group.items].sort((a, b) => {
          const ca = getCreatedTime(a);
          const cb = getCreatedTime(b);
          if (ca !== cb) return cb - ca;
          return b.mtime - a.mtime;
        });
        keeperId = sorted[0].id;
      } else if (mode === "largest") {
        const sorted = [...group.items].sort((a, b) => {
          if (b.size !== a.size) return b.size - a.size;
          return getCreatedTime(b) - getCreatedTime(a);
        });
        keeperId = sorted[0].id;
      }

      group.items.forEach((it) => {
        if (it.id !== keeperId) next.add(it.id);
      });

      return next;
    });
  };

  // Delete a single item
  const handleDeleteSingle = async (id: string, name: string) => {
    setIsDeleting(true);
    try {
      await trashSelected([id]);
      showToast(`Moved "${name}" to Trash`, true);
      await runFolderIntelligenceScan();
    } catch (err: any) {
      showToast(err.message || "Failed to remove item");
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete all empty folders
  const handleDeleteAllEmptyFolders = async () => {
    if (emptyFolders.length === 0) return;
    const ids = emptyFolders.map((f) => f.id);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsDeleting(true);
    setDeletionProgress({ completed: 0, total: ids.length, currentName: "Starting deletion..." });

    try {
      const res = await trashSelected(ids, {
        onProgress: (completed, total, currentName) => {
          setDeletionProgress({ completed, total, currentName });
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        showToast(`Cancelled: Moved ${res.trashedCount} of ${ids.length} empty folders to Trash`, true);
      } else {
        showToast(`Moved ${res.trashedCount} empty folder${res.trashedCount > 1 ? "s" : ""} to Trash`, true);
      }
      setSelectedEmptyFolderIds(new Set());
      await runFolderIntelligenceScan();
    } catch (err: any) {
      showToast(err.message || "Failed to remove empty folders");
    } finally {
      setIsDeleting(false);
      setDeletionProgress(null);
      abortControllerRef.current = null;
    }
  };

  // Delete selected empty folders
  const handleDeleteSelectedEmptyFolders = async () => {
    if (selectedEmptyFolderIds.size === 0) return;
    const ids = Array.from(selectedEmptyFolderIds);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsDeleting(true);
    setDeletionProgress({ completed: 0, total: ids.length, currentName: "Starting deletion..." });

    try {
      const res = await trashSelected(ids, {
        onProgress: (completed, total, currentName) => {
          setDeletionProgress({ completed, total, currentName });
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        showToast(`Cancelled: Moved ${res.trashedCount} of ${ids.length} empty folders to Trash`, true);
      } else {
        showToast(`Moved ${res.trashedCount} empty folder${res.trashedCount > 1 ? "s" : ""} to Trash`, true);
      }
      setSelectedEmptyFolderIds(new Set());
      await runFolderIntelligenceScan();
    } catch (err: any) {
      showToast(err.message || "Failed to remove empty folders");
    } finally {
      setIsDeleting(false);
      setDeletionProgress(null);
      abortControllerRef.current = null;
    }
  };

  // Delete selected duplicates
  const handleDeleteSelectedDuplicates = async () => {
    if (selectedDuplicateIds.size === 0) return;
    const ids = Array.from(selectedDuplicateIds);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsDeleting(true);
    setDeletionProgress({ completed: 0, total: ids.length, currentName: "Starting deletion..." });

    try {
      const res = await trashSelected(ids, {
        onProgress: (completed, total, currentName) => {
          setDeletionProgress({ completed, total, currentName });
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        showToast(`Cancelled: Moved ${res.trashedCount} of ${ids.length} duplicate files to Trash`, true);
      } else {
        showToast(`Moved ${res.trashedCount} duplicate file${res.trashedCount > 1 ? "s" : ""} to Trash`, true);
      }
      setSelectedDuplicateIds(new Set());
      await runFolderIntelligenceScan();
    } catch (err: any) {
      showToast(err.message || "Failed to remove duplicate files");
    } finally {
      setIsDeleting(false);
      setDeletionProgress(null);
      abortControllerRef.current = null;
    }
  };

  // Auto-clean all duplicates (keep 1 copy, remove all redundant duplicates)
  const handleAutoCleanAllDuplicates = async () => {
    const ids: string[] = [];
    duplicateFiles.forEach((group) => {
      // Keep the newest copy, remove older duplicates
      const redundant = group.items.slice(0, group.items.length - 1);
      redundant.forEach((item) => ids.push(item.id));
    });
    if (ids.length === 0) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsDeleting(true);
    setDeletionProgress({ completed: 0, total: ids.length, currentName: "Starting cleanup..." });

    try {
      const res = await trashSelected(ids, {
        onProgress: (completed, total, currentName) => {
          setDeletionProgress({ completed, total, currentName });
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        showToast(`Cancelled: Removed ${res.trashedCount} of ${ids.length} redundant duplicate copies`, true);
      } else {
        showToast(`Removed ${res.trashedCount} redundant duplicate copies`, true);
      }
      setSelectedDuplicateIds(new Set());
      await runFolderIntelligenceScan();
    } catch (err: any) {
      showToast(err.message || "Failed to clean duplicates");
    } finally {
      setIsDeleting(false);
      setDeletionProgress(null);
      abortControllerRef.current = null;
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2250,
      }}
      onClick={() => setSmartCleanupOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-cleanup-title"
        style={{
          width: 720,
          maxWidth: "94vw",
          height: 560,
          maxHeight: "88vh",
          backgroundColor: "var(--popover-bg)",
          borderRadius: "var(--adw-radius-l)",
          boxShadow: "var(--popover-shadow)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            background: "var(--headerbar-bg)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={18} color="var(--active-accent)" />
            <div>
              <h3 id="smart-cleanup-title" style={{ fontSize: 15, fontWeight: 600 }}>
                Folder Intelligence & Cleanup
              </h3>
              <div style={{ fontSize: 11, color: "var(--dim-fg)" }}>
                Scanning displayed items in: <span style={{ fontFamily: "var(--adw-font-mono)" }}>{currentFolderId || currentFolderName}</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              className="adw-btn adw-btn-icon"
              style={{ width: 28, height: 28 }}
              onClick={runFolderIntelligenceScan}
              disabled={isAnalyzingIntelligence}
              title="Rescan current folder"
            >
              <RefreshCw size={13} className={isAnalyzingIntelligence ? "adw-spin" : ""} />
            </button>
            <button
              className="adw-btn adw-btn-icon"
              style={{ width: 28, height: 28 }}
              onClick={() => setSmartCleanupOpen(false)}
              aria-label="Close dialog"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Intelligence Stats Summary Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: "14px 18px",
            background: "var(--view-bg)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          {/* Duplicates Summary Card */}
          <div
            style={{
              padding: "10px 14px",
              background: "var(--card-bg)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--adw-radius-m)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: summary.reclaimable_bytes > 0 ? "rgba(229, 165, 10, 0.15)" : "rgba(120, 120, 120, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Copy size={18} color={summary.reclaimable_bytes > 0 ? "var(--adw-accent-yellow)" : "var(--dim-fg)"} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim-fg)", textTransform: "uppercase" }}>
                Duplicate Files
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--window-fg)" }}>
                {summary.duplicate_file_count > 0 ? `${summary.duplicate_file_count} copies` : "None found"}
                {summary.reclaimable_bytes > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--adw-accent-yellow)", marginLeft: 6 }}>
                    ({formatLocalizedFileSize(summary.reclaimable_bytes, language)} reclaimable)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Empty Folders Summary Card */}
          <div
            style={{
              padding: "10px 14px",
              background: "var(--card-bg)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--adw-radius-m)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: summary.empty_folder_count > 0 ? "rgba(53, 132, 228, 0.15)" : "rgba(120, 120, 120, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <FolderX size={18} color={summary.empty_folder_count > 0 ? "var(--adw-accent-blue)" : "var(--dim-fg)"} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim-fg)", textTransform: "uppercase" }}>
                Empty Folders
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--window-fg)" }}>
                {summary.empty_folder_count > 0 ? `${summary.empty_folder_count} empty folders` : "None found"}
              </div>
            </div>
          </div>
        </div>

        {/* Live Deletion Progress Bar */}
        {deletionProgress && (
          <div
            style={{
              padding: "12px 18px",
              background: "rgba(53, 132, 228, 0.08)",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              animation: "fadeIn 150ms ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Loader2 size={15} className="spin" color="var(--adw-accent-blue)" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Deleting Files...</span>
                <span style={{ fontSize: 12, color: "var(--dim-fg)" }}>
                  ({deletionProgress.completed} of {deletionProgress.total})
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--adw-accent-blue)",
                    fontFamily: "var(--adw-font-mono)",
                  }}
                >
                  {Math.round((deletionProgress.completed / Math.max(1, deletionProgress.total)) * 100)}%
                </span>
                <button
                  type="button"
                  className="adw-btn adw-btn-destructive"
                  style={{ height: 24, fontSize: 11, padding: "0 10px" }}
                  onClick={handleCancelDeletion}
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Visual Progress Bar Track and Indicator */}
            <div
              style={{
                height: 6,
                backgroundColor: "var(--border-color)",
                borderRadius: 3,
                overflow: "hidden",
                width: "100%",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(100, Math.round((deletionProgress.completed / Math.max(1, deletionProgress.total)) * 100))}%`,
                  backgroundColor: "var(--adw-accent-blue)",
                  transition: "width 150ms ease",
                }}
              />
            </div>

            {deletionProgress.currentName && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--dim-fg)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Processing: <span style={{ fontFamily: "var(--adw-font-mono)" }}>{deletionProgress.currentName}</span>
              </div>
            )}
          </div>
        )}

        {/* Tab Switcher */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 18px",
            gap: 8,
            background: "var(--headerbar-bg)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <button
            type="button"
            className={`adw-btn ${activeTab === "duplicates" ? "adw-btn-accent" : ""}`}
            style={{ height: 28, fontSize: 12, gap: 6 }}
            onClick={() => setActiveTab("duplicates")}
          >
            <Copy size={13} />
            <span>Duplicate Files ({summary.duplicate_file_count})</span>
          </button>

          <button
            type="button"
            className={`adw-btn ${activeTab === "empty_folders" ? "adw-btn-accent" : ""}`}
            style={{ height: 28, fontSize: 12, gap: 6 }}
            onClick={() => setActiveTab("empty_folders")}
          >
            <FolderX size={13} />
            <span>Empty Folders ({summary.empty_folder_count})</span>
          </button>

          {duplicateFolders.length > 0 && (
            <button
              type="button"
              className={`adw-btn ${activeTab === "duplicate_folders" ? "adw-btn-accent" : ""}`}
              style={{ height: 28, fontSize: 12, gap: 6 }}
              onClick={() => setActiveTab("duplicate_folders")}
            >
              <FolderSync size={13} />
              <span>Duplicate Folders ({duplicateFolders.length})</span>
            </button>
          )}
        </div>

        {/* Tab Viewport */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* TAB 1: DUPLICATE FILES */}
          {activeTab === "duplicates" && (
            <>
              {duplicateFiles.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: 1,
                    textAlign: "center",
                    color: "var(--dim-fg)",
                    gap: 10,
                    padding: "50px 20px",
                  }}
                >
                  <Check size={44} color="var(--state-available)" strokeWidth={1.5} />
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--window-fg)" }}>
                    No Duplicate Files Detected
                  </div>
                  <div style={{ fontSize: 12 }}>
                    All files currently in this directory appear to be unique.
                  </div>
                </div>
              ) : (
                <>
                  {/* Quick Group Selection Helpers */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: 12,
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ color: "var(--dim-fg)", fontWeight: 500 }}>
                      Filter & Select:
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="adw-btn"
                        style={{ height: 26, fontSize: 11 }}
                        onClick={selectKeepOldest}
                        title="Keep oldest copy by created time, mark newer copies for removal"
                      >
                        Keep Oldest (Created)
                      </button>
                      <button
                        type="button"
                        className="adw-btn"
                        style={{ height: 26, fontSize: 11 }}
                        onClick={selectKeepNewest}
                        title="Keep newest copy by created time, mark older copies for removal"
                      >
                        Keep Newest (Created)
                      </button>
                      <button
                        type="button"
                        className="adw-btn"
                        style={{ height: 26, fontSize: 11 }}
                        onClick={selectKeepLargest}
                        title="Keep largest size copy (e.g. 7.1 KB over 7.0 KB), mark others for removal"
                      >
                        Keep Largest (Size)
                      </button>
                      <button
                        type="button"
                        className="adw-btn"
                        style={{ height: 26, fontSize: 11 }}
                        onClick={selectKeepAnyOne}
                        title="Keep any 1 arbitrary copy of each duplicate set, mark all other copies for removal"
                      >
                        Keep Any 1 Copy
                      </button>
                      {selectedDuplicateIds.size > 0 && (
                        <button
                          type="button"
                          className="adw-btn"
                          style={{ height: 26, fontSize: 11 }}
                          onClick={() => setSelectedDuplicateIds(new Set())}
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Duplicate Groups List */}
                  {duplicateFiles.map((group, gIdx) => {
                    const firstEntry = entries.find((e) => e.id === group.items[0].id) || {
                      name: group.items[0].name,
                      is_directory: false,
                      path: group.items[0].path,
                      thumbnail_url: group.items[0].thumbnail_url,
                    };
                    const hasSizeVariation = group.items.some((it) => it.size !== group.items[0].size);
                    const maxSize = Math.max(...group.items.map((it) => it.size));
                    const minTime = Math.min(...group.items.map((it) => getCreatedTime(it)));
                    const maxTime = Math.max(...group.items.map((it) => getCreatedTime(it)));

                    return (
                      <div
                        key={`group_${gIdx}_${group.hash}`}
                        style={{
                          background: "var(--card-bg)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "var(--adw-radius-m)",
                          padding: "12px 14px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {/* Group Header */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            borderBottom: "1px solid var(--border-color)",
                            paddingBottom: 8,
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                            <FileIcon entry={firstEntry} size={24} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                Duplicate Set #{gIdx + 1} ({group.items.length} copies) — {firstEntry.name}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--dim-fg)" }}>
                                {hasSizeVariation ? `Max size: ${formatLocalizedFileSize(maxSize, language)}` : `Size: ${formatLocalizedFileSize(group.size, language)}`} • Reclaimable: {formatLocalizedFileSize(group.reclaimable_bytes, language)}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button
                              type="button"
                              className="adw-btn"
                              style={{ height: 22, fontSize: 10, padding: "0 6px" }}
                              onClick={() => setGroupSelection(group, "oldest")}
                              title="Keep oldest copy by created time, mark others for removal"
                            >
                              Keep Oldest
                            </button>
                            <button
                              type="button"
                              className="adw-btn"
                              style={{ height: 22, fontSize: 10, padding: "0 6px" }}
                              onClick={() => setGroupSelection(group, "newest")}
                              title="Keep newest copy by created time, mark others for removal"
                            >
                              Keep Newest
                            </button>
                            {hasSizeVariation && (
                              <button
                                type="button"
                                className="adw-btn"
                                style={{ height: 22, fontSize: 10, padding: "0 6px" }}
                                onClick={() => setGroupSelection(group, "largest")}
                                title="Keep largest size copy, mark smaller copies for removal"
                              >
                                Keep Largest
                              </button>
                            )}
                          </div>
                        </div>

                        {/* List of Copies in this group */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {group.items.map((item) => {
                            const isSelected = selectedDuplicateIds.has(item.id);
                            const createdTime = getCreatedTime(item);
                            const isLargest = hasSizeVariation && item.size === maxSize;
                            const isOldestTime = createdTime === minTime;
                            const isNewestTime = createdTime === maxTime && minTime !== maxTime;

                            return (
                              <div
                                key={item.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "6px 10px",
                                  borderRadius: "var(--adw-radius-s)",
                                  background: isSelected ? "var(--selected-bg)" : "transparent",
                                  border: isSelected ? "1px solid var(--adw-accent-blue)" : "1px solid transparent",
                                  fontSize: 12,
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, cursor: "pointer", flex: 1 }}
                                  onClick={() => toggleDuplicateSelect(item.id)}
                                >
                                  {isSelected ? (
                                    <CheckSquare size={16} color="var(--adw-accent-blue)" />
                                  ) : (
                                    <Square size={16} color="var(--dim-fg)" />
                                  )}
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                      <span>{item.name}</span>
                                      {isLargest && (
                                        <span
                                          style={{
                                            background: "rgba(46, 194, 89, 0.15)",
                                            color: "var(--adw-accent-green)",
                                            fontSize: 10,
                                            padding: "1px 6px",
                                            borderRadius: 4,
                                            fontWeight: 600,
                                          }}
                                          title="Largest size in this duplicate set"
                                        >
                                          Largest ({formatLocalizedFileSize(item.size, language)})
                                        </span>
                                      )}
                                      {hasSizeVariation && !isLargest && (
                                        <span style={{ fontSize: 10, color: "var(--dim-fg)" }}>
                                          ({formatLocalizedFileSize(item.size, language)})
                                        </span>
                                      )}
                                      {isOldestTime && (
                                        <span style={{ fontSize: 10, color: "var(--dim-fg)", fontStyle: "italic" }}>
                                          (Oldest Created)
                                        </span>
                                      )}
                                      {isNewestTime && (
                                        <span style={{ fontSize: 10, color: "var(--adw-accent-blue)", fontStyle: "italic" }}>
                                          (Newest Created)
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: 10, color: "var(--dim-fg)", fontFamily: "var(--adw-font-mono)", display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                                      <span>Created: {formatLocalizedDate(createdTime, language)}</span>
                                      {item.mtime !== createdTime && (
                                        <span>Modified: {formatLocalizedDate(item.mtime, language)}</span>
                                      )}
                                      {!hasSizeVariation && <span>Size: {formatLocalizedFileSize(item.size, language)}</span>}
                                    </div>
                                    {item.path && item.path !== item.name && (
                                      <div
                                        style={{
                                          fontSize: 10,
                                          color: "var(--dim-fg)",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                          maxWidth: 420,
                                          marginTop: 2,
                                        }}
                                        title={item.path}
                                      >
                                        Location: {item.path}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    className="adw-btn adw-btn-icon"
                                    style={{ width: 26, height: 26 }}
                                    onClick={() => {
                                      const full = entries.find((e) => e.id === item.id);
                                      if (full) openItem(full);
                                    }}
                                    title="Open file"
                                  >
                                    <Eye size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="adw-btn adw-btn-icon adw-btn-destructive"
                                    style={{ width: 26, height: 26 }}
                                    disabled={isDeleting}
                                    onClick={() => handleDeleteSingle(item.id, item.name)}
                                    title="Delete this copy"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}

          {/* TAB 2: EMPTY FOLDERS */}
          {activeTab === "empty_folders" && (
            <>
              {emptyFolders.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: 1,
                    textAlign: "center",
                    color: "var(--dim-fg)",
                    gap: 10,
                    padding: "50px 20px",
                  }}
                >
                  <Check size={44} color="var(--state-available)" strokeWidth={1.5} />
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--window-fg)" }}>
                    No Empty Folders Found
                  </div>
                  <div style={{ fontSize: 12 }}>
                    All folders in this location contain at least one file or subfolder.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--dim-fg)" }}>
                    <span>Found {emptyFolders.length} empty directory structures in current view:</span>
                    <button
                      type="button"
                      className="adw-btn"
                      style={{ height: 26, fontSize: 11, padding: "0 8px" }}
                      onClick={() => {
                        if (selectedEmptyFolderIds.size === emptyFolders.length) {
                          setSelectedEmptyFolderIds(new Set());
                        } else {
                          setSelectedEmptyFolderIds(new Set(emptyFolders.map((f) => f.id)));
                        }
                      }}
                    >
                      {selectedEmptyFolderIds.size === emptyFolders.length ? "Deselect All" : "Select All"}
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {emptyFolders.map((folder) => {
                      const isFolderSelected = selectedEmptyFolderIds.has(folder.id);
                      return (
                        <div
                          key={folder.id}
                          style={{
                            background: isFolderSelected ? "rgba(53, 132, 228, 0.08)" : "var(--card-bg)",
                            border: `1px solid ${isFolderSelected ? "var(--adw-accent-blue)" : "var(--border-color)"}`,
                            borderRadius: "var(--adw-radius-m)",
                            padding: "10px 14px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <button
                              type="button"
                              className="adw-btn adw-btn-icon"
                              style={{ width: 26, height: 26, flexShrink: 0 }}
                              onClick={() => toggleEmptyFolderSelect(folder.id)}
                              aria-label={`Select ${folder.name}`}
                            >
                              {isFolderSelected ? (
                                <CheckSquare size={16} color="var(--active-accent)" />
                              ) : (
                                <Square size={16} color="var(--dim-fg)" />
                              )}
                            </button>
                            <FolderX size={20} color="var(--dim-fg)" style={{ flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {folder.name}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--dim-fg)", fontFamily: "var(--adw-font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {folder.path}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="adw-btn adw-btn-destructive"
                            style={{ height: 28, padding: "0 10px", fontSize: 12, gap: 6 }}
                            disabled={isDeleting}
                            onClick={() => handleDeleteSingle(folder.id, folder.name)}
                            title="Remove this empty folder"
                          >
                            <Trash2 size={13} />
                            <span>Remove</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {/* TAB 3: DUPLICATE FOLDERS */}
          {activeTab === "duplicate_folders" && (
            <>
              {duplicateFolders.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--dim-fg)" }}>
                  No duplicate folder structures found.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {duplicateFolders.map((grp, idx) => (
                    <div
                      key={`dup_folder_${idx}`}
                      style={{
                        background: "var(--card-bg)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--adw-radius-m)",
                        padding: "12px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        Duplicate Folder Set #{idx + 1} ({grp.items.length} copies)
                      </div>
                      {grp.items.map((item, itemIdx) => (
                        <div
                          key={item.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 10px",
                            fontSize: 12,
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 500 }}>{item.name}</span>
                            <span style={{ fontSize: 11, color: "var(--dim-fg)", marginLeft: 6 }}>
                              ({item.item_count} items)
                            </span>
                          </div>
                          {itemIdx > 0 && (
                            <button
                              type="button"
                              className="adw-btn adw-btn-destructive"
                              style={{ height: 26, fontSize: 11 }}
                              disabled={isDeleting}
                              onClick={() => handleDeleteSingle(item.id, item.name)}
                            >
                              <Trash2 size={12} />
                              <span>Remove Copy</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Action Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            background: "var(--headerbar-bg)",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <div>
            {deletionProgress ? (
              <span style={{ fontSize: 12, color: "var(--adw-accent-blue)", fontWeight: 600 }}>
                Deleting {deletionProgress.completed} of {deletionProgress.total} items...
              </span>
            ) : activeTab === "duplicates" && selectedDuplicateIds.size > 0 ? (
              <span style={{ fontSize: 12, color: "var(--dim-fg)" }}>
                {selectedDuplicateIds.size} duplicate file{selectedDuplicateIds.size > 1 ? "s" : ""} selected for removal
              </span>
            ) : null}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="adw-btn"
              disabled={isDeleting}
              onClick={() => setSmartCleanupOpen(false)}
            >
              Close
            </button>

            {activeTab === "duplicates" && selectedDuplicateIds.size > 0 && (
              <button
                type="button"
                className="adw-btn adw-btn-destructive"
                style={{ padding: "0 14px", gap: 6 }}
                disabled={isDeleting}
                onClick={handleDeleteSelectedDuplicates}
              >
                <Trash2 size={13} />
                <span>Delete Selected ({selectedDuplicateIds.size})</span>
              </button>
            )}

            {activeTab === "duplicates" && duplicateFiles.length > 0 && selectedDuplicateIds.size === 0 && (
              <button
                type="button"
                className="adw-btn adw-btn-accent"
                style={{ padding: "0 14px", gap: 6 }}
                disabled={isDeleting}
                onClick={handleAutoCleanAllDuplicates}
              >
                <Sparkles size={13} />
                <span>Clean All Duplicates (Keep 1 copy)</span>
              </button>
            )}

            {activeTab === "empty_folders" && selectedEmptyFolderIds.size > 0 && (
              <button
                type="button"
                className="adw-btn adw-btn-destructive"
                style={{ padding: "0 14px", gap: 6 }}
                disabled={isDeleting}
                onClick={handleDeleteSelectedEmptyFolders}
              >
                <Trash2 size={13} />
                <span>Remove Selected ({selectedEmptyFolderIds.size})</span>
              </button>
            )}

            {activeTab === "empty_folders" && emptyFolders.length > 0 && selectedEmptyFolderIds.size === 0 && (
              <button
                type="button"
                className="adw-btn adw-btn-destructive"
                style={{ padding: "0 14px", gap: 6 }}
                disabled={isDeleting}
                onClick={handleDeleteAllEmptyFolders}
              >
                <Trash2 size={13} />
                <span>Remove All Empty Folders ({emptyFolders.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
