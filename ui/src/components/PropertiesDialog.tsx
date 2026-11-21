import React from "react";
import { X, FileText, Folder } from "lucide-react";
import { EntryRecord } from "../types";

interface PropertiesDialogProps {
  entry: EntryRecord | null;
  onClose: () => void;
}

export const PropertiesDialog: React.FC<PropertiesDialogProps> = ({ entry, onClose }) => {
  if (!entry) return null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB (${bytes.toLocaleString()} bytes)`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB (${bytes.toLocaleString()} bytes)`;
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleString();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--popover-bg)",
          borderRadius: "var(--adw-radius-l)",
          boxShadow: "var(--popover-shadow)",
          width: 440,
          border: "1px solid var(--border-color)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {entry.is_directory ? (
              <Folder size={24} color="#3584e4" />
            ) : (
              <FileText size={24} color="var(--dim-fg)" />
            )}
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>{entry.name}</h3>
          </div>
          <button className="adw-btn adw-btn-icon" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--dim-fg)" }}>Type:</span>
            <span style={{ fontWeight: 500 }}>{entry.mime_type}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--dim-fg)" }}>Size:</span>
            <span className="tabular-nums" style={{ fontWeight: 500 }}>
              {formatSize(entry.size)}
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--dim-fg)" }}>Location:</span>
            <span style={{ wordBreak: "break-all", textAlign: "right", maxWidth: 260 }}>
              {entry.path}
            </span>
          </div>

          <div style={{ height: 1, backgroundColor: "var(--border-color)" }} />

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--dim-fg)" }}>Cloud State:</span>
            <span style={{ textTransform: "uppercase", fontWeight: 600, color: "var(--adw-accent-blue)" }}>
              {entry.state.replace("_", " ")}
            </span>
          </div>

          {entry.local_path && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--dim-fg)" }}>Local Cache:</span>
              <span style={{ fontSize: 11, wordBreak: "break-all", maxWidth: 260 }}>
                {entry.local_path}
              </span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--dim-fg)" }}>Modified:</span>
            <span className="tabular-nums">{formatDate(entry.mtime)}</span>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button className="adw-btn adw-btn-accent" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
