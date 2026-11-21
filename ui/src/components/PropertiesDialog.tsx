import React, { useState } from "react";
import { X, FileText, Folder, ShieldCheck } from "lucide-react";
import { EntryRecord } from "../types";

interface PropertiesDialogProps {
  entry: EntryRecord | null;
  onClose: () => void;
}

export const PropertiesDialog: React.FC<PropertiesDialogProps> = ({
  entry,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"general" | "permissions">(
    "general"
  );

  if (!entry) return null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024)
      return `${(bytes / 1024).toFixed(2)} KB (${bytes.toLocaleString()} bytes)`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB (${bytes.toLocaleString()} bytes)`;
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleString();

  // Permissions and disk block simulation
  const isSparse = entry.state === "cloud_only";
  const diskBlocks = isSparse ? 0 : Math.ceil(entry.size / 4096) * 8;
  const diskUsage = diskBlocks * 512;
  const octalPerms = entry.is_directory ? "0755" : "0644";

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
          width: 460,
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

        {/* Tab Switcher */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border-color)",
            padding: "0 16px",
            background: "var(--card-bg)",
            gap: 8,
          }}
        >
          <button
            className={`adw-btn ${activeTab === "general" ? "adw-btn-accent" : ""}`}
            style={{
              borderRadius: "4px 4px 0 0",
              border: "none",
              fontSize: 13,
            }}
            onClick={() => setActiveTab("general")}
          >
            General
          </button>
          <button
            className={`adw-btn ${activeTab === "permissions" ? "adw-btn-accent" : ""}`}
            style={{
              borderRadius: "4px 4px 0 0",
              border: "none",
              fontSize: 13,
            }}
            onClick={() => setActiveTab("permissions")}
          >
            Permissions
          </button>
        </div>

        {/* Body */}
        {activeTab === "general" ? (
          <div
            style={{
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--dim-fg)" }}>Type:</span>
              <span style={{ fontWeight: 500 }}>{entry.mime_type}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--dim-fg)" }}>Reported Size:</span>
              <span className="tabular-nums" style={{ fontWeight: 500 }}>
                {formatSize(entry.size)}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--dim-fg)" }}>Disk Usage:</span>
              <span
                className="tabular-nums"
                style={{
                  fontWeight: 500,
                  color: isSparse ? "var(--dim-fg)" : "inherit",
                }}
              >
                {isSparse
                  ? "0 bytes (Sparse placeholder)"
                  : `${formatSize(diskUsage)} (${diskBlocks} blocks)`}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--dim-fg)" }}>Location:</span>
              <span
                style={{
                  wordBreak: "break-all",
                  textAlign: "right",
                  maxWidth: 270,
                }}
              >
                {entry.path}
              </span>
            </div>

            <div
              style={{ height: 1, backgroundColor: "var(--border-color)" }}
            />

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--dim-fg)" }}>File State:</span>
              <span
                style={{
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "var(--adw-accent-blue)",
                }}
              >
                {entry.state.replace("_", " ")}
              </span>
            </div>

            {entry.local_path && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--dim-fg)" }}>Local Path:</span>
                <span
                  style={{
                    fontSize: 11,
                    wordBreak: "break-all",
                    maxWidth: 270,
                  }}
                >
                  {entry.local_path}
                </span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--dim-fg)" }}>Modified:</span>
              <span className="tabular-nums">{formatDate(entry.mtime)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--dim-fg)" }}>Created:</span>
              <span className="tabular-nums">
                {formatDate(entry.created_at)}
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              fontSize: 13,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--dim-fg)",
              }}
            >
              <ShieldCheck size={18} color="var(--adw-accent-blue)" />
              <span style={{ fontWeight: 600, color: "var(--window-fg)" }}>
                POSIX Access Control
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                background: "var(--card-bg)",
                padding: 12,
                borderRadius: "var(--adw-radius-m)",
              }}
            >
              <div>
                <span style={{ color: "var(--dim-fg)", fontSize: 11 }}>
                  OCTAL MODE
                </span>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  {octalPerms}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--dim-fg)", fontSize: 11 }}>
                  ACCESS LEVEL
                </span>
                <div style={{ fontWeight: 500 }}>
                  {entry.is_directory ? "rwxr-xr-x" : "rw-r--r--"}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "0 4px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Owner (User):</span>
                <span style={{ fontWeight: 500 }}>Read and Write</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Group:</span>
                <span style={{ fontWeight: 500 }}>Read-only</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Others:</span>
                <span style={{ fontWeight: 500 }}>Read-only</span>
              </div>
              {entry.is_directory && (
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span>Execute / Search:</span>
                  <span
                    style={{ fontWeight: 500, color: "var(--adw-accent-blue)" }}
                  >
                    Enabled
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

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
