import React, { useEffect, useState } from "react";
import { X, History, Download, RotateCcw, Check, User } from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { FileVersion } from "../types";
import { invokeCommand } from "../services/ipc";

export const VersionHistoryDialog: React.FC = () => {
  const {
    isVersionHistoryOpen,
    versionHistoryEntry,
    closeVersionHistory,
  } = useExplorerStore();

  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoredId, setRestoredId] = useState<string | null>(null);

  useEffect(() => {
    if (!isVersionHistoryOpen || !versionHistoryEntry) return;

    let mounted = true;
    setLoading(true);

    invokeCommand<FileVersion[]>("get_file_versions", {
      account_id: versionHistoryEntry.account_id,
      entry_id: versionHistoryEntry.id,
    })
      .then((data) => {
        if (mounted) {
          setVersions(data || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch versions", err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isVersionHistoryOpen, versionHistoryEntry]);

  if (!isVersionHistoryOpen || !versionHistoryEntry) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const handleRestore = (ver: FileVersion) => {
    setRestoredId(ver.version_id);
    setTimeout(() => {
      setRestoredId(null);
      closeVersionHistory();
    }, 1500);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2100,
      }}
      onClick={closeVersionHistory}
    >
      <div
        style={{
          width: 540,
          maxWidth: "92vw",
          maxHeight: "80vh",
          backgroundColor: "var(--popover-bg)",
          borderRadius: "var(--adw-radius-l)",
          boxShadow: "var(--popover-shadow)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            background: "var(--headerbar-bg)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <History size={18} color="var(--active-accent)" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Version History</div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--dim-fg)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 360,
                }}
              >
                {versionHistoryEntry.name}
              </div>
            </div>
          </div>
          <button
            className="adw-btn adw-btn-icon"
            onClick={closeVersionHistory}
          >
            <X size={16} />
          </button>
        </div>

        {/* Versions List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {loading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--dim-fg)" }}>
              Loading cloud revisions...
            </div>
          ) : versions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--dim-fg)" }}>
              No previous revisions recorded for this file.
            </div>
          ) : (
            versions.map((ver, idx) => (
              <div
                key={ver.version_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  background: idx === 0 ? "var(--selected-bg)" : "var(--card-bg)",
                  borderRadius: "var(--adw-radius-m)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "1px 6px",
                        borderRadius: "var(--adw-radius-s)",
                        background: idx === 0 ? "var(--active-accent)" : "var(--hover-bg)",
                        color: idx === 0 ? "#ffffff" : "var(--window-fg)",
                      }}
                    >
                      {idx === 0 ? "Current" : ver.version_id}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {formatDate(ver.modified_time)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      fontSize: 11,
                      color: "var(--dim-fg)",
                    }}
                  >
                    <span>{formatBytes(ver.size)}</span>
                    {ver.author && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <User size={10} />
                        {ver.author}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {idx !== 0 && (
                    <button
                      className="adw-btn"
                      onClick={() => handleRestore(ver)}
                      title="Restore to this version"
                    >
                      {restoredId === ver.version_id ? (
                        <>
                          <Check size={14} style={{ marginRight: 6, color: "var(--state-available)" }} />
                          Restored
                        </>
                      ) : (
                        <>
                          <RotateCcw size={14} style={{ marginRight: 6 }} />
                          Restore
                        </>
                      )}
                    </button>
                  )}
                  {ver.download_url && (
                    <a
                      href={ver.download_url}
                      target="_blank"
                      rel="noreferrer"
                      className="adw-btn adw-btn-icon"
                      title="Download revision file"
                    >
                      <Download size={14} />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 18px",
            background: "var(--headerbar-bg)",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button className="adw-btn" onClick={closeVersionHistory}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
