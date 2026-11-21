import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Folder,
  FileText,
  FileCode,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  ArrowUpDown,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { EntryRecord } from "../types";
import { StateIcon } from "./StateIcon";
import { formatLocalizedDate, formatLocalizedFileSize } from "../i18n";

interface ListViewProps {
  onContextMenu: (e: React.MouseEvent, entry: EntryRecord) => void;
}

export const ListView: React.FC<ListViewProps> = ({ onContextMenu }) => {
  const {
    entries,
    selectedIds,
    toggleSelect,
    clearSelection,
    navigateTo,
    currentAccountId,
    hydrateItem,
    sortBy,
    setSort,
    language,
    trashSelected,
  } = useExplorerStore();

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
      handleDoubleClick(entry);
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

  const getFileIcon = (entry: EntryRecord) => {
    if (entry.is_directory) {
      return <Folder size={18} color="#3584e4" fill="#3584e4" fillOpacity={0.2} />;
    }
    const mime = entry.mime_type;
    if (mime.startsWith("image/")) return <ImageIcon size={18} color="#e5a50a" />;
    if (mime.startsWith("video/")) return <Film size={18} color="#9141ac" />;
    if (mime.startsWith("audio/")) return <Music size={18} color="#3a944a" />;
    if (mime.includes("tar") || mime.includes("zip") || mime.includes("gzip")) {
      return <Archive size={18} color="#e66100" />;
    }
    if (mime.includes("javascript") || mime.includes("rust") || mime.includes("python")) {
      return <FileCode size={18} color="#2190a4" />;
    }
    return <FileText size={18} color="var(--dim-fg)" />;
  };

  const handleDoubleClick = (entry: EntryRecord) => {
    if (entry.is_directory) {
      navigateTo(currentAccountId, entry.id, entry.name);
    } else {
      // If cloud_only, trigger background hydration
      if (entry.state === "cloud_only") {
        hydrateItem(entry.id);
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
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

            return (
              <div
                key={entry.id}
                role="row"
                tabIndex={0}
                aria-selected={isSelected}
                aria-label={`${entry.name}, ${entry.is_directory ? "directory" : formatSize(entry.size, false)}`}
                className={`adw-table-row ${isSelected ? "selected" : ""}`}
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
                    {getFileIcon(entry)}
                    <StateIcon state={entry.state} size={11} />
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
                  <StateIcon state={entry.state} size={15} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
