import React, { useState, useEffect } from "react";
import {
  X,
  Sliders,
  Cloud,
  HardDrive,
  Users,
  Plus,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";

type PreferencesTab = "general" | "sync" | "cache" | "accounts";

export const PreferencesDialog: React.FC = () => {
  const {
    isPreferencesOpen,
    setPreferencesOpen,
    viewMode,
    setViewMode,
    showHidden,
    toggleShowHidden,
    accounts,
    addOneDriveAccount,
    addGenericAccount,
    freeUpAllCache,
    setBandwidthLimits,
    downloadLimitBps,
    uploadLimitBps,
  } = useExplorerStore();

  const [activeTab, setActiveTab] = useState<PreferencesTab>("general");
  const [downloadKB, setDownloadKB] = useState(
    downloadLimitBps > 0 ? Math.round(downloadLimitBps / 1024) : 0
  );
  const [uploadKB, setUploadKB] = useState(
    uploadLimitBps > 0 ? Math.round(uploadLimitBps / 1024) : 0
  );

  const [isAddingGeneric, setIsAddingGeneric] = useState(false);
  const [genericType, setGenericType] = useState("webdav");
  const [genericName, setGenericName] = useState("");
  const [genericEndpoint, setGenericEndpoint] = useState("");
  const [genericUser, setGenericUser] = useState("");
  const [genericPass, setGenericPass] = useState("");

  const [cacheEvictMsg, setCacheEvictMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isPreferencesOpen) {
      setDownloadKB(downloadLimitBps > 0 ? Math.round(downloadLimitBps / 1024) : 0);
      setUploadKB(uploadLimitBps > 0 ? Math.round(uploadLimitBps / 1024) : 0);
    }
  }, [isPreferencesOpen, downloadLimitBps, uploadLimitBps]);

  if (!isPreferencesOpen) return null;

  const handleSaveLimits = async () => {
    const downBps = downloadKB * 1024;
    const upBps = uploadKB * 1024;
    await setBandwidthLimits(downBps, upBps);
  };

  const handleFreeUpCache = async () => {
    const count = await freeUpAllCache();
    setCacheEvictMsg(`Freed up ${count} local cached items.`);
    setTimeout(() => setCacheEvictMsg(null), 3500);
  };

  const handleAddGenericSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genericName.trim() || !genericEndpoint.trim()) return;

    try {
      await addGenericAccount(
        genericType,
        genericName.trim(),
        genericEndpoint.trim(),
        genericUser.trim() || undefined,
        genericPass || undefined
      );
      setIsAddingGeneric(false);
      setGenericName("");
      setGenericEndpoint("");
      setGenericUser("");
      setGenericPass("");
    } catch (err) {
      console.error(err);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
        zIndex: 2300,
      }}
      onClick={() => setPreferencesOpen(false)}
    >
      <div
        style={{
          width: 700,
          maxWidth: "94vw",
          height: 520,
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
            padding: "12px 18px",
            background: "var(--headerbar-bg)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sliders size={18} color="var(--active-accent)" />
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Preferences</h3>
          </div>
          <button
            className="adw-btn adw-btn-icon"
            onClick={() => setPreferencesOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Preferences Container (Left Nav + Right Settings) */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Left Category Sidebar */}
          <div
            style={{
              width: 190,
              background: "var(--sidebar-bg)",
              borderRight: "1px solid var(--border-color)",
              padding: "12px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <button
              className={`adw-btn ${activeTab === "general" ? "adw-btn-accent" : ""}`}
              style={{ justifyContent: "flex-start", width: "100%", gap: 8 }}
              onClick={() => setActiveTab("general")}
            >
              <Sliders size={14} />
              General
            </button>
            <button
              className={`adw-btn ${activeTab === "sync" ? "adw-btn-accent" : ""}`}
              style={{ justifyContent: "flex-start", width: "100%", gap: 8 }}
              onClick={() => setActiveTab("sync")}
            >
              <Cloud size={14} />
              Cloud & Sync
            </button>
            <button
              className={`adw-btn ${activeTab === "cache" ? "adw-btn-accent" : ""}`}
              style={{ justifyContent: "flex-start", width: "100%", gap: 8 }}
              onClick={() => setActiveTab("cache")}
            >
              <HardDrive size={14} />
              Local Cache
            </button>
            <button
              className={`adw-btn ${activeTab === "accounts" ? "adw-btn-accent" : ""}`}
              style={{ justifyContent: "flex-start", width: "100%", gap: 8 }}
              onClick={() => setActiveTab("accounts")}
            >
              <Users size={14} />
              Accounts
            </button>
          </div>

          {/* Right Settings Body */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {/* General Tab */}
            {activeTab === "general" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: "var(--dim-fg)", marginBottom: 8 }}>
                    View & Appearance
                  </h4>

                  <div
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--adw-radius-m)",
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>Default View Mode</div>
                        <div style={{ fontSize: 12, color: "var(--dim-fg)" }}>Choose between detailed list or icon grid</div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className={`adw-btn ${viewMode === "list" ? "adw-btn-accent" : ""}`}
                          onClick={() => setViewMode("list")}
                        >
                          List
                        </button>
                        <button
                          className={`adw-btn ${viewMode === "grid" ? "adw-btn-accent" : ""}`}
                          onClick={() => setViewMode("grid")}
                        >
                          Grid
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--border-color)", paddingTop: 12 }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>Hidden Files</div>
                        <div style={{ fontSize: 12, color: "var(--dim-fg)" }}>Show files and folders beginning with a dot (.)</div>
                      </div>
                      <button
                        className={`adw-btn ${showHidden ? "adw-btn-accent" : ""}`}
                        onClick={toggleShowHidden}
                      >
                        {showHidden ? "Showing" : "Hidden"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cloud & Sync Tab */}
            {activeTab === "sync" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: "var(--dim-fg)", marginBottom: 8 }}>
                    Bandwidth Limiter (Token Bucket)
                  </h4>

                  <div
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--adw-radius-m)",
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontWeight: 500 }}>Download Speed Limit</span>
                        <span style={{ fontWeight: 600, color: "var(--active-accent)" }}>
                          {downloadKB === 0 ? "Unlimited" : `${downloadKB} KB/s`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="20000"
                        step="500"
                        value={downloadKB}
                        onChange={(e) => setDownloadKB(Number(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontWeight: 500 }}>Upload Speed Limit</span>
                        <span style={{ fontWeight: 600, color: "var(--active-accent)" }}>
                          {uploadKB === 0 ? "Unlimited" : `${uploadKB} KB/s`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="20000"
                        step="500"
                        value={uploadKB}
                        onChange={(e) => setUploadKB(Number(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>

                    <button
                      className="adw-btn adw-btn-accent"
                      onClick={handleSaveLimits}
                      style={{ alignSelf: "flex-end" }}
                    >
                      Apply Limits
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Local Cache Tab */}
            {activeTab === "cache" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: "var(--dim-fg)", marginBottom: 8 }}>
                    Storage & Cache Management
                  </h4>

                  <div
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--adw-radius-m)",
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>Local Hydration Cache</div>
                      <div style={{ fontSize: 12, color: "var(--dim-fg)", marginTop: 4 }}>
                        Hydrated cloud files are cached locally for instantaneous offline reads. Pinned files are never evicted.
                      </div>
                    </div>

                    {cacheEvictMsg && (
                      <div
                        style={{
                          padding: "8px 12px",
                          background: "var(--selected-bg)",
                          borderRadius: "var(--adw-radius-s)",
                          color: "var(--active-accent)",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {cacheEvictMsg}
                      </div>
                    )}

                    <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: 12 }}>
                      <button
                        className="adw-btn"
                        onClick={handleFreeUpCache}
                      >
                        <HardDrive size={14} style={{ marginRight: 6 }} />
                        Free Up All Local Cache (Keep Placeholders)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Accounts Tab */}
            {activeTab === "accounts" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: "var(--dim-fg)" }}>
                    Connected Accounts ({accounts.length})
                  </h4>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="adw-btn"
                      onClick={() => addOneDriveAccount("OneDrive Work")}
                    >
                      <Plus size={14} style={{ marginRight: 4 }} />
                      Add OneDrive
                    </button>
                    <button
                      className="adw-btn"
                      onClick={() => setIsAddingGeneric(true)}
                    >
                      <Plus size={14} style={{ marginRight: 4 }} />
                      Add WebDAV/S3
                    </button>
                  </div>
                </div>

                {/* Add Generic Form */}
                {isAddingGeneric && (
                  <form
                    onSubmit={handleAddGenericSubmit}
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--active-accent)",
                      borderRadius: "var(--adw-radius-m)",
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      Add Generic Cloud Provider (rclone/OpenDAL backend)
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <select
                        value={genericType}
                        onChange={(e) => setGenericType(e.target.value)}
                        className="adw-btn"
                        style={{ height: 34 }}
                      >
                        <option value="webdav">WebDAV</option>
                        <option value="nextcloud">Nextcloud</option>
                        <option value="s3">S3 Compatible</option>
                        <option value="sftp">SFTP</option>
                      </select>

                      <input
                        type="text"
                        placeholder="Account Label (e.g. Nextcloud Home)"
                        value={genericName}
                        onChange={(e) => setGenericName(e.target.value)}
                        style={{
                          height: 34,
                          padding: "0 8px",
                          borderRadius: "var(--adw-radius-s)",
                          border: "1px solid var(--border-color)",
                          background: "var(--view-bg)",
                          color: "var(--window-fg)",
                        }}
                      />
                    </div>

                    <input
                      type="text"
                      placeholder="Endpoint URL (e.g. https://cloud.example.com/remote.php/dav/files/user/)"
                      value={genericEndpoint}
                      onChange={(e) => setGenericEndpoint(e.target.value)}
                      style={{
                        height: 34,
                        padding: "0 8px",
                        borderRadius: "var(--adw-radius-s)",
                        border: "1px solid var(--border-color)",
                        background: "var(--view-bg)",
                        color: "var(--window-fg)",
                      }}
                    />

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <input
                        type="text"
                        placeholder="Username"
                        value={genericUser}
                        onChange={(e) => setGenericUser(e.target.value)}
                        style={{
                          height: 34,
                          padding: "0 8px",
                          borderRadius: "var(--adw-radius-s)",
                          border: "1px solid var(--border-color)",
                          background: "var(--view-bg)",
                          color: "var(--window-fg)",
                        }}
                      />
                      <input
                        type="password"
                        placeholder="Password / App Token"
                        value={genericPass}
                        onChange={(e) => setGenericPass(e.target.value)}
                        style={{
                          height: 34,
                          padding: "0 8px",
                          borderRadius: "var(--adw-radius-s)",
                          border: "1px solid var(--border-color)",
                          background: "var(--view-bg)",
                          color: "var(--window-fg)",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        className="adw-btn"
                        onClick={() => setIsAddingGeneric(false)}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="adw-btn adw-btn-accent">
                        Connect Provider
                      </button>
                    </div>
                  </form>
                )}

                {/* Accounts List */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      style={{
                        background: "var(--card-bg)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--adw-radius-m)",
                        padding: "12px 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Cloud size={24} color="var(--active-accent)" />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{acc.name}</div>
                          <div style={{ fontSize: 11, color: "var(--dim-fg)" }}>
                            {acc.email || acc.provider_type} • Status: {acc.sync_status}
                          </div>
                          {acc.quota_total && (
                            <div style={{ fontSize: 11, color: "var(--dim-fg)", marginTop: 2 }}>
                              {formatBytes(acc.quota_used || 0)} of {formatBytes(acc.quota_total)} used
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: "var(--adw-radius-s)",
                            background: "var(--hover-bg)",
                            textTransform: "capitalize",
                          }}
                        >
                          {acc.provider_type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
