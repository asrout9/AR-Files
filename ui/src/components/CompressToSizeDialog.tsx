import React, { useState, useMemo, useEffect } from "react";
import { X, FileDown, FileText, Image as ImageIcon, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { EntryRecord } from "../types";
import { useExplorerStore } from "../store/useExplorerStore";

interface CompressToSizeDialogProps {
  entry: EntryRecord | null;
  onClose: () => void;
  onSuccess?: (outputPath: string, compressedSize: number) => void;
}

type SizeUnit = "KB" | "MB";

interface PresetOption {
  label: string;
  value: number;
  unit: SizeUnit;
}

const PRESETS: PresetOption[] = [
  { label: "100 KB", value: 100, unit: "KB" },
  { label: "300 KB", value: 300, unit: "KB" },
  { label: "500 KB", value: 500, unit: "KB" },
  { label: "1 MB", value: 1, unit: "MB" },
  { label: "2 MB", value: 2, unit: "MB" },
  { label: "5 MB", value: 5, unit: "MB" },
];

export const CompressToSizeDialog: React.FC<CompressToSizeDialogProps> = ({
  entry,
  onClose,
  onSuccess,
}) => {
  const { compressFileToSize, showToast } = useExplorerStore();

  const [sizeValue, setSizeValue] = useState<number>(300);
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("KB");
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isCompressing) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isCompressing]);

  // Default initial preset based on source file size
  useEffect(() => {
    if (entry && entry.size > 0) {
      if (entry.size > 5 * 1024 * 1024) {
        setSizeValue(1);
        setSizeUnit("MB");
      } else if (entry.size > 1024 * 1024) {
        setSizeValue(500);
        setSizeUnit("KB");
      } else if (entry.size > 200 * 1024) {
        setSizeValue(100);
        setSizeUnit("KB");
      } else {
        const suggestedKB = Math.max(1, Math.round((entry.size * 0.6) / 1024));
        setSizeValue(suggestedKB);
        setSizeUnit("KB");
      }
    }
  }, [entry]);

  if (!entry) return null;

  const isPdf =
    entry.name.toLowerCase().endsWith(".pdf") ||
    entry.mime_type?.toLowerCase().includes("pdf");

  const targetBytes = useMemo(() => {
    const multiplier = sizeUnit === "MB" ? 1024 * 1024 : 1024;
    return Math.max(1, Math.round((sizeValue || 0) * multiplier));
  }, [sizeValue, sizeUnit]);

  const formattedSizeLabel = useMemo(() => {
    return `${sizeValue || 0}${sizeUnit}`;
  }, [sizeValue, sizeUnit]);

  const outputFileName = useMemo(() => {
    const original = entry.name;
    const dotIdx = original.lastIndexOf(".");
    const stem = dotIdx > 0 ? original.substring(0, dotIdx) : original;
    const ext = dotIdx > 0 ? original.substring(dotIdx) : "";
    return `${stem}_compressed_${formattedSizeLabel}${ext}`;
  }, [entry.name, formattedSizeLabel]);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handlePresetSelect = (preset: PresetOption) => {
    setSizeValue(preset.value);
    setSizeUnit(preset.unit);
    setErrorMessage(null);
  };

  const isCurrentPreset = (preset: PresetOption) => {
    return sizeValue === preset.value && sizeUnit === preset.unit;
  };

  const handleCompress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!entry || isCompressing) return;

    if (!sizeValue || sizeValue <= 0) {
      setErrorMessage("Please enter a valid target size greater than 0");
      return;
    }

    if (isTargetLargerThanCurrent) {
      setErrorMessage(
        `Target size must be smaller than the current file size (${formatBytes(entry.size)})`
      );
      return;
    }

    setIsCompressing(true);
    setErrorMessage(null);

    const sourcePath = entry.local_path || entry.path || entry.id;

    try {
      const res = await compressFileToSize(
        sourcePath,
        targetBytes,
        formattedSizeLabel
      );

      const compressedSize =
        typeof res?.compressed_size === "number"
          ? res.compressed_size
          : typeof (res as any)?.data?.compressed_size === "number"
          ? (res as any).data.compressed_size
          : null;

      const outputPath =
        res?.output_path || (res as any)?.data?.output_path || outputFileName;

      if (compressedSize === null) {
        throw new Error(
          (res as any)?.error || "Invalid response received from compression service"
        );
      }

      const savedBytes = entry.size > compressedSize ? entry.size - compressedSize : 0;
      const savedPercent = entry.size > 0 && savedBytes > 0
        ? Math.round((savedBytes / entry.size) * 100)
        : 0;

      showToast(
        `Successfully compressed to ${formatBytes(compressedSize)}${
          savedPercent > 0 ? ` (${savedPercent}% smaller)` : ""
        }`
      );

      if (onSuccess) {
        onSuccess(outputPath, compressedSize);
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to compress file to desired size");
    } finally {
      setIsCompressing(false);
    }
  };

  const isTargetLargerThanCurrent = targetBytes >= entry.size && entry.size > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compress-dialog-title"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isCompressing) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: "var(--popover-bg)",
          borderRadius: "var(--adw-radius-l)",
          boxShadow: "var(--popover-shadow)",
          width: 520,
          maxWidth: "92vw",
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
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--adw-radius-m)",
                backgroundColor: "var(--hover-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileDown size={18} color="var(--adw-accent-blue)" />
            </div>
            <div>
              <h2
                id="compress-dialog-title"
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--window-fg)",
                  margin: 0,
                }}
              >
                Compress to Desired Size
              </h2>
              <span style={{ fontSize: 12, color: "var(--dim-fg)" }}>
                Reduce {isPdf ? "PDF document" : "image"} to a specified maximum size
              </span>
            </div>
          </div>
          <button
            type="button"
            className="adw-btn"
            style={{ padding: 6, borderRadius: "50%" }}
            onClick={onClose}
            disabled={isCompressing}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleCompress} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Source File Summary */}
          <div
            style={{
              padding: "12px 14px",
              backgroundColor: "var(--hover-bg)",
              borderRadius: "var(--adw-radius-m)",
              border: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {isPdf ? (
              <FileText size={28} color="var(--adw-accent-red)" />
            ) : (
              <ImageIcon size={28} color="var(--adw-accent-blue)" />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 500,
                  fontSize: 13,
                  color: "var(--window-fg)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={entry.name}
              >
                {entry.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--dim-fg)", marginTop: 2 }}>
                Current Size: <strong>{formatBytes(entry.size)}</strong> ({entry.size.toLocaleString()} bytes)
              </div>
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--dim-fg)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: 8,
              }}
            >
              Quick Presets
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: 6,
              }}
            >
              {PRESETS.map((preset) => {
                const active = isCurrentPreset(preset);
                const mult = preset.unit === "MB" ? 1024 * 1024 : 1024;
                const pBytes = preset.value * mult;
                const isPresetLarger = Boolean(entry.size > 0 && pBytes >= entry.size);

                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePresetSelect(preset)}
                    disabled={isCompressing}
                    title={
                      isPresetLarger
                        ? `Preset (${preset.label}) is larger than or equal to current file size (${formatBytes(entry.size)})`
                        : undefined
                    }
                    style={{
                      padding: "8px 4px",
                      borderRadius: "var(--adw-radius-m)",
                      border: active
                        ? "1.5px solid var(--adw-accent-blue)"
                        : "1px solid var(--border-color)",
                      backgroundColor: active
                        ? "var(--selected-bg)"
                        : "var(--card-bg)",
                      color: active
                        ? "var(--selected-fg)"
                        : isPresetLarger
                        ? "var(--dim-fg)"
                        : "var(--window-fg)",
                      fontWeight: active ? 600 : 500,
                      fontSize: 12,
                      cursor: isCompressing ? "default" : "pointer",
                      transition: "var(--adw-transition)",
                      textAlign: "center",
                      opacity: isPresetLarger && !active ? 0.6 : 1,
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Size Input */}
          <div>
            <label
              htmlFor="target-size-input"
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--dim-fg)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: 8,
              }}
            >
              Target File Size
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="target-size-input"
                type="number"
                min="1"
                step="any"
                value={sizeValue}
                onChange={(e) => {
                  setSizeValue(parseFloat(e.target.value) || 0);
                  setErrorMessage(null);
                }}
                disabled={isCompressing}
                style={{
                  flex: 1,
                  height: 38,
                  padding: "0 12px",
                  fontSize: 14,
                  borderRadius: "var(--adw-radius-m)",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--view-bg)",
                  color: "var(--window-fg)",
                  outline: "none",
                }}
                placeholder="e.g. 100, 300, 1"
                autoFocus
              />
              <select
                aria-label="Unit"
                value={sizeUnit}
                onChange={(e) => setSizeUnit(e.target.value as SizeUnit)}
                disabled={isCompressing}
                style={{
                  width: 90,
                  height: 38,
                  padding: "0 8px",
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: "var(--adw-radius-m)",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--view-bg)",
                  color: "var(--window-fg)",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="KB">KB</option>
                <option value="MB">MB</option>
              </select>
            </div>
          </div>

          {/* Output Information Preview */}
          <div
            style={{
              padding: "12px 14px",
              backgroundColor: "var(--view-bg)",
              borderRadius: "var(--adw-radius-m)",
              border: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--dim-fg)" }}>Target Maximum:</span>
              <span style={{ fontWeight: 600, color: "var(--window-fg)" }}>
                {formatBytes(targetBytes)} ({targetBytes.toLocaleString()} bytes)
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--dim-fg)" }}>Resulting File:</span>
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--adw-accent-blue)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 280,
                }}
                title={outputFileName}
              >
                {outputFileName}
              </span>
            </div>
            {isTargetLargerThanCurrent && (
              <div
                style={{
                  marginTop: 4,
                  color: "var(--adw-accent-orange)",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <AlertCircle size={13} style={{ flexShrink: 0 }} />
                <span>
                  Target size ({formatBytes(targetBytes)}) must be smaller than current file size ({formatBytes(entry.size)}).
                </span>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "var(--adw-radius-m)",
                backgroundColor: "rgba(192, 28, 40, 0.1)",
                border: "1px solid var(--state-error)",
                color: "var(--state-error)",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Footer Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 10,
              marginTop: 4,
            }}
          >
            <button
              type="button"
              className="adw-btn"
              onClick={onClose}
              disabled={isCompressing}
              style={{ minWidth: 80 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="adw-btn adw-btn-accent"
              disabled={isCompressing || !sizeValue || sizeValue <= 0 || isTargetLargerThanCurrent}
              title={
                isTargetLargerThanCurrent
                  ? `Target size must be smaller than the current file size (${formatBytes(entry.size)})`
                  : undefined
              }
              style={{
                minWidth: 110,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                cursor:
                  isCompressing || !sizeValue || sizeValue <= 0 || isTargetLargerThanCurrent
                    ? "default"
                    : "pointer",
                opacity:
                  isCompressing || !sizeValue || sizeValue <= 0 || isTargetLargerThanCurrent
                    ? 0.55
                    : 1,
              }}
            >
              {isCompressing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Compressing...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={14} />
                  <span>Compress</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
