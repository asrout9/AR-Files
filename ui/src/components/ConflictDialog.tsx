import React, { useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { EntryRecord } from "../types";

export type ConflictChoice = "replace" | "skip" | "keep_both";

interface ConflictDialogProps {
  sourceEntry: EntryRecord;
  existingEntry: EntryRecord;
  onResolve: (choice: ConflictChoice, applyToAll: boolean) => void;
  onCancel: () => void;
}

export const ConflictDialog: React.FC<ConflictDialogProps> = ({
  sourceEntry,
  existingEntry,
  onResolve,
  onCancel,
}) => {
  const [applyToAll, setApplyToAll] = useState(false);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--popover-bg)",
          borderRadius: "var(--adw-radius-l)",
          boxShadow: "var(--popover-shadow)",
          width: 520,
          border: "1px solid var(--border-color)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AlertTriangle size={24} color="#e5a50a" />
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>File Conflict Detected</h3>
        </div>

        <p style={{ fontSize: 13, color: "var(--dim-fg)", lineHeight: 1.5 }}>
          An item named <strong style={{ color: "var(--window-fg)" }}>"{sourceEntry.name}"</strong> already exists in this folder. What would you like to do?
        </p>

        {/* Side-by-Side Comparison */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 12,
            alignItems: "center",
            background: "var(--card-bg)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--adw-radius-m)",
            padding: 14,
          }}
        >
          {/* Source Item */}
          <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontWeight: 600, color: "var(--adw-accent-blue)" }}>Source Item</span>
            <div className="tabular-nums" style={{ color: "var(--dim-fg)" }}>{formatSize(sourceEntry.size)}</div>
            <div className="tabular-nums" style={{ color: "var(--dim-fg)", fontSize: 11 }}>{formatDate(sourceEntry.mtime)}</div>
          </div>

          <ArrowRight size={18} color="var(--dim-fg)" />

          {/* Existing Item */}
          <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontWeight: 600, color: "#e5a50a" }}>Existing Item</span>
            <div className="tabular-nums" style={{ color: "var(--dim-fg)" }}>{formatSize(existingEntry.size)}</div>
            <div className="tabular-nums" style={{ color: "var(--dim-fg)", fontSize: 11 }}>{formatDate(existingEntry.mtime)}</div>
          </div>
        </div>

        {/* Apply to All Checkbox */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
          />
          <span>Apply this decision to all remaining conflicts</span>
        </label>

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <button className="adw-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="adw-btn" onClick={() => onResolve("skip", applyToAll)}>
            Skip
          </button>
          <button className="adw-btn" onClick={() => onResolve("keep_both", applyToAll)}>
            Keep Both
          </button>
          <button className="adw-btn adw-btn-accent" onClick={() => onResolve("replace", applyToAll)}>
            Replace
          </button>
        </div>
      </div>
    </div>
  );
};
