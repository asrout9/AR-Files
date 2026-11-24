import React, { useEffect, useState } from "react";
import { HeaderBar } from "./components/HeaderBar";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { ListView } from "./components/ListView";
import { GridView } from "./components/GridView";
import { ContextMenu } from "./components/ContextMenu";
import { PropertiesDialog } from "./components/PropertiesDialog";
import { BatchRenameDialog } from "./components/BatchRenameDialog";
import { ConflictDialog, ConflictChoice } from "./components/ConflictDialog";
import { ProgressPopover } from "./components/ProgressPopover";
import { DetailsPane } from "./components/DetailsPane";
import { QuickPreviewModal } from "./components/QuickPreviewModal";
import { PreferencesDialog } from "./components/PreferencesDialog";
import { DiagnosticsDialog } from "./components/DiagnosticsDialog";
import { VersionHistoryDialog } from "./components/VersionHistoryDialog";
import { AddCloudDialog } from "./components/AddCloudDialog";
import { ReauthDialog } from "./components/ReauthDialog";
import { PreviewPane } from "./components/PreviewPane";
import { OpenWithModal } from "./components/OpenWithModal";
import { SmartCleanupDialog } from "./components/SmartCleanupDialog";
import { CompressToSizeDialog } from "./components/CompressToSizeDialog";
import { Sparkles, X } from "lucide-react";
import { formatLocalizedFileSize } from "./i18n";
import { invokeCommand } from "./services/ipc";
import { useExplorerStore } from "./store/useExplorerStore";
import { EntryRecord } from "./types";

