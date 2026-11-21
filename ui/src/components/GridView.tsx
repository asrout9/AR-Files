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
    navigateTo,
    currentAccountId,
    hydrateItem,
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

  return (
    <div className="adw-grid-container">
      {entries.map((entry) => {
        const isSelected = selectedIds.has(entry.id);

        return (
          <div
            key={entry.id}
            className={`adw-grid-item ${isSelected ? "selected" : ""}`}
            onClick={(e) => toggleSelect(entry.id, e.ctrlKey || e.metaKey)}
            onDoubleClick={() => handleDoubleClick(entry)}
            onContextMenu={(e) => {
              e.preventDefault();
              onContextMenu(e, entry);
            }}
          >
            <div style={{ position: "relative", display: "inline-flex" }}>
              {getLargeFileIcon(entry)}
              <StateIcon state={entry.state} size={15} />
            </div>
            <span className="adw-grid-label" title={entry.name}>
              {entry.name}
            </span>
          </div>
        );
      })}
    </div>
  );
};
