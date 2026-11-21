import React, { useState, useMemo } from "react";
import { X, Edit3, ArrowRight } from "lucide-react";
import { EntryRecord } from "../types";

interface BatchRenameDialogProps {
  entries: EntryRecord[];
  onApply: (previews: Array<{ id: string; oldName: string; newName: string }>) => void;
  onClose: () => void;
}

export const BatchRenameDialog: React.FC<BatchRenameDialogProps> = ({
  entries,
  onApply,
  onClose,
}) => {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [enableNumbering, setEnableNumbering] = useState(false);
  const [startNum, setStartNum] = useState(1);
  const [paddingDigits, setPaddingDigits] = useState(3);
  const [newExtension, setNewExtension] = useState("");

  const previews = useMemo(() => {
    return entries.map((entry, idx) => {
      const original = entry.name;
      const dotIdx = original.lastIndexOf(".");
      const stem = dotIdx > 0 ? original.substring(0, dotIdx) : original;
      const ext = dotIdx > 0 ? original.substring(dotIdx + 1) : "";

      let newStem = findText ? stem.replaceAll(findText, replaceText) : stem;

      if (enableNumbering) {
        const num = startNum + idx;
        const formatted = String(num).padStart(paddingDigits, "0");
        newStem = `${newStem}_${formatted}`;
      }

      if (prefix) newStem = `${prefix}${newStem}`;
      if (suffix) newStem = `${newStem}${suffix}`;

      const finalExt = newExtension.trim()
        ? newExtension.trim().replace(/^\./, "")
        : ext;

      const newName = finalExt ? `${newStem}.${finalExt}` : newStem;

      return {
        id: entry.id,
        oldName: original,
        newName,
      };
    });
  }, [
    entries,
    findText,
    replaceText,
    prefix,
    suffix,
    enableNumbering,
    startNum,
    paddingDigits,
    newExtension,
  ]);

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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--popover-bg)",
          borderRadius: "var(--adw-radius-l)",
          boxShadow: "var(--popover-shadow)",
          width: 580,
          maxHeight: "85vh",
          border: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Edit3 size={18} color="var(--adw-accent-blue)" />
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>
              Batch Rename ({entries.length} items)
            </h3>
          </div>
          <button className="adw-btn adw-btn-icon" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Configuration Controls */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            fontSize: 13,
          }}
        >
          {/* Find & Replace */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", color: "var(--dim-fg)", marginBottom: 4 }}>
                Find text
              </label>
              <input
                type="text"
                className="adw-crumb"
                style={{ width: "100%", height: 32, padding: "0 8px" }}
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="e.g. photo"
              />
            </div>
            <div>
              <label style={{ display: "block", color: "var(--dim-fg)", marginBottom: 4 }}>
                Replace with
              </label>
              <input
                type="text"
                className="adw-crumb"
                style={{ width: "100%", height: 32, padding: "0 8px" }}
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="e.g. vacation"
              />
            </div>
          </div>

          {/* Prefix & Suffix */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", color: "var(--dim-fg)", marginBottom: 4 }}>
                Prefix
              </label>
              <input
                type="text"
                className="adw-crumb"
                style={{ width: "100%", height: 32, padding: "0 8px" }}
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="e.g. 2026_"
              />
            </div>
            <div>
              <label style={{ display: "block", color: "var(--dim-fg)", marginBottom: 4 }}>
                Suffix
              </label>
              <input
                type="text"
                className="adw-crumb"
                style={{ width: "100%", height: 32, padding: "0 8px" }}
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder="e.g. _final"
              />
            </div>
          </div>

          {/* Numbering & Extension */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={enableNumbering}
                onChange={(e) => setEnableNumbering(e.target.checked)}
              />
              <span>Add sequence numbers</span>
            </label>

            {enableNumbering && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>Start:</span>
                <input
                  type="number"
                  className="adw-crumb"
                  style={{ width: 60, height: 28, padding: "0 6px" }}
                  value={startNum}
                  onChange={(e) => setStartNum(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <span>Digits:</span>
                <input
                  type="number"
                  className="adw-crumb"
                  style={{ width: 50, height: 28, padding: "0 6px" }}
                  value={paddingDigits}
                  onChange={(e) => setPaddingDigits(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            )}
          </div>

          {/* Extension */}
          <div>
            <label style={{ display: "block", color: "var(--dim-fg)", marginBottom: 4 }}>
              Change Extension (optional)
            </label>
            <input
              type="text"
              className="adw-crumb"
              style={{ width: "100%", height: 32, padding: "0 8px" }}
              value={newExtension}
              onChange={(e) => setNewExtension(e.target.value)}
              placeholder="e.g. png (leave empty to keep current)"
            />
          </div>
        </div>

        {/* Live Preview List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px", maxHeight: 220 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 8 }}>
            PREVIEW
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {previews.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  gap: 10,
                  alignItems: "center",
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: "var(--card-bg)",
                }}
              >
                <span style={{ color: "var(--dim-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.oldName}
                </span>
                <ArrowRight size={12} color="var(--dim-fg)" />
                <span style={{ color: "var(--adw-accent-blue)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.newName}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button className="adw-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="adw-btn adw-btn-accent"
            onClick={() => {
              onApply(previews);
              onClose();
            }}
          >
            Rename {entries.length} items
          </button>
        </div>
      </div>
    </div>
  );
};
