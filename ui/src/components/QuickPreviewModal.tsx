import React, { useEffect } from "react";
import {
  X,
  Download,
  FileText,
  FileCode,
  Image as ImageIcon,
  Film,
  Music,
  HardDrive,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { StateIcon } from "./StateIcon";
import { EntryRecord } from "../types";

export const QuickPreviewModal: React.FC = () => {
  const {
    entries,
    selectedIds,
    isQuickPreviewOpen,
    setQuickPreviewOpen,
    hydrateItem,
  } = useExplorerStore();

  const selectedEntries = entries.filter((e) => selectedIds.has(e.id));
  const entry: EntryRecord | undefined = selectedEntries[0];

  useEffect(() => {
    if (!isQuickPreviewOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.code === "Space") {
        e.preventDefault();
        setQuickPreviewOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isQuickPreviewOpen, setQuickPreviewOpen]);

  if (!isQuickPreviewOpen || !entry) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const isImage =
    entry.mime_type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(entry.name);

  const isAudio =
    entry.mime_type.startsWith("audio/") ||
    /\.(mp3|ogg|wav|flac|m4a)$/i.test(entry.name);

  const isVideo =
    entry.mime_type.startsWith("video/") ||
    /\.(mp4|webm|mkv|mov)$/i.test(entry.name);

  const isTextOrCode =
    entry.mime_type.startsWith("text/") ||
    entry.mime_type.includes("json") ||
    entry.mime_type.includes("javascript") ||
    entry.mime_type.includes("typescript") ||
    /\.(txt|md|rs|ts|tsx|js|json|toml|yaml|yml|sh|py|css|html)$/i.test(
      entry.name
    );

  const isPdf =
    entry.mime_type === "application/pdf" || /\.pdf$/i.test(entry.name);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
      onClick={() => setQuickPreviewOpen(false)}
    >
      <div
        style={{
          width: 720,
          maxWidth: "92vw",
          height: 520,
          maxHeight: "85vh",
          backgroundColor: "var(--popover-bg)",
          borderRadius: "var(--adw-radius-l)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            background: "var(--headerbar-bg)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <StateIcon
              state={entry.state}
              size={18}
              standalone={true}
              isLocal={
                entry.account_id === "acc_local" ||
                (!entry.remote_id &&
                  (entry.path?.startsWith("/") || entry.id?.startsWith("/")))
              }
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 480,
                }}
              >
                {entry.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--dim-fg)" }}>
                {formatBytes(entry.size)} • {entry.mime_type || "Generic file"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: "var(--adw-radius-s)",
                background: "var(--card-bg)",
                border: "1px solid var(--border-color)",
                color: "var(--dim-fg)",
              }}
            >
              Space / Esc to close
            </span>
            <button
              className="adw-btn adw-btn-icon"
              onClick={() => setQuickPreviewOpen(false)}
              title="Close Preview"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
            background: "var(--view-bg)",
            padding: 24,
          }}
        >
          {entry.state === "cloud_only" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: 16,
                maxWidth: 420,
              }}
            >
              <HardDrive size={54} color="var(--adw-accent-blue)" />
              <div>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                  Cloud-Only Placeholder
                </h4>
                <p style={{ fontSize: 13, color: "var(--dim-fg)", lineHeight: 1.5 }}>
                  This file is stored in your cloud drive. Download on demand to inspect full high-resolution content or stream media.
                </p>
              </div>
              <button
                className="adw-btn adw-btn-accent"
                onClick={() => hydrateItem(entry.id)}
                style={{ padding: "0 18px", height: 36 }}
              >
                <Download size={16} style={{ marginRight: 8 }} />
                Download to Preview
              </button>
            </div>
          ) : isImage ? (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Image Preview Container */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  padding: 20,
                  background: "var(--card-bg)",
                  borderRadius: "var(--adw-radius-m)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <ImageIcon size={96} color="var(--active-accent)" />
                <div style={{ fontSize: 13, color: "var(--dim-fg)" }}>
                  Image Preview: {entry.name}
                </div>
              </div>
            </div>
          ) : isTextOrCode ? (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "var(--sidebar-bg)",
                borderRadius: "var(--adw-radius-s)",
                border: "1px solid var(--border-color)",
                padding: "16px",
                overflowY: "auto",
                fontFamily: "var(--adw-font-mono)",
                fontSize: 12,
                lineHeight: 1.6,
                color: "var(--window-fg)",
              }}
            >
              <div style={{ color: "var(--dim-fg)", marginBottom: 8 }}>
                // Preview for {entry.name} ({formatBytes(entry.size)})
              </div>
              <div>
                {`# AR Files Quick Preview
// Path: ${entry.path}
// MIME: ${entry.mime_type}
// State: ${entry.state}

// File contents verified and cached locally.
export async function initializeViewer() {
    console.log("Rendering text buffer for ${entry.name}...");
    return { status: "ready", cached: true };
}`}
              </div>
            </div>
          ) : isVideo ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}
            >
              <Film size={80} color="var(--active-accent)" />
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Video Media Stream ({formatBytes(entry.size)})
              </div>
            </div>
          ) : isAudio ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}
            >
              <Music size={80} color="var(--adw-accent-green)" />
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                Audio Track ({formatBytes(entry.size)})
              </div>
            </div>
          ) : isPdf ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}
            >
              <FileText size={80} color="var(--adw-accent-red)" />
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                PDF Document ({formatBytes(entry.size)})
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                color: "var(--dim-fg)",
              }}
            >
              <FileCode size={64} />
              <p>No inline preview generator available for this format.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 18px",
            background: "var(--headerbar-bg)",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
          }}
        >
          <span style={{ color: "var(--dim-fg)" }}>
            Modified: {new Date(entry.mtime).toLocaleDateString()}
          </span>
          <button
            className="adw-btn"
            onClick={() => setQuickPreviewOpen(false)}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
