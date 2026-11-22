import React, { useState, useEffect } from "react";
import {
  X,
  Eye,
  FileText,
  Music,
  Folder,
  Terminal,
  ExternalLink,
  AppWindow,
  Copy,
  Check,
  Download,
  Maximize2,
  HardDrive,
} from "lucide-react";
import { EntryRecord } from "../types";
import { useExplorerStore } from "../store/useExplorerStore";
import { invokeCommand } from "../services/ipc";
import { StateIcon } from "./StateIcon";
import { formatLocalizedDate, formatLocalizedFileSize } from "../i18n";

interface PreviewPaneProps {
  onOpenWith?: (entry: EntryRecord) => void;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({ onOpenWith }) => {
  const {
    entries,
    selectedIds,
    isPreviewPaneOpen,
    togglePreviewPane,
    language,
    openItem,
    hydrateItem,
    setQuickPreviewOpen,
    showToast,
  } = useExplorerStore();

  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [lineCount, setLineCount] = useState<number>(0);
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [imgDimensions, setImgDimensions] = useState<{ width: number; height: number } | null>(null);
  const [cloudThumbUrl, setCloudThumbUrl] = useState<string | null>(null);

  const selectedEntries = entries.filter((e) => selectedIds.has(e.id));
  const entry: EntryRecord | undefined = selectedEntries[0];

  const filePath = entry ? entry.local_path || entry.path || entry.id : "";
  const isLocal = entry ? entry.account_id === "acc_local" || (!entry.remote_id && (entry.path?.startsWith("/") || entry.id?.startsWith("/"))) : true;

  // Determine file categories
  const name = entry ? entry.name.toLowerCase() : "";
  const mime = entry ? (entry.mime_type || "").toLowerCase() : "";

  const isImage = !entry?.is_directory && (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|bmp|ico|avif)$/i.test(name));
  const isVideo = !entry?.is_directory && (mime.startsWith("video/") || /\.(mp4|webm|mkv|mov|avi|ogg)$/i.test(name));
  const isAudio = !entry?.is_directory && (mime.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(name));
  const isTextOrCode = !entry?.is_directory && (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("xml") ||
    /\.(txt|md|rs|ts|tsx|js|jsx|json|py|sh|css|html|log|toml|yaml|yml|c|cpp|h|csv|ini|conf)$/i.test(name)
  );
  const isPdf = !entry?.is_directory && (mime === "application/pdf" || /\.pdf$/i.test(name));

  // Load text preview when a text/code file is selected
  useEffect(() => {
    if (!entry || entry.is_directory || !isTextOrCode) {
      setTextPreview(null);
      setLineCount(0);
      return;
    }

    let isMounted = true;
    setIsTextLoading(true);

    const loadText = async () => {
      try {
        const res = await invokeCommand<{
          success: boolean;
          content: string;
          line_count: number;
        }>("read_text_preview", { path: filePath, max_bytes: 32768 });

        if (isMounted && res && res.content) {
          setTextPreview(res.content);
          setLineCount(res.line_count || res.content.split("\n").length);
        } else if (isMounted) {
          setTextPreview(null);
        }
      } catch {
        if (isMounted) setTextPreview(null);
      } finally {
        if (isMounted) setIsTextLoading(false);
      }
    };

    loadText();

    return () => {
      isMounted = false;
    };
  }, [entry?.id, filePath, isTextOrCode]);

  // Reset image dimensions when entry changes
  useEffect(() => {
    setImgDimensions(null);
  }, [entry?.id]);

