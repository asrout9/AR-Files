import React, { useState } from "react";
import {
  X,
  Folder,
  HardDrive,
  Pin,
  Share2,
  History,
  Download,
  Check,
  Copy,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { StateIcon } from "./StateIcon";
import { FileIcon } from "./FileIcon";
import { EntryRecord } from "../types";

export const DetailsPane: React.FC = () => {
  const {
    entries,
    selectedIds,
    isDetailsPaneOpen,
    toggleDetailsPane,
    breadcrumbs,
    currentAccountId,
    accounts,
    hydrateItem,
    freeUpSpaceItem,
    pinItem,
    unpinItem,
    getShareLink,
    openVersionHistory,
  } = useExplorerStore();

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  if (!isDetailsPaneOpen) return null;

  const selectedEntries = entries.filter((e) => selectedIds.has(e.id));
  const currentAccount = accounts.find((a) => a.id === currentAccountId);

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

  const handleCopyShareLink = async (entry: EntryRecord) => {
    try {
      const link = await getShareLink(entry.account_id, entry.id);
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyHash = async (hash: string) => {
    await navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const renderIcon = (entry: EntryRecord) => {
    return <FileIcon entry={entry} size={64} />;
  };

  return (
    <aside
      className="adw-details-pane"
      style={{
        width: 320,
        minWidth: 280,
        maxWidth: 380,
        background: "var(--sidebar-bg)",
        borderLeft: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
        padding: "16px",
        gap: "16px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border-color)",
          paddingBottom: "10px",
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>Properties & Details</h3>
        <button
          className="adw-btn adw-btn-icon"
          onClick={toggleDetailsPane}
          title="Close Details Pane"
        >
          <X size={16} />
        </button>
      </div>

      {selectedEntries.length === 1 ? (
        // Single Entry Details
        (() => {
          const entry = selectedEntries[0];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Preview & Name */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: 10,
                  padding: "16px 0",
                  background: "var(--card-bg)",
                  borderRadius: "var(--adw-radius-m)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <div style={{ position: "relative" }}>
                  {renderIcon(entry)}
                  <span
                    style={{
                      position: "absolute",
                      bottom: -4,
                      right: -4,
                      background: "var(--card-bg)",
                      borderRadius: "50%",
                      padding: 2,
                      boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
                    }}
                  >
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
                  </span>
                </div>
                <div style={{ padding: "0 12px", width: "100%" }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      wordBreak: "break-word",
                      color: "var(--window-fg)",
                    }}
                  >
                    {entry.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--dim-fg)",
                      marginTop: 2,
                    }}
                  >
                    {entry.is_directory ? "Folder" : formatBytes(entry.size)}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {entry.state === "cloud_only" && (
                  <button
                    className="adw-btn adw-btn-accent"
                    style={{ gridColumn: "span 2" }}
                    onClick={() => hydrateItem(entry.id)}
                  >
                    <Download size={14} style={{ marginRight: 6 }} />
                    Download Now
                  </button>
                )}

                {(entry.state === "available" || entry.state === "pinned") && (
                  <button
                    className="adw-btn"
                    onClick={() => freeUpSpaceItem(entry.id)}
                    title="Evict local copy to free space"
                  >
                    <HardDrive size={14} style={{ marginRight: 6 }} />
                    Free Up Space
                  </button>
                )}

                {entry.state === "pinned" ? (
                  <button
                    className="adw-btn"
                    onClick={() => unpinItem(entry.id)}
                  >
                    <Pin size={14} style={{ marginRight: 6 }} />
                    Unpin
                  </button>
                ) : (
                  <button
                    className="adw-btn"
                    onClick={() => pinItem(entry.id)}
                  >
                    <Pin size={14} style={{ marginRight: 6 }} />
                    Always Keep
                  </button>
                )}

                <button
                  className="adw-btn"
                  onClick={() => handleCopyShareLink(entry)}
                  title="Copy direct share link"
                >
                  {copiedLink ? (
                    <Check size={14} style={{ marginRight: 6, color: "var(--state-available)" }} />
                  ) : (
                    <Share2 size={14} style={{ marginRight: 6 }} />
                  )}
                  {copiedLink ? "Copied Link!" : "Share Link"}
                </button>

                {!entry.is_directory && (
                  <button
                    className="adw-btn"
                    onClick={() => openVersionHistory(entry)}
                  >
                    <History size={14} style={{ marginRight: 6 }} />
                    Revisions
                  </button>
                )}
              </div>

              {/* Attributes Card */}
              <div
                style={{
                  background: "var(--card-bg)",
                  borderRadius: "var(--adw-radius-m)",
                  border: "1px solid var(--border-color)",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, borderBottom: "1px solid var(--border-color)", paddingBottom: 6 }}>
                  Information
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--dim-fg)" }}>State</span>
                  <span style={{ fontWeight: 500, textTransform: "capitalize" }}>
                    {entry.state.replace("_", " ")}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--dim-fg)" }}>Type</span>
                  <span style={{ fontWeight: 500 }}>{entry.mime_type || "Unknown"}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--dim-fg)" }}>Location</span>
                  <span
                    style={{
                      maxWidth: 160,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={entry.path}
                  >
                    {entry.path}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--dim-fg)" }}>Modified</span>
                  <span>{formatDate(entry.mtime)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--dim-fg)" }}>Created</span>
                  <span>{formatDate(entry.created_at)}</span>
                </div>

                {entry.content_hash && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "var(--dim-fg)" }}>Hash</span>
                    <button
                      onClick={() => handleCopyHash(entry.content_hash!)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        color: "var(--active-accent)",
                        fontSize: 11,
                      }}
                      title="Copy content SHA256"
                    >
                      {copiedHash ? <Check size={12} /> : <Copy size={12} />}
                      {entry.content_hash.substring(0, 10)}…
                    </button>
                  </div>
                )}

                {entry.local_path && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ color: "var(--dim-fg)" }}>Local Cache</span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--dim-fg)",
                        wordBreak: "break-all",
                        fontFamily: "var(--adw-font-mono)",
                      }}
                    >
                      {entry.local_path}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      ) : selectedEntries.length > 1 ? (
        // Multiple Entries Selection
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              padding: 16,
              background: "var(--card-bg)",
              borderRadius: "var(--adw-radius-m)",
              border: "1px solid var(--border-color)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {selectedEntries.length}
            </div>
            <div style={{ color: "var(--dim-fg)", fontSize: 13, marginTop: 4 }}>
              Items Selected
            </div>
            <div style={{ marginTop: 8, fontSize: 14, fontWeight: 500 }}>
              Total:{" "}
              {formatBytes(
                selectedEntries.reduce((acc, curr) => acc + curr.size, 0)
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              className="adw-btn"
              onClick={async () => {
                for (const item of selectedEntries) {
                  if (item.state === "available" || item.state === "pinned") {
                    await freeUpSpaceItem(item.id);
                  }
                }
              }}
            >
              <HardDrive size={14} style={{ marginRight: 6 }} />
              Free Up Space ({selectedEntries.length} items)
            </button>
            <button
              className="adw-btn"
              onClick={async () => {
                for (const item of selectedEntries) {
                  await pinItem(item.id);
                }
              }}
            >
              <Pin size={14} style={{ marginRight: 6 }} />
              Pin All to Device
            </button>
          </div>
        </div>
      ) : (
        // Current Folder Summary
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              padding: 16,
              background: "var(--card-bg)",
              borderRadius: "var(--adw-radius-m)",
              border: "1px solid var(--border-color)",
              textAlign: "center",
            }}
          >
            <Folder size={48} color="var(--active-accent)" style={{ margin: "0 auto 8px" }} />
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {breadcrumbs[breadcrumbs.length - 1]?.name || "Root"}
            </div>
            <div style={{ color: "var(--dim-fg)", fontSize: 12, marginTop: 4 }}>
              {entries.length} items in folder
            </div>
          </div>

          <div
            style={{
              background: "var(--card-bg)",
              borderRadius: "var(--adw-radius-m)",
              border: "1px solid var(--border-color)",
              padding: 12,
              fontSize: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, borderBottom: "1px solid var(--border-color)", paddingBottom: 6 }}>
              Account Context
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--dim-fg)" }}>Account</span>
              <span style={{ fontWeight: 500 }}>{currentAccount?.name || "Local Filesystem"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--dim-fg)" }}>Provider</span>
              <span style={{ textTransform: "capitalize" }}>{currentAccount?.provider_type || "POSIX"}</span>
            </div>
            {currentAccount?.quota_total && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--dim-fg)" }}>Quota Used</span>
                  <span style={{ fontWeight: 600 }}>
                    {formatBytes(currentAccount.quota_used || 0)} / {formatBytes(currentAccount.quota_total)}
                  </span>
                </div>
                <div style={{ height: 5, width: "100%", backgroundColor: "rgba(128, 128, 128, 0.22)", borderRadius: 3, overflow: "hidden", marginTop: 4 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(currentAccount.quota_used || 0) > 0 ? Math.max(2, Math.min(100, ((currentAccount.quota_used || 0) / currentAccount.quota_total) * 100)) : 0}%`,
                      backgroundColor: "var(--adw-accent-blue)",
                      borderRadius: 3,
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