export const App: React.FC = () => {
  const {
    viewMode,
    entries,
    selectedIds,
    currentFolderId,
    toggleSelect,
    clearSelection,
    loadAccounts,
    loadEntries,
    renameItem,
    batchRename,
    trashSelected,
    deletePermanently,
    undoLastOperation,
    redoLastOperation,
    compressItems,
    extractArchive,
    setQuickPreviewOpen,
    isQuickPreviewOpen,
    setPreferencesOpen,
    toast,
    showToast,
    clearToast,
    folderIntelligence,
    isIntelligenceBannerDismissed,
    dismissIntelligenceBanner,
    setSmartCleanupOpen,
    language,
    activeJobs,
    addActiveJob,
    removeActiveJob,
    cancelActiveJob,
    navigateTo,
    clipboard,
    copySelected,
    cutSelected,
    pasteClipboard,
    duplicateSelected,
    selectAll,
  } = useExplorerStore();

  const [pickerConfig] = useState<{
    active: boolean;
    mode: "open" | "save" | "save_files";
    multiple?: boolean;
    directory?: boolean;
    title?: string;
    accept_label?: string;
    current_name?: string;
    handle: string;
  } | null>(() => {
    if (typeof window !== "undefined" && (window as any).__PICKER_MODE__?.active) {
      return (window as any).__PICKER_MODE__;
    }
    return null;
  });

  const [saveFileName, setSaveFileName] = useState(() => {
    if (typeof window !== "undefined" && (window as any).__PICKER_MODE__?.current_name) {
      return (window as any).__PICKER_MODE__.current_name;
    }
    return "";
  });

  const [contextMenuTarget, setContextMenuTarget] = useState<{
    entry: EntryRecord | null;
    x: number;
    y: number;
  } | null>(null);

  const [propertiesEntry, setPropertiesEntry] = useState<EntryRecord | null>(null);
  const [openWithEntry, setOpenWithEntry] = useState<EntryRecord | null>(null);
  const [compressToSizeEntry, setCompressToSizeEntry] = useState<EntryRecord | null>(null);
  const [renamingEntry, setRenamingEntry] = useState<EntryRecord | null>(null);
  const [newName, setNewName] = useState("");
  const [isBatchRenameOpen, setIsBatchRenameOpen] = useState(false);
  const [conflictData, setConflictData] = useState<{
    source: EntryRecord;
    existing: EntryRecord;
    pendingAction: () => void;
  } | null>(null);

  useEffect(() => {
    loadAccounts();
    loadEntries();
  }, [loadAccounts, loadEntries]);

  // Global Operations Keyboard Shortcuts (Undo, Redo, Delete, Rename)
  useEffect(() => {
    const handleGlobalShortcuts = async (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        await undoLastOperation();
        showToast("Operation undone");
      }
      // Ctrl+Shift+Z or Ctrl+Y: Redo
      else if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "z" || e.key === "Z")) ||
        ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y"))
      ) {
        e.preventDefault();
        await redoLastOperation();
        showToast("Operation redone");
      }
      // Ctrl+C: Copy
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "c" || e.key === "C")) {
        if (selectedIds.size > 0) {
          e.preventDefault();
          copySelected();
        }
      }
      // Ctrl+X: Cut
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "x" || e.key === "X")) {
        if (selectedIds.size > 0) {
          e.preventDefault();
          cutSelected();
        }
      }
      // Ctrl+V: Paste
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "v" || e.key === "V")) {
        if (clipboard && clipboard.entries.length > 0) {
          e.preventDefault();
          await pasteClipboard();
        }
      }
      // Ctrl+A: Select All
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        selectAll();
      }
      // Ctrl+D: Duplicate
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "d" || e.key === "D")) {
        if (selectedIds.size > 0) {
          e.preventDefault();
          await duplicateSelected();
        }
      }
      // F2: Rename or Batch Rename
      else if (e.key === "F2") {
        e.preventDefault();
        if (selectedIds.size > 1) {
          setIsBatchRenameOpen(true);
        } else if (selectedIds.size === 1) {
          const id = Array.from(selectedIds)[0];
          const item = entries.find((e) => e.id === id);
          if (item) {
            setRenamingEntry(item);
            setNewName(item.name);
          }
        }
      }
      // Delete: Move to Trash (or Shift+Delete: Permanently Delete)
      else if (e.key === "Delete") {
        e.preventDefault();
        if (selectedIds.size > 0) {
          if (e.shiftKey) {
            await deletePermanently();
            showToast(`Permanently deleted ${selectedIds.size} items`);
          } else {
            const count = selectedIds.size;
            await trashSelected();
            showToast(`Moved ${count} items to Trash`, true);
          }
        }
      }
      // Alt+Enter: Properties
      else if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        if (selectedIds.size > 0) {
          const id = Array.from(selectedIds)[0];
          const item = entries.find((e) => e.id === id);
          if (item) setPropertiesEntry(item);
        }
      }
      // Space: Quick Preview
      else if (e.code === "Space" || e.key === " ") {
        if (selectedIds.size === 1) {
          e.preventDefault();
          setQuickPreviewOpen(!isQuickPreviewOpen);
        }
      }
      // Ctrl+,: Preferences
      else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setPreferencesOpen(true);
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [
    selectedIds,
    entries,
    undoLastOperation,
    redoLastOperation,
    trashSelected,
    deletePermanently,
    isQuickPreviewOpen,
    setQuickPreviewOpen,
    setPreferencesOpen,
    clipboard,
    copySelected,
    cutSelected,
    pasteClipboard,
    duplicateSelected,
    selectAll,
  ]);

  // Navigate on external request (D-Bus FileManager1 or CLI open)
  useEffect(() => {
    const handleOpenPath = (e: any) => {
      const detail = e.detail;
      if (detail && detail.path) {
        const path = detail.path;
        const name =
          path === (window as any).__USER_HOME__
            ? "Home"
            : path.split("/").filter(Boolean).pop() || "Folder";
        navigateTo(null, path, name);
        if (detail.select_name) {
          setTimeout(() => {
            const entry = useExplorerStore
              .getState()
              .entries.find((item) => item.name === detail.select_name);
            if (entry) {
              useExplorerStore.getState().toggleSelect(entry.id, false, false);
            }
          }, 250);
        }
      }
    };
    window.addEventListener("ar-open-path", handleOpenPath);
    return () => window.removeEventListener("ar-open-path", handleOpenPath);
  }, [navigateTo]);

  // Handle double-clicking a file in Portal File Chooser mode
  useEffect(() => {
    const handlePickerDoubleClicked = async (e: any) => {
      const entry: EntryRecord = e.detail?.entry;
      if (!entry || !pickerConfig) return;
      let path = entry.local_path || (entry.account_id === "acc_local" ? entry.path : null);
      if (!path) {
        try {
          const res = await invokeCommand<any>("hydrate_entry", { entry_id: entry.id });
          path = typeof res === "string" ? res : res?.data || res?.local_path;
        } catch {}
      }
      if (path) {
        await invokeCommand("finish_picker_operation", {
          handle: pickerConfig.handle,
          cancelled: false,
          uris: [`file://${path}`],
        });
      }
    };

    window.addEventListener("ar-picker-confirm", handlePickerDoubleClicked);
    return () => window.removeEventListener("ar-picker-confirm", handlePickerDoubleClicked);
  }, [pickerConfig]);

  const selectedEntries = entries.filter((e) => selectedIds.has(e.id));

  const handlePickerConfirm = async () => {
    if (!pickerConfig) return;
    try {
      if (pickerConfig.mode === "save") {
        if (!saveFileName.trim()) return;
        const currentDir =
          currentFolderId ||
          (typeof window !== "undefined" && (window as any).__USER_HOME__
            ? (window as any).__USER_HOME__
            : "/home/abhi");
        const fullPath = `${currentDir.replace(/\/$/, "")}/${saveFileName.trim()}`;
        const uri = `file://${fullPath}`;
        await invokeCommand("finish_picker_operation", {
          handle: pickerConfig.handle,
          cancelled: false,
          uris: [uri],
        });
      } else {
        const uris: string[] = [];
        for (const item of selectedEntries) {
          if (item.account_id === "acc_local" && item.path) {
            uris.push(`file://${item.path}`);
          } else if (item.local_path) {
            uris.push(`file://${item.local_path}`);
          } else {
            try {
              const res = await invokeCommand<any>("hydrate_entry", { entry_id: item.id });
              const dlPath = typeof res === "string" ? res : res?.data || res?.local_path;
              if (dlPath) {
                uris.push(`file://${dlPath}`);
              }
            } catch (he) {
              console.error("Hydration for picker error:", he);
            }
          }
        }
        if (uris.length > 0 || pickerConfig.directory) {
          if (uris.length === 0 && pickerConfig.directory && currentFolderId) {
            uris.push(`file://${currentFolderId}`);
          }
          await invokeCommand("finish_picker_operation", {
            handle: pickerConfig.handle,
            cancelled: false,
            uris,
          });
        }
      }
    } catch (err) {
      console.error("Picker confirm error:", err);
    }
  };

  const handlePickerCancel = async () => {
    if (!pickerConfig) return;
    try {
      await invokeCommand("finish_picker_operation", {
        handle: pickerConfig.handle,
        cancelled: true,
        uris: [],
      });
    } catch (err) {
      console.error("Picker cancel error:", err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, entry: EntryRecord | null) => {
    e.preventDefault();
    if (entry) {
      if (!selectedIds.has(entry.id)) {
        toggleSelect(entry.id, false, false);
      }
    } else {
      clearSelection();
    }
    setContextMenuTarget({
      entry,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (renamingEntry && newName.trim()) {
      renameItem(renamingEntry.id, newName.trim());
      setRenamingEntry(null);
      showToast(`Renamed to "${newName.trim()}"`, true);
    }
  };

  const handleBatchRenameApply = async (
    previews: Array<{ id: string; oldName: string; newName: string }>
  ) => {
    await batchRename(previews);
    showToast(`Batch renamed ${previews.length} items`, true);
  };

  const handleConflictResolve = (choice: ConflictChoice, _applyToAll: boolean) => {
    if (choice === "replace" && conflictData) {
      conflictData.pendingAction();
    }
    setConflictData(null);
  };

  const handleCompress = async () => {
    const selectedList = entries.filter((e) => selectedIds.has(e.id));
    const targetEntries: EntryRecord[] =
      selectedList.length > 0
        ? selectedList
        : contextMenuTarget?.entry
        ? [contextMenuTarget.entry]
        : [];
    const paths = targetEntries
      .map((e) => e.local_path || e.path)
      .filter(Boolean);
    if (paths.length === 0 || targetEntries.length === 0) return;

    const parentDir =
      currentFolderId ||
      (typeof window !== "undefined" && (window as any).__USER_HOME__
        ? (window as any).__USER_HOME__
        : "/home/abhi");
    const baseName = targetEntries[0].name.replace(/\.[^/.]+$/, "");
    const outName = `${baseName}_archive.zip`;
    const outPath = `${parentDir}/${outName}`;

    const jobId = `job_${Date.now()}`;
    addActiveJob({
      id: jobId,
      type: "compress",
      title: `Compressing ${paths.length} items to ZIP`,
      itemsCompleted: 0,
      totalItems: paths.length,
      bytesProcessed: 0,
      totalBytes: 1000000,
      speedBps: 15000000,
      etaSeconds: 2,
      status: "running",
    });

    await compressItems(paths, outPath);

    removeActiveJob(jobId);
    showToast(`Created archive "${outName}"`);
  };

  const handleExtract = async (archiveEntry: EntryRecord) => {
    const p = archiveEntry.local_path || archiveEntry.path;
    const parentDir =
      currentFolderId ||
      (typeof window !== "undefined" && (window as any).__USER_HOME__
        ? (window as any).__USER_HOME__
        : "/home/abhi");
    const folderName = archiveEntry.name.replace(/\.(zip|tar\.gz|tar)$/, "");
    const dest = `${parentDir}/${folderName}`;

    const jobId = `job_extract_${Date.now()}`;
    addActiveJob({
      id: jobId,
      type: "extract",
      title: `Extracting ${archiveEntry.name}`,
      itemsCompleted: 1,
      totalItems: 1,
      bytesProcessed: archiveEntry.size,
      totalBytes: archiveEntry.size,
      speedBps: 20000000,
      etaSeconds: 1,
      status: "running",
    });

    await extractArchive(p, dest);
    removeActiveJob(jobId);
    showToast(`Extracted ${archiveEntry.name} into "${folderName}"`);
  };

  const intelligenceSummary = folderIntelligence?.summary;
  const hasIntelligenceIssues = Boolean(
    intelligenceSummary &&
    (intelligenceSummary.empty_folder_count > 0 ||
      intelligenceSummary.duplicate_file_count > 0 ||
      intelligenceSummary.duplicate_folder_group_count > 0)
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        position: "relative",
      }}
    >
      {/* Nautilus Top Header Bar */}
      <HeaderBar />

      {/* Main Body */}
      <div className="adw-window-container">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Viewport Column with TabBar */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
            height: "100%",
          }}
        >
          <TabBar />
          {hasIntelligenceIssues && !isIntelligenceBannerDismissed && (
            <div className="adw-intelligence-banner">
              <div className="adw-intelligence-banner-content">
                <Sparkles size={15} color="var(--adw-accent-yellow)" style={{ flexShrink: 0 }} />
                <span>
                  Found{" "}
                  {intelligenceSummary!.empty_folder_count > 0 && (
                    <span>
                      <strong>{intelligenceSummary!.empty_folder_count}</strong> empty folder{intelligenceSummary!.empty_folder_count > 1 ? "s" : ""}
                    </span>
                  )}
                  {intelligenceSummary!.empty_folder_count > 0 && (intelligenceSummary!.duplicate_file_count > 0 || intelligenceSummary!.duplicate_folder_group_count > 0) && " and "}
                  {intelligenceSummary!.duplicate_file_count > 0 && (
                    <span>
                      <strong>{intelligenceSummary!.duplicate_file_count}</strong> duplicate files ({formatLocalizedFileSize(intelligenceSummary!.reclaimable_bytes, language)} reclaimable)
                    </span>
                  )}
                  {intelligenceSummary!.duplicate_file_count > 0 && intelligenceSummary!.duplicate_folder_group_count > 0 && ", "}
                  {intelligenceSummary!.duplicate_folder_group_count > 0 && (
                    <span>
                      <strong>{intelligenceSummary!.duplicate_folder_group_count}</strong> duplicate folder groups
                    </span>
                  )}
                  {" in this folder."}
                </span>
              </div>
              <div className="adw-intelligence-banner-actions">
                <button
                  type="button"
                  className="adw-btn adw-btn-accent"
                  style={{ height: 26, fontSize: 11, padding: "0 10px", gap: 5 }}
                  onClick={() => setSmartCleanupOpen(true)}
                >
                  <Sparkles size={12} />
                  <span>Review & Clean</span>
                </button>
                <button
                  type="button"
                  className="adw-btn adw-btn-icon"
                  style={{ height: 24, width: 24 }}
                  onClick={dismissIntelligenceBanner}
                  title="Dismiss banner"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
          <main
            className="adw-viewport"
            style={{ flex: 1 }}
            onContextMenu={(e) => {
              if (
                (e.target as HTMLElement).closest(".adw-table-row") ||
                (e.target as HTMLElement).closest(".adw-grid-item")
              ) {
                return;
              }
              e.preventDefault();
              handleContextMenu(e, null);
            }}
          >
            {viewMode === "list" ? (
              <ListView onContextMenu={handleContextMenu} />
            ) : (
              <GridView onContextMenu={handleContextMenu} />
            )}
          </main>
        </div>

        {/* Windows Explorer Style Preview Pane */}
        <PreviewPane onOpenWith={(entry) => setOpenWithEntry(entry)} />

        {/* Collapsible Details & Properties Right Pane */}
        <DetailsPane />
      </div>

      {/* Portal File Chooser (Upload / Save / Open) Action Bar */}
      {pickerConfig && (
        <div
          className="adw-picker-action-bar"
          style={{
            height: 52,
            background: "var(--headerbar-bg)",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 18px",
            gap: 12,
            zIndex: 1500,
          }}
        >
          {pickerConfig.mode === "save" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, maxWidth: 520 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--dim-fg)", whiteSpace: "nowrap" }}>
                File name:
              </span>
              <input
                type="text"
                className="adw-input"
                style={{ flex: 1, height: 32 }}
                value={saveFileName}
                onChange={(e) => setSaveFileName(e.target.value)}
                placeholder="Enter file name to save..."
              />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
              <span style={{ fontSize: 13, color: "var(--dim-fg)" }}>Selected:</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--window-fg)",
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {selectedEntries.length > 0
                  ? selectedEntries.map((e) => e.name).join(", ")
                  : pickerConfig.directory
                  ? "Select a folder"
                  : "No file selected"}
              </span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="adw-btn"
              style={{ minWidth: 80 }}
              onClick={handlePickerCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="adw-btn adw-btn-accent"
              style={{ minWidth: 100 }}
              disabled={
                pickerConfig.mode === "save"
                  ? !saveFileName.trim()
                  : selectedEntries.length === 0 && !pickerConfig.directory
              }
              onClick={handlePickerConfirm}
            >
              {pickerConfig.accept_label ||
                (pickerConfig.mode === "save" ? "Save" : "Select")}
            </button>
          </div>
        </div>
      )}

      {/* Floating Operations Progress Popover */}
      {activeJobs.length > 0 && (
        <ProgressPopover
          jobs={activeJobs}
          onCancelJob={cancelActiveJob}
          onClose={() => {}}
        />
      )}

      {/* Toast Notification Banner with Undo */}
      {toast && (
        <div className="adw-toast-container">
          <div className="adw-toast">
            <span>{toast.message}</span>
            {toast.withUndo && (
              <button
                className="adw-btn"
                style={{
                  height: 24,
                  padding: "0 8px",
                  fontSize: 12,
                  background: "rgba(255,255,255,0.15)",
                  color: "#ffffff",
                  border: "none",
                }}
                onClick={async () => {
                  await undoLastOperation();
                  clearToast();
                  showToast("Action undone");
                }}
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenuTarget && (
        <ContextMenu
          entry={contextMenuTarget.entry}
          x={contextMenuTarget.x}
          y={contextMenuTarget.y}
          onClose={() => setContextMenuTarget(null)}
          onOpenProperties={(entry) => setPropertiesEntry(entry)}
          onStartRename={(entry) => {
            setRenamingEntry(entry);
            setNewName(entry.name);
          }}
          onBatchRename={() => setIsBatchRenameOpen(true)}
          onCompress={handleCompress}
          onCompressToSize={(entry) => setCompressToSizeEntry(entry)}
          onExtract={() => contextMenuTarget.entry && handleExtract(contextMenuTarget.entry)}
          onDeletePermanently={async (ids?: string[]) => {
            const count = ids?.length || selectedIds.size || 1;
            await deletePermanently(ids);
            showToast(`Permanently deleted ${count} item${count > 1 ? "s" : ""}`);
          }}
          onOpenWith={(entry) => setOpenWithEntry(entry)}
        />
      )}

      {/* Compress to Desired Size Modal */}
      {compressToSizeEntry && (
        <CompressToSizeDialog
          entry={compressToSizeEntry}
          onClose={() => setCompressToSizeEntry(null)}
          onSuccess={() => {
            loadEntries();
          }}
        />
      )}

      {/* Open With Modal */}
      {openWithEntry && (
        <OpenWithModal
          entry={openWithEntry}
          onClose={() => setOpenWithEntry(null)}
        />
      )}

      {/* Properties Modal */}
      {propertiesEntry && (
        <PropertiesDialog
          entry={propertiesEntry}
          onClose={() => setPropertiesEntry(null)}
        />
      )}

      {/* Single Item Rename Modal */}
      {renamingEntry && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <form
            onSubmit={handleRenameSubmit}
            style={{
              background: "var(--popover-bg)",
              padding: 24,
              borderRadius: "var(--adw-radius-l)",
              boxShadow: "var(--popover-shadow)",
              width: 340,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Rename Item</h3>
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{
                height: 36,
                padding: "0 10px",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--adw-radius-s)",
                background: "var(--view-bg)",
                color: "var(--window-fg)",
                outline: "none",
              }}
            />
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <button
                type="button"
                className="adw-btn"
                onClick={() => setRenamingEntry(null)}
              >
                Cancel
              </button>
              <button type="submit" className="adw-btn adw-btn-accent">
                Rename
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Batch Rename Dialog */}
      {isBatchRenameOpen && (
        <BatchRenameDialog
          entries={selectedEntries.length > 0 ? selectedEntries : entries}
          onApply={handleBatchRenameApply}
          onClose={() => setIsBatchRenameOpen(false)}
        />
      )}

      {/* Conflict Dialog */}
      {conflictData && (
        <ConflictDialog
          sourceEntry={conflictData.source}
          existingEntry={conflictData.existing}
          onResolve={handleConflictResolve}
          onCancel={() => setConflictData(null)}
        />
      )}

      {/* Quick Preview Spacebar Overlay */}
      <QuickPreviewModal />

      {/* Preferences Dialog */}
      <PreferencesDialog />

      {/* Diagnostics Dialog */}
      <DiagnosticsDialog />

      {/* Version History Dialog */}
      <VersionHistoryDialog />

      {/* Add Cloud Storage Dialog */}
      <AddCloudDialog />

      {/* Re-authenticate / Update Credentials Dialog */}
      <ReauthDialog />

      {/* Smart Folder Intelligence & Cleanup Dialog */}
      <SmartCleanupDialog />
    </div>
  );
};

export default App;