  useEffect(() => {
    if (!entry || entry.is_directory) {
      setCloudThumbUrl(null);
      return;
    }
    let isMounted = true;
    const isCloud = Boolean(entry.account_id && entry.account_id !== "acc_local");
    if (entry.thumbnail_url || isCloud) {
      invokeCommand<any>("get_thumbnail", {
        path: entry.local_path || entry.path,
        account_id: entry.account_id,
        entry_id: entry.id,
        thumbnail_url: entry.thumbnail_url,
      })
        .then((res) => {
          const found: string | null = typeof res === "string" ? res : (res?.thumbnail || res?.data || null);
          if (isMounted && found) {
            setCloudThumbUrl(found);
          }
        })
        .catch(() => {});
    } else {
      setCloudThumbUrl(null);
    }
    return () => {
      isMounted = false;
    };
  }, [entry?.id, entry?.thumbnail_url, entry?.account_id, entry?.path, entry?.local_path]);

  if (!isPreviewPaneOpen) return null;

  const copyPath = () => {
    if (filePath) {
      navigator.clipboard?.writeText(filePath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const handleOpenTerminal = async () => {
    if (!entry) return;
    try {
      await invokeCommand("open_in_terminal", {
        path: filePath,
        account_id: entry.account_id,
      });
      showToast("Terminal opened");
    } catch (err: any) {
      showToast(err.message || "Failed to open terminal");
    }
  };

  const fileUri = filePath.startsWith("/") ? `file://${filePath}` : filePath;

  return (
    <aside
      className="adw-preview-pane"
      role="complementary"
      aria-label="File Preview Pane"
      style={{
        width: 340,
        minWidth: 280,
        maxWidth: 420,
        background: "var(--sidebar-bg)",
        borderLeft: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        zIndex: 10,
        position: "relative",
      }}
    >
      {/* Pane Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "var(--headerbar-bg)",
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Eye size={16} color="var(--active-accent)" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Preview</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {entry && (
            <button
              className="adw-btn adw-btn-icon"
              style={{ width: 28, height: 28 }}
              onClick={() => setQuickPreviewOpen(true)}
              title="Full Window Quick Preview (Space)"
            >
              <Maximize2 size={13} />
            </button>
          )}
          <button
            className="adw-btn adw-btn-icon"
            style={{ width: 28, height: 28 }}
            onClick={togglePreviewPane}
            title="Close Preview Pane (Alt+P)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Pane Body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "14px",
        }}
      >
        {!entry ? (
          /* Empty State: No Selection */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              textAlign: "center",
              color: "var(--dim-fg)",
              gap: 12,
              padding: "60px 20px",
            }}
          >
            <Eye size={48} strokeWidth={1.4} opacity={0.5} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--window-fg)", marginBottom: 4 }}>
                Select a file to preview
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                Click any image, document, code, video, or audio file to preview its content here.
              </div>
            </div>
          </div>
        ) : selectedEntries.length > 1 ? (
          /* Multi-selection state */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              textAlign: "center",
              color: "var(--dim-fg)",
              gap: 8,
              padding: "60px 20px",
            }}
          >
            <Folder size={44} strokeWidth={1.5} color="var(--adw-accent-blue)" />
            <div style={{ fontWeight: 600, fontSize: 15, color: "var(--window-fg)" }}>
              {selectedEntries.length} items selected
            </div>
            <div style={{ fontSize: 12 }}>
              Total size: {formatLocalizedFileSize(selectedEntries.reduce((acc, cur) => acc + (cur.size || 0), 0), language)}
            </div>
          </div>
        ) : (
          /* Single Entry Preview Viewport */
          <>
            {/* Visual Preview Box */}
            <div
              style={{
                width: "100%",
                background: "var(--card-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--adw-radius-m)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {entry.state === "cloud_only" && (cloudThumbUrl || (entry.thumbnail_url && !entry.thumbnail_url.startsWith("http"))) ? (
                <div style={{ width: "100%", position: "relative", background: "rgba(0,0,0,0.03)", textAlign: "center" }}>
                  <img
                    src={cloudThumbUrl || entry.thumbnail_url!}
                    alt={entry.name}
                    style={{
                      width: "100%",
                      maxHeight: 250,
                      objectFit: "contain",
                      display: "block",
                      padding: 8,
                    }}
                  />
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "var(--card-bg)",
                      borderTop: "1px solid var(--border-color)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--adw-accent-blue)" }}>
                        Cloud Thumbnail Preview
                      </div>
                      <div style={{ fontSize: 10, color: "var(--dim-fg)" }}>
                        Hydrate to view high-resolution file
                      </div>
                    </div>
                    <button
                      className="adw-btn adw-btn-accent"
                      style={{ height: 26, padding: "0 10px", fontSize: 11, gap: 5 }}
                      onClick={() => hydrateItem(entry.id)}
                    >
                      <Download size={12} />
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              ) : entry.state === "cloud_only" ? (
                <div style={{ padding: "28px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <HardDrive size={38} color="var(--adw-accent-blue)" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Cloud-Only File</div>
                    <div style={{ fontSize: 11, color: "var(--dim-fg)", marginTop: 2 }}>
                      Download on-demand to preview content
                    </div>
                  </div>
                  <button
                    className="adw-btn adw-btn-accent"
                    style={{ height: 30, padding: "0 12px", fontSize: 12, gap: 6 }}
                    onClick={() => hydrateItem(entry.id)}
                  >
                    <Download size={13} />
                    <span>Download to Preview</span>
                  </button>
                </div>
              ) : isImage ? (
                /* Image Preview */
                <div style={{ width: "100%", position: "relative", background: "rgba(0,0,0,0.03)" }}>
                  <img
                    src={fileUri}
                    alt={entry.name}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setImgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                    }}
                    style={{
                      width: "100%",
                      maxHeight: 250,
                      objectFit: "contain",
                      display: "block",
                      padding: 6,
                    }}
                  />
                  {imgDimensions && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 6,
                        right: 6,
                        background: "rgba(0, 0, 0, 0.65)",
                        color: "#ffffff",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontFamily: "var(--adw-font-mono)",
                      }}
                    >
                      {imgDimensions.width} × {imgDimensions.height}
                    </div>
                  )}
                </div>
              ) : isVideo ? (
                /* Video Preview Player */
                <div style={{ width: "100%", padding: 6 }}>
                  <video
                    controls
                    src={fileUri}
                    style={{
                      width: "100%",
                      maxHeight: 220,
                      borderRadius: "var(--adw-radius-s)",
                      background: "#000000",
                    }}
                  />
                </div>
              ) : isAudio ? (
                /* Audio Preview Player */
                <div
                  style={{
                    width: "100%",
                    padding: "20px 14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Music size={40} color="var(--adw-accent-purple)" />
                  <audio controls src={fileUri} style={{ width: "100%", height: 36 }} />
                </div>
              ) : isTextOrCode ? (
                /* Live Text / Code Preview */
                <div style={{ width: "100%", maxHeight: 250, display: "flex", flexDirection: "column" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      background: "var(--headerbar-bg)",
                      borderBottom: "1px solid var(--border-color)",
                      fontSize: 11,
                      color: "var(--dim-fg)",
                    }}
                  >
                    <span>Source Preview</span>
                    <span>{lineCount > 0 ? `${lineCount} lines` : ""}</span>
                  </div>
                  <div
                    style={{
                      padding: "10px",
                      overflowY: "auto",
                      maxHeight: 220,
                      fontFamily: "var(--adw-font-mono)",
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: "var(--window-fg)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {isTextLoading ? (
                      <span style={{ color: "var(--dim-fg)" }}>Reading file buffer...</span>
                    ) : textPreview ? (
                      textPreview
                    ) : (
                      <span style={{ color: "var(--dim-fg)" }}>Empty file or binary format.</span>
                    )}
                  </div>
                </div>
              ) : isPdf ? (
                /* PDF Document Preview */
                <div style={{ padding: "24px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <FileText size={42} color="var(--adw-accent-red)" />
                  <div style={{ fontWeight: 600, fontSize: 13 }}>PDF Document</div>
                  <button
                    className="adw-btn"
                    style={{ height: 28, fontSize: 11, gap: 4 }}
                    onClick={() => openItem(entry)}
                  >
                    <ExternalLink size={12} />
                    <span>Open in Document Viewer</span>
                  </button>
                </div>
              ) : entry.is_directory ? (
                /* Directory Card */
                <div style={{ padding: "24px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <Folder size={46} color="var(--adw-accent-blue)" />
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Folder</div>
                  <button
                    className="adw-btn adw-btn-accent"
                    style={{ height: 30, fontSize: 12, gap: 6 }}
                    onClick={() => openItem(entry)}
                  >
                    <span>Open Folder</span>
                  </button>
                </div>
              ) : (
                /* Generic File Card */
                <div style={{ padding: "24px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <FileText size={42} color="var(--dim-fg)" />
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{entry.mime_type || "Binary File"}</div>
                </div>
              )}
            </div>

            {/* Quick Actions Row */}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="adw-btn adw-btn-accent"
                style={{ flex: 1, height: 32, gap: 6, fontSize: 12 }}
                onClick={() => openItem(entry)}
              >
                <ExternalLink size={13} />
                <span>Open</span>
              </button>

              {!entry.is_directory && onOpenWith && (
                <button
                  type="button"
                  className="adw-btn"
                  style={{ height: 32, gap: 6, fontSize: 12 }}
                  onClick={() => onOpenWith(entry)}
                  title="Open With Another Application..."
                >
                  <AppWindow size={13} />
                  <span>Open With...</span>
                </button>
              )}

              <button
                type="button"
                className="adw-btn"
                style={{ height: 32, gap: 6, fontSize: 12 }}
                onClick={handleOpenTerminal}
                title="Open Terminal at this location"
              >
                <Terminal size={13} />
                <span>Terminal</span>
              </button>
            </div>

            {/* File Properties Card (Windows Explorer style lower pane) */}
            <div
              style={{
                background: "var(--card-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--adw-radius-m)",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--dim-fg)" }}>
                  Properties
                </span>
                <StateIcon state={entry.state} size={13} standalone={true} isLocal={isLocal} />
              </div>

              {/* Name */}
              <div>
                <div style={{ fontSize: 11, color: "var(--dim-fg)" }}>Name</div>
                <div style={{ fontSize: 13, fontWeight: 600, wordBreak: "break-word" }}>
                  {entry.name}
                </div>
              </div>

              {/* Size */}
              {!entry.is_directory && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--dim-fg)" }}>Size</div>
                  <div style={{ fontSize: 12 }}>
                    {formatLocalizedFileSize(entry.size, language)}
                    <span style={{ color: "var(--dim-fg)", fontSize: 11, marginLeft: 6 }}>
                      ({entry.size.toLocaleString()} bytes)
                    </span>
                  </div>
                </div>
              )}

              {/* Type */}
              <div>
                <div style={{ fontSize: 11, color: "var(--dim-fg)" }}>Type</div>
                <div style={{ fontSize: 12 }}>
                  {entry.is_directory ? "Folder" : entry.mime_type || "Generic File"}
                </div>
              </div>

              {/* Modified */}
              <div>
                <div style={{ fontSize: 11, color: "var(--dim-fg)" }}>Modified</div>
                <div style={{ fontSize: 12 }}>
                  {formatLocalizedDate(entry.mtime, language)}
                </div>
              </div>

              {/* Location Path with Copy */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "var(--dim-fg)" }}>Location</span>
                  <button
                    type="button"
                    onClick={copyPath}
                    className="adw-btn adw-btn-icon"
                    style={{ width: 18, height: 18, padding: 0, border: "none", background: "none" }}
                    title="Copy full path"
                  >
                    {copiedPath ? <Check size={11} color="var(--state-available)" /> : <Copy size={11} />}
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--adw-font-mono)",
                    color: "var(--dim-fg)",
                    wordBreak: "break-all",
                    marginTop: 2,
                  }}
                >
                  {filePath}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
