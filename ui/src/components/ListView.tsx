import React, { useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, FolderOpen, Search, Copy } from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { EntryRecord } from "../types";
import { StateIcon } from "./StateIcon";
import { FileIcon } from "./FileIcon";
import { formatLocalizedDate, formatLocalizedFileSize } from "../i18n";

interface ListViewProps {
  onContextMenu: (e: React.MouseEvent, entry: EntryRecord | null) => void;
}

export const ListView: React.FC<ListViewProps> = ({ onContextMenu }) => {
  const {
    entries,
    selectedIds,
    toggleSelect,
    clearSelection,
    openItem,
    sortBy,
    setSort,
    language,
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

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 15,
    initialRect: { width: 1000, height: 800 },
  });

  const formatSize = (bytes: number, isDir: boolean) => {
    if (isDir) return "--";
    return formatLocalizedFileSize(bytes, language);
  };

  const formatDate = (mtime: number) => {
    return formatLocalizedDate(mtime, language);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number, entry: EntryRecord) => {
    if (e.key === "Enter") {
      openItem(entry);
    } else if (e.key === " ") {
      e.preventDefault();
      toggleSelect(entry.id, true);
    } else if (e.key === "ArrowDown" && index < entries.length - 1) {
      e.preventDefault();
      const next = entries[index + 1];
      toggleSelect(next.id, false);
    } else if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      const prev = entries[index - 1];
      toggleSelect(prev.id, false);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedIds.size > 0) {
        trashSelected();
      }
    }
  };

  const handleDoubleClick = (entry: EntryRecord) => {
    openItem(entry);
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
      style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest(".adw-table-row")) return;
        e.preventDefault();
        onContextMenu(e, null);
      }}
    >
      {/* Table Header with Sorting */}
      <div className="adw-table-header" role="row">
        <div
          role="columnheader"
          aria-sort={sortBy === "name" ? "ascending" : "none"}
          style={{ flex: 4, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
          onClick={() => setSort("name")}
        >
          <span>Name</span>
          {sortBy === "name" && <ArrowUpDown size={12} />}
        </div>
        <div
          role="columnheader"
          aria-sort={sortBy === "size" ? "ascending" : "none"}
          style={{ flex: 1.5, textAlign: "right", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, cursor: "pointer" }}
          onClick={() => setSort("size")}
        >
          <span>Size</span>
          {sortBy === "size" && <ArrowUpDown size={12} />}
        </div>
        <div
          role="columnheader"
          aria-sort={sortBy === "modified" ? "ascending" : "none"}
          style={{ flex: 2, textAlign: "right", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, cursor: "pointer" }}
          onClick={() => setSort("modified")}
        >
          <span>Modified</span>
          {sortBy === "modified" && <ArrowUpDown size={12} />}
        </div>
        <div role="columnheader" style={{ width: 60, textAlign: "center" }}>Status</div>
      </div>

      {/* Virtualized Rows Container */}
      <div
        ref={parentRef}
        role="grid"
        aria-label="Files and folders list"
        onClick={(e) => {
          if (e.target === e.currentTarget) clearSelection();
        }}
        style={{
          flex: 1,
          overflowY: "auto",
          width: "100%",
          position: "relative",
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index];
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
                aria-label={`${entry.name}, ${entry.is_directory ? "directory" : formatSize(entry.size, false)}`}
                className={`adw-table-row ${isSelected ? "selected" : ""}`}
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
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "calc(100% - 12px)",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={(e) =>
                  toggleSelect(entry.id, e.ctrlKey || e.metaKey, e.shiftKey)
                }
                onDoubleClick={() => handleDoubleClick(entry)}
                onKeyDown={(e) => handleKeyDown(e, virtualRow.index, entry)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContextMenu(e, entry);
                }}
              >
                {/* Name & Icon Column */}
                <div role="gridcell" style={{ flex: 4, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{ position: "relative", display: "inline-flex" }}>
                    <FileIcon entry={entry} size={20} />
                    <StateIcon state={entry.state} size={11} isLocal={isLocal} />
                  </div>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontWeight: entry.is_directory ? 600 : 400,
                    }}
                  >
                    {entry.name}
                  </span>
                  {isEmpty && (
                    <span className="adw-intelligence-tag adw-tag-empty" title="Empty folder">
                      Empty
                    </span>
                  )}
                  {isDup && (
                    <span className="adw-intelligence-tag adw-tag-duplicate" title="Duplicate file">
                      <Copy size={9} /> Duplicate
                    </span>
                  )}
                  {isDupFolder && (
                    <span className="adw-intelligence-tag adw-tag-duplicate" title="Duplicate folder (identical contents)">
                      <Copy size={9} /> Duplicate
                    </span>
                  )}
                </div>

                {/* Size Column */}
                <div
                  role="gridcell"
                  className="tabular-nums"
                  style={{ flex: 1.5, textAlign: "right", color: "var(--dim-fg)" }}
                >
                  {formatSize(entry.size, entry.is_directory)}
                </div>

                {/* Modified Column */}
                <div
                  role="gridcell"
                  className="tabular-nums"
                  style={{ flex: 2, textAlign: "right", color: "var(--dim-fg)", fontSize: 13 }}
                >
                  {formatDate(entry.mtime)}
                </div>

                {/* Status Column */}
                <div role="gridcell" style={{ width: 60, display: "flex", justifyContent: "center" }}>
                  <StateIcon state={entry.state} size={15} standalone={true} isLocal={isLocal} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
