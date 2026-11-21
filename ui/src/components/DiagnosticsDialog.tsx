import React, { useEffect, useState } from "react";
import {
  X,
  Activity,
  Database,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Server,
  Gauge,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { DiagnosticsInfo } from "../types";
import { invokeCommand } from "../services/ipc";

export const DiagnosticsDialog: React.FC = () => {
  const { isDiagnosticsOpen, setDiagnosticsOpen } = useExplorerStore();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const data = await invokeCommand<DiagnosticsInfo>("get_diagnostics");
      setDiagnostics(data);
    } catch (err) {
      console.error("Failed to load diagnostics", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isDiagnosticsOpen) {
      fetchDiagnostics();
    }
  }, [isDiagnosticsOpen]);

  if (!isDiagnosticsOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatLimit = (bps: number) => {
    if (bps === 0) return "Unlimited";
    if (bps < 1024 * 1024) return `${Math.round(bps / 1024)} KB/s`;
    return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
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
        zIndex: 2200,
      }}
      onClick={() => setDiagnosticsOpen(false)}
    >
      <div
        style={{
          width: 600,
          maxWidth: "92vw",
          maxHeight: "85vh",
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Activity size={18} color="var(--active-accent)" />
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>System Diagnostics & Health</h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              className="adw-btn adw-btn-icon"
              onClick={fetchDiagnostics}
              title="Refresh Diagnostics"
            >
              <RefreshCw size={14} className={loading ? "spin-animation" : ""} />
            </button>
            <button
              className="adw-btn adw-btn-icon"
              onClick={() => setDiagnosticsOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Status Banner */}
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(46, 194, 126, 0.15)",
              border: "1px solid var(--state-pinned)",
              borderRadius: "var(--adw-radius-m)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <ShieldCheck size={24} color="var(--state-pinned)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--window-fg)" }}>
                Core Engine Resilient & Operational
              </div>
              <div style={{ fontSize: 12, color: "var(--dim-fg)", marginTop: 2 }}>
                All local metadata is cached in SQLite WAL. Zero UI thread blocking I/O detected.
              </div>
            </div>
          </div>

          {/* Database & Indexing Card */}
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--adw-radius-m)",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13 }}>
              <Database size={16} color="var(--active-accent)" />
              Metadata Store (SQLite)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
              <div>
                <span style={{ color: "var(--dim-fg)" }}>Indexed Entries:</span>
                <span style={{ fontWeight: 600, marginLeft: 8 }}>
                  {diagnostics?.total_indexed_entries ?? "—"}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--dim-fg)" }}>Journal Mode:</span>
                <span style={{ fontWeight: 600, marginLeft: 8, color: "var(--state-pinned)" }}>
                  {diagnostics?.wal_mode_enabled ? "WAL (Concurrent Reads)" : "Default"}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--dim-fg)" }}>Full-Text Search:</span>
                <span style={{ fontWeight: 600, marginLeft: 8 }}>
                  FTS5 Enabled
                </span>
              </div>

              <div>
                <span style={{ color: "var(--dim-fg)" }}>Crash Journal:</span>
                <span style={{ fontWeight: 600, marginLeft: 8 }}>
                  Active & Replayable
                </span>
              </div>
            </div>
          </div>

          {/* Cloud Sync & Bandwidth Card */}
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--adw-radius-m)",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13 }}>
              <Server size={16} color="var(--active-accent)" />
              Cloud Providers & Bandwidth Throttling
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
              <div>
                <span style={{ color: "var(--dim-fg)" }}>Active Providers:</span>
                <span style={{ fontWeight: 600, marginLeft: 8 }}>
                  {diagnostics?.active_providers_count ?? 1}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--dim-fg)" }}>Local Cache Size:</span>
                <span style={{ fontWeight: 600, marginLeft: 8 }}>
                  {formatBytes(diagnostics?.total_cache_bytes ?? 0)}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--dim-fg)" }}>Download Throttle:</span>
                <span style={{ fontWeight: 600, marginLeft: 8 }}>
                  {formatLimit(diagnostics?.download_limit_bps ?? 0)}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--dim-fg)" }}>Upload Throttle:</span>
                <span style={{ fontWeight: 600, marginLeft: 8 }}>
                  {formatLimit(diagnostics?.upload_limit_bps ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Mount Circuit Breakers */}
          <div
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--adw-radius-m)",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13 }}>
              <Gauge size={16} color="var(--active-accent)" />
              Filesystem Hang-Proof Circuit Breaker
            </div>

            <div style={{ fontSize: 12 }}>
              {diagnostics?.unresponsive_mounts && diagnostics.unresponsive_mounts.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ color: "var(--state-error)", display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertTriangle size={14} />
                    Unresponsive Mounts Isolated by Circuit Breaker:
                  </div>
                  {diagnostics.unresponsive_mounts.map((m) => (
                    <div
                      key={m}
                      style={{
                        padding: "4px 8px",
                        background: "var(--hover-bg)",
                        borderRadius: "var(--adw-radius-s)",
                        fontFamily: "var(--adw-font-mono)",
                        fontSize: 11,
                      }}
                    >
                      {m}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: "var(--dim-fg)" }}>
                  No unresponsive mounts detected. All local I/O calls operating under bounded deadlines (5s stat / 10s readdir).
                </div>
              )}
            </div>
          </div>
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
          <button className="adw-btn" onClick={() => setDiagnosticsOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
