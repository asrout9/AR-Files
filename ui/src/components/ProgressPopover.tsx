import React from "react";
import { Loader2, X, CheckCircle2 } from "lucide-react";
import { ActiveJob } from "../types";

export type { ActiveJob };

interface ProgressPopoverProps {
  jobs: ActiveJob[];
  onCancelJob: (jobId: string) => void;
  onClose: () => void;
}

export const ProgressPopover: React.FC<ProgressPopoverProps> = ({
  jobs,
  onCancelJob,
  onClose,
}) => {
  if (jobs.length === 0) return null;

  const formatSpeed = (bps: number) => {
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        backgroundColor: "var(--popover-bg)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--adw-radius-m)",
        boxShadow: "var(--popover-shadow)",
        width: 340,
        zIndex: 1050,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--card-bg)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>File Operations</span>
        <button
          className="adw-btn adw-btn-icon"
          style={{ width: 20, height: 20, padding: 0, border: "none" }}
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
        {jobs.map((job) => {
          const percent = job.totalBytes > 0
            ? Math.min(100, Math.round((job.bytesProcessed / job.totalBytes) * 100))
            : job.totalItems > 0
            ? Math.min(100, Math.round((job.itemsCompleted / job.totalItems) * 100))
            : 0;

          return (
            <div
              key={job.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {job.status === "running" ? (
                    <Loader2 size={13} className="spin" color="var(--adw-accent-blue)" />
                  ) : (
                    <CheckCircle2 size={13} color="var(--state-available)" />
                  )}
                  <span style={{ fontWeight: 500 }}>{job.title}</span>
                </div>

                {job.status === "running" && (
                  <button
                    className="adw-btn"
                    style={{ height: 20, padding: "0 6px", fontSize: 10 }}
                    onClick={() => onCancelJob(job.id)}
                  >
                    Cancel
                  </button>
                )}
              </div>

              {/* Progress bar */}
              <div
                style={{
                  height: 4,
                  backgroundColor: "var(--border-color)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${percent}%`,
                    backgroundColor: "var(--adw-accent-blue)",
                    transition: "width 0.2s ease",
                  }}
                />
              </div>

              {/* Metrics */}
              <div
                className="tabular-nums"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "var(--dim-fg)",
                  fontSize: 11,
                }}
              >
                <span>
                  {job.totalItems > 1 ? `${job.itemsCompleted} of ${job.totalItems} items` : `${formatBytes(job.bytesProcessed)} / ${formatBytes(job.totalBytes)}`}
                </span>
                <span>
                  {job.speedBps > 0 && `${formatSpeed(job.speedBps)}`}
                  {job.etaSeconds != null && ` • ETA ${job.etaSeconds}s`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
