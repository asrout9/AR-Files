import React from "react";
import {
  Pin,
  Cloud,
  Download,
  Trash2,
  Edit2,
  Info,
  Archive,
  FileArchive,
  Trash,
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
  onBatchRename?: () => void;
  onCompress?: () => void;
  onExtract?: () => void;
  onDeletePermanently?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  entry,
  x,
  y,
  onClose,
  onOpenProperties,
  onStartRename,
  onBatchRename,
  onCompress,
  onExtract,
  onDeletePermanently,
}) => {
  const { hydrateItem, freeUpSpaceItem, trashSelected, selectedIds } =
    useExplorerStore();

  if (!entry) return null;

  const isMultiSelected = selectedIds.size > 1;
  const isArchive =
    entry.name.endsWith(".zip") ||
    entry.name.endsWith(".tar.gz") ||
    entry.mime_type.includes("zip") ||
    entry.mime_type.includes("tar");

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
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 900,
        }}
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
          minWidth: 210,
          border: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Cloud Hydration / Pin / Evict Actions */}
        {entry.state === "cloud_only" && (
          <button
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={handleAlwaysKeep}
          >
            <Download size={15} />
            <span>Download now</span>
          </button>
        )}

        <button
          className="adw-sidebar-item"
          style={{
            borderRadius: 0,
            border: "none",
            background: "none",
            width: "100%",
          }}
          onClick={handleAlwaysKeep}
        >
          <Pin size={15} />
          <span>Always keep on this device</span>
        </button>

        {entry.state === "available" && (
          <button
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={handleFreeUpSpace}
          >
            <Cloud size={15} />
            <span>Free up space</span>
          </button>
        )}

        <div
          style={{
            height: 1,
            backgroundColor: "var(--border-color)",
            margin: "4px 0",
          }}
        />

        {/* Compression & Extraction */}
        {isArchive && onExtract && (
          <button
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              onExtract();
              onClose();
            }}
          >
            <FileArchive size={15} color="var(--adw-accent-blue)" />
            <span>Extract Archive...</span>
          </button>
        )}

        {onCompress && (
          <button
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              onCompress();
              onClose();
            }}
          >
            <Archive size={15} />
            <span>Compress to ZIP...</span>
          </button>
        )}

        <div
          style={{
            height: 1,
            backgroundColor: "var(--border-color)",
            margin: "4px 0",
          }}
        />

        {/* Rename & Batch Rename */}
        {isMultiSelected && onBatchRename ? (
          <button
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              onBatchRename();
              onClose();
            }}
          >
            <Edit2 size={15} />
            <span>Batch Rename ({selectedIds.size} items)...</span>
          </button>
        ) : (
          <button
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              onStartRename(entry);
              onClose();
            }}
          >
            <Edit2 size={15} />
            <span>Rename...</span>
          </button>
        )}

        {/* Delete & Permanent Delete */}
        <button
          className="adw-sidebar-item"
          style={{
            borderRadius: 0,
            border: "none",
            background: "none",
            width: "100%",
          }}
          onClick={handleTrash}
        >
          <Trash2 size={15} color="var(--state-error)" />
          <span style={{ color: "var(--state-error)" }}>Move to Trash</span>
        </button>

        {onDeletePermanently && (
          <button
            className="adw-sidebar-item"
            style={{
              borderRadius: 0,
              border: "none",
              background: "none",
              width: "100%",
            }}
            onClick={() => {
              onDeletePermanently();
              onClose();
            }}
          >
            <Trash size={15} color="var(--state-error)" />
            <span style={{ color: "var(--state-error)" }}>
              Delete Permanently (Shift+Del)
            </span>
          </button>
        )}

        <div
          style={{
            height: 1,
            backgroundColor: "var(--border-color)",
            margin: "4px 0",
          }}
        />

        <button
          className="adw-sidebar-item"
          style={{
            borderRadius: 0,
            border: "none",
            background: "none",
            width: "100%",
          }}
          onClick={() => {
            onOpenProperties(entry);
            onClose();
          }}
        >
          <Info size={15} />
          <span>Properties (Alt+Enter)</span>
        </button>
      </div>
    </>
  );
};
