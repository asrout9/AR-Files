import React, { useEffect, useState } from "react";
import { HeaderBar } from "./components/HeaderBar";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { ListView } from "./components/ListView";
import { GridView } from "./components/GridView";
import { ContextMenu } from "./components/ContextMenu";
import { PropertiesDialog } from "./components/PropertiesDialog";
import { useExplorerStore } from "./store/useExplorerStore";
import { EntryRecord } from "./types";

export const App: React.FC = () => {
  const {
    viewMode,
    loadAccounts,
    loadEntries,
    renameItem,
  } = useExplorerStore();

  const [contextMenuTarget, setContextMenuTarget] = useState<{
    entry: EntryRecord;
    x: number;
    y: number;
  } | null>(null);

  const [propertiesEntry, setPropertiesEntry] = useState<EntryRecord | null>(null);
  const [renamingEntry, setRenamingEntry] = useState<EntryRecord | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    loadAccounts();
    loadEntries();
  }, [loadAccounts, loadEntries]);

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
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
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
      </div>

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
        />
      )}

      {/* Properties Modal */}
      {propertiesEntry && (
        <PropertiesDialog
          entry={propertiesEntry}
          onClose={() => setPropertiesEntry(null)}
        />
      )}

      {/* Rename Modal */}
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
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
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
    </div>
  );
};

export default App;
