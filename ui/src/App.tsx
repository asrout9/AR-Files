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
import { ProgressPopover, ActiveJob } from "./components/ProgressPopover";
import { DetailsPane } from "./components/DetailsPane";
import { QuickPreviewModal } from "./components/QuickPreviewModal";
import { PreferencesDialog } from "./components/PreferencesDialog";
import { DiagnosticsDialog } from "./components/DiagnosticsDialog";
import { VersionHistoryDialog } from "./components/VersionHistoryDialog";
import { useExplorerStore } from "./store/useExplorerStore";
import { EntryRecord } from "./types";

export const App: React.FC = () => {
  const {
    viewMode,
    entries,
    selectedIds,
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
  } = useExplorerStore();

  const [contextMenuTarget, setContextMenuTarget] = useState<{
    entry: EntryRecord;
    x: number;
    y: number;
  } | null>(null);

  const [propertiesEntry, setPropertiesEntry] = useState<EntryRecord | null>(null);
  const [renamingEntry, setRenamingEntry] = useState<EntryRecord | null>(null);
  const [newName, setNewName] = useState("");
  const [isBatchRenameOpen, setIsBatchRenameOpen] = useState(false);
  const [conflictData, setConflictData] = useState<{
    source: EntryRecord;
    existing: EntryRecord;
    pendingAction: () => void;
  } | null>(null);

  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
  ]);

  const showToast = (message: string, withUndo = false) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((cur) => (cur === message ? null : cur));
    }, withUndo ? 6000 : 3500);
  };

  const handleContextMenu = (e: React.MouseEvent, entry: EntryRecord) => {
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
    const paths = selectedList
      .map((e) => e.local_path || e.path)
      .filter(Boolean);
    if (paths.length === 0) return;

    const outName = `${selectedList[0].name.replace(/\.[^/.]+$/, "")}_archive.zip`;
    const outPath = `/tmp/${outName}`;

    const jobId = `job_${Date.now()}`;
    setActiveJobs((prev) => [
      ...prev,
      {
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
      },
    ]);

    await compressItems(paths, outPath);

    setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));
    showToast(`Created archive "${outName}"`);
  };

  const handleExtract = async (archiveEntry: EntryRecord) => {
    const p = archiveEntry.local_path || archiveEntry.path;
    const dest = `/tmp/extracted_${Date.now()}`;

    const jobId = `job_extract_${Date.now()}`;
    setActiveJobs((prev) => [
      ...prev,
      {
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
      },
    ]);

    await extractArchive(p, dest);
    setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));
    showToast(`Extracted ${archiveEntry.name} into ${dest}`);
  };

  const selectedEntries = entries.filter((e) => selectedIds.has(e.id));

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
          <main className="adw-viewport" style={{ flex: 1 }}>
            {viewMode === "list" ? (
              <ListView onContextMenu={handleContextMenu} />
            ) : (
              <GridView onContextMenu={handleContextMenu} />
            )}
          </main>
        </div>

        {/* Collapsible Details & Properties Right Pane */}
        <DetailsPane />
      </div>

      {/* Floating Operations Progress Popover */}
      {activeJobs.length > 0 && (
        <ProgressPopover
          jobs={activeJobs}
          onCancelJob={(jobId) =>
            setActiveJobs((prev) => prev.filter((j) => j.id !== jobId))
          }
          onClose={() => setActiveJobs([])}
        />
      )}

      {/* Toast Notification Banner with Undo */}
      {toastMessage && (
        <div className="adw-toast-container">
          <div className="adw-toast">
            <span>{toastMessage}</span>
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
                setToastMessage(null);
                showToast("Action undone");
              }}
            >
              Undo
            </button>
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
          onExtract={() => handleExtract(contextMenuTarget.entry)}
          onDeletePermanently={async () => {
            await deletePermanently();
            showToast(`Permanently deleted ${selectedIds.size || 1} items`);
          }}
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
    </div>
  );
};

export default App;
