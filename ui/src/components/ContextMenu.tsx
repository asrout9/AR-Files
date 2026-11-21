import React from "react";
import {
  Pin,
  Cloud,
  Download,
  Trash2,
  Edit2,
  Info,
} from "lucide-react";
import { EntryRecord } from "../types";
import { useExplorerStore } from "../store/useExplorerStore";

interface ContextMenuProps {
  entry: EntryRecord | null;
  x: number;
  y: number;
  onClose: () => void;
  onOpenProperties: (entry: EntryRecord) => void;
  onStartRename: (entry: EntryRecord) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  entry,
  x,
  y,
  onClose,
  onOpenProperties,
  onStartRename,
}) => {
  const { hydrateItem, freeUpSpaceItem, trashSelected } = useExplorerStore();

  if (!entry) return null;

  const handleAlwaysKeep = () => {
    hydrateItem(entry.id);
    onClose();
  };

  const handleFreeUpSpace = () => {
    freeUpSpaceItem(entry.id);
    onClose();
  };

  const handleTrash = () => {
    trashSelected();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 900 }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Menu Card */}
      <div
        style={{
          position: "fixed",
          top: y,
          left: x,
          zIndex: 901,
          backgroundColor: "var(--popover-bg)",
          borderRadius: "var(--adw-radius-m)",
          boxShadow: "var(--popover-shadow)",
          padding: "6px 0",
          minWidth: 200,
          border: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Cloud Hydration / Pin / Evict Actions */}
        {entry.state === "cloud_only" && (
          <button
            className="adw-sidebar-item"
            style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
            onClick={handleAlwaysKeep}
          >
            <Download size={15} />
            <span>Download now</span>
          </button>
        )}

        <button
          className="adw-sidebar-item"
          style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
          onClick={handleAlwaysKeep}
        >
          <Pin size={15} />
          <span>Always keep on this device</span>
        </button>

        {entry.state === "available" && (
          <button
            className="adw-sidebar-item"
            style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
            onClick={handleFreeUpSpace}
          >
            <Cloud size={15} />
            <span>Free up space</span>
          </button>
        )}

        <div style={{ height: 1, backgroundColor: "var(--border-color)", margin: "4px 0" }} />

        {/* Standard File Manager Actions */}
        <button
          className="adw-sidebar-item"
          style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
          onClick={() => {
            onStartRename(entry);
            onClose();
          }}
        >
          <Edit2 size={15} />
          <span>Rename...</span>
        </button>

        <button
          className="adw-sidebar-item"
          style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
          onClick={handleTrash}
        >
          <Trash2 size={15} color="var(--state-error)" />
          <span style={{ color: "var(--state-error)" }}>Move to Trash</span>
        </button>

        <div style={{ height: 1, backgroundColor: "var(--border-color)", margin: "4px 0" }} />

        <button
          className="adw-sidebar-item"
          style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
          onClick={() => {
            onOpenProperties(entry);
            onClose();
          }}
        >
          <Info size={15} />
          <span>Properties</span>
        </button>
      </div>
    </>
  );
};
