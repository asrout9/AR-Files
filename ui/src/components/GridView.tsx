import React from "react";
import {
  Folder,
  FileText,
  FileCode,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { EntryRecord } from "../types";
import { StateIcon } from "./StateIcon";

interface GridViewProps {
  onContextMenu: (e: React.MouseEvent, entry: EntryRecord) => void;
}

export const GridView: React.FC<GridViewProps> = ({ onContextMenu }) => {
  const {
    entries,
    selectedIds,
    toggleSelect,
    clearSelection,
    navigateTo,
    currentAccountId,
    hydrateItem,
    trashSelected,
  } = useExplorerStore();

  const getLargeFileIcon = (entry: EntryRecord) => {
    if (entry.is_directory) {
      return <Folder size={54} color="#3584e4" fill="#3584e4" fillOpacity={0.25} />;
    }
    const mime = entry.mime_type;
    if (mime.startsWith("image/")) return <ImageIcon size={54} color="#e5a50a" />;
    if (mime.startsWith("video/")) return <Film size={54} color="#9141ac" />;
    if (mime.startsWith("audio/")) return <Music size={54} color="#3a944a" />;
    if (mime.includes("tar") || mime.includes("zip") || mime.includes("gzip")) {
      return <Archive size={54} color="#e66100" />;
    }
    if (mime.includes("javascript") || mime.includes("rust") || mime.includes("python")) {
      return <FileCode size={54} color="#2190a4" />;
    }
    return <FileText size={54} color="var(--dim-fg)" />;
  };

  const handleDoubleClick = (entry: EntryRecord) => {
    if (entry.is_directory) {
      navigateTo(currentAccountId, entry.id, entry.name);
    } else {
      if (entry.state === "cloud_only") {
        hydrateItem(entry.id);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number, entry: EntryRecord) => {
    if (e.key === "Enter") {
      handleDoubleClick(entry);
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

  return (
    <div
      role="grid"
      aria-label="Files and folders grid"
      className="adw-grid-container"
      onClick={(e) => {
        if (e.target === e.currentTarget) clearSelection();
      }}
    >
      {entries.map((entry, index) => {
        const isSelected = selectedIds.has(entry.id);

        return (
          <div
            key={entry.id}
            role="row"
            tabIndex={0}
            aria-selected={isSelected}
            aria-label={entry.name}
            className={`adw-grid-item ${isSelected ? "selected" : ""}`}
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
              {getLargeFileIcon(entry)}
              <StateIcon state={entry.state} size={15} />
            </div>
            <span role="gridcell" className="adw-grid-label" title={entry.name}>
              {entry.name}
            </span>
          </div>
        );
      })}
    </div>
  );
};
