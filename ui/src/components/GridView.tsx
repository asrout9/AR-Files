import React, { useMemo } from "react";
import { FolderOpen, Search, Copy } from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { EntryRecord } from "../types";
import { StateIcon } from "./StateIcon";
import { FileIcon } from "./FileIcon";

interface GridViewProps {
  onContextMenu: (e: React.MouseEvent, entry: EntryRecord | null) => void;
}

export const GridView: React.FC<GridViewProps> = ({ onContextMenu }) => {
  const {
    entries,
    selectedIds,
    toggleSelect,
    clearSelection,
    openItem,
    trashSelected,
    searchQuery,
    isLoading,
    folderIntelligence,
  } = useExplorerStore();

  const emptyFolderSet = useMemo(() => {
    const s = new Set<string>();
    if (!folderIntelligence?.empty_folders) return s;
    for (const f of folderIntelligence.empty_folders) {
      if (f.id) s.add(f.id);
      if (f.path) s.add(f.path);
    }
    return s;
  }, [folderIntelligence]);

  const duplicateFileSet = useMemo(() => {
    const s = new Set<string>();
    if (!folderIntelligence?.duplicate_files) return s;
    for (const g of folderIntelligence.duplicate_files) {
      for (const item of g.items) {
        if (item.id) s.add(item.id);
        if (item.path) s.add(item.path);
      }
    }
    return s;
  }, [folderIntelligence]);

  const duplicateFolderSet = useMemo(() => {
    const s = new Set<string>();
    if (!folderIntelligence?.duplicate_folders) return s;
    for (const g of folderIntelligence.duplicate_folders) {
      for (const item of g.items) {
        if (item.id) s.add(item.id);
        if (item.path) s.add(item.path);
      }
    }
    return s;
  }, [folderIntelligence]);

  const handleDoubleClick = (entry: EntryRecord) => {
    openItem(entry);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number, entry: EntryRecord) => {
    if (e.key === "Enter") {
      openItem(entry);
    } else if (e.key === " ") {
      e.preventDefault();
      toggleSelect(entry.id, true);
    } else if (e.key === "ArrowRight" && index < entries.length - 1) {
      e.preventDefault();
      toggleSelect(entries[index + 1].id, false);
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      toggleSelect(entries[index - 1].id, false);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedIds.size > 0) {
        trashSelected();
      }
    }
  };

  if (entries.length === 0 && !isLoading) {
    return (
      <div
        className="adw-empty-state"
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, null);
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          width: "100%",
          gap: 12,
          padding: 32,
          userSelect: "none",
        }}
      >
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: "50%",
            background: "var(--hover-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--dim-fg)",
            marginBottom: 4,
          }}
        >
          {searchQuery.trim() ? (
            <Search size={38} strokeWidth={1.5} />
          ) : (
            <FolderOpen size={38} strokeWidth={1.5} color="var(--active-accent)" />
          )}
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--window-fg)" }}>
          {searchQuery.trim() ? "No Results Found" : "Folder is Empty"}
        </div>
        <div style={{ fontSize: 13, color: "var(--dim-fg)", textAlign: "center", maxWidth: 320 }}>
          {searchQuery.trim()
            ? `No files matching "${searchQuery}" in this location.`
            : "Drop files here or click New Folder to add files."}
        </div>
      </div>
    );
  }

  return (
    <div
      role="grid"
      aria-label="Files and folders grid"
      className="adw-grid-container"
      onClick={(e) => {
        if (e.target === e.currentTarget) clearSelection();
      }}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest(".adw-grid-item")) return;
        e.preventDefault();
        onContextMenu(e, null);
      }}
    >
      {entries.map((entry, index) => {
        const isSelected = selectedIds.has(entry.id);
        const isLocal =
          entry.account_id === "acc_local" ||
          (!entry.remote_id &&
            (entry.path?.startsWith("/") || entry.id?.startsWith("/")));

        const isEmpty = entry.is_directory && (emptyFolderSet.has(entry.id) || (entry.path ? emptyFolderSet.has(entry.path) : false));
        const isDup = !entry.is_directory && (duplicateFileSet.has(entry.id) || (entry.path ? duplicateFileSet.has(entry.path) : false));
        const isDupFolder = entry.is_directory && (duplicateFolderSet.has(entry.id) || (entry.path ? duplicateFolderSet.has(entry.path) : false));

        return (
          <div
            key={entry.id}
            role="row"
            tabIndex={0}
            aria-selected={isSelected}
            aria-label={entry.name}
            className={`adw-grid-item ${isSelected ? "selected" : ""}`}
            draggable={entry.is_directory}
            onDragStart={(e) => {
              if (!entry.is_directory) return;
              const data = {
                type: "ar-folder-place",
                path: entry.path || entry.id,
                name: entry.name,
              };
              e.dataTransfer.setData("application/json", JSON.stringify(data));
              e.dataTransfer.setData("text/plain", entry.path || entry.id);
              e.dataTransfer.effectAllowed = "copyMove";
            }}
            onClick={(e) =>
              toggleSelect(entry.id, e.ctrlKey || e.metaKey, e.shiftKey)
            }
            onDoubleClick={() => handleDoubleClick(entry)}
            onKeyDown={(e) => handleKeyDown(e, index, entry)}
            onContextMenu={(e) => {
              e.preventDefault();
              onContextMenu(e, entry);
            }}
          >
            <div role="gridcell" style={{ position: "relative", display: "inline-flex" }}>
              <FileIcon entry={entry} size={54} />
              <StateIcon state={entry.state} size={15} isLocal={isLocal} />
            </div>
            <span role="gridcell" className="adw-grid-label" title={entry.name}>
              {entry.name}
            </span>
            {isEmpty && (
              <span
                className="adw-intelligence-tag adw-tag-empty"
                style={{ fontSize: 9, padding: "0 5px", marginTop: 2 }}
                title="Empty folder"
              >
                Empty
              </span>
            )}
            {isDup && (
              <span
                className="adw-intelligence-tag adw-tag-duplicate"
                style={{ fontSize: 9, padding: "0 5px", marginTop: 2 }}
                title="Duplicate file"
              >
                <Copy size={8} /> Duplicate
              </span>
            )}
            {isDupFolder && (
              <span
                className="adw-intelligence-tag adw-tag-duplicate"
                style={{ fontSize: 9, padding: "0 5px", marginTop: 2 }}
                title="Duplicate folder"
              >
                <Copy size={8} /> Duplicate
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
