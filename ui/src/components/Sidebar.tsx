import React from "react";
import {
  Home,
  FileText,
  Download,
  Image as ImageIcon,
  Music,
  Video,
  Trash2,
  Cloud,
  HardDrive,
  RefreshCw,
  AlertCircle,
  CloudOff,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { AccountSyncStatus } from "../types";

export const Sidebar: React.FC = () => {
  const {
    accounts,
    currentAccountId,
    currentFolderId,
    navigateTo,
  } = useExplorerStore();

  const places = [
    { id: "place_home", name: "Home", icon: Home },
    { id: "place_docs", name: "Documents", icon: FileText },
    { id: "place_downloads", name: "Downloads", icon: Download },
    { id: "place_music", name: "Music", icon: Music },
    { id: "place_pictures", name: "Pictures", icon: ImageIcon },
    { id: "place_videos", name: "Videos", icon: Video },
    { id: "place_trash", name: "Trash", icon: Trash2 },
  ];

  const formatQuota = (used?: number | null, total?: number | null) => {
    if (!used || !total) return "";
    const usedGb = (used / (1024 * 1024 * 1024)).toFixed(1);
    const totalGb = (total / (1024 * 1024 * 1024)).toFixed(0);
    return `${usedGb} GB of ${totalGb} GB`;
  };

  const getSyncIcon = (status: AccountSyncStatus) => {
    switch (status) {
      case "syncing":
        return <RefreshCw size={12} style={{ animation: "spin 1.5s linear infinite" }} />;
      case "offline":
        return <CloudOff size={12} color="var(--dim-fg)" />;
      case "action_required":
      case "error":
        return <AlertCircle size={12} color="var(--state-error)" />;
      default:
        return null;
    }
  };

  return (
    <aside className="adw-sidebar">
      {/* Places Section */}
      <div className="adw-sidebar-section">
        <span className="adw-sidebar-heading">Places</span>
        {places.map((place) => {
          const Icon = place.icon;
          const isActive = currentAccountId === null && currentFolderId === place.id;
          return (
            <div
              key={place.id}
              className={`adw-sidebar-item ${isActive ? "active" : ""}`}
              onClick={() => navigateTo(null, place.id, place.name)}
            >
              <Icon size={16} />
              <span>{place.name}</span>
            </div>
          );
        })}
      </div>

      {/* Cloud Drives & Accounts Section */}
      <div className="adw-sidebar-section">
        <span className="adw-sidebar-heading">Cloud Drives</span>
        {accounts.map((account) => {
          const isActive = currentAccountId === account.id && currentFolderId === null;
          const used = account.quota_used || 0;
          const total = account.quota_total || 1;
          const percent = Math.min(100, Math.round((used / total) * 100));

          return (
            <div
              key={account.id}
              className={`adw-sidebar-item ${isActive ? "active" : ""}`}
              style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}
              onClick={() => navigateTo(account.id, null, account.name)}
            >
              <div style={{ display: "flex", alignItems: "center", width: "100%", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Cloud size={16} color="var(--adw-accent-blue)" />
                  <span>{account.name}</span>
                </div>
                {getSyncIcon(account.sync_status)}
              </div>

              {/* Quota Bar */}
              {account.quota_total ? (
                <div style={{ width: "100%", marginTop: 4 }}>
                  <div
                    style={{
                      height: 4,
                      width: "100%",
                      backgroundColor: "var(--border-color)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${percent}%`,
                        backgroundColor: percent > 90 ? "var(--state-error)" : "var(--adw-accent-blue)",
                        borderRadius: 2,
                      }}
                    />
                  </div>
                  <span
                    className="tabular-nums"
                    style={{ fontSize: 10, color: "var(--dim-fg)", display: "block", marginTop: 2 }}
                  >
                    {formatQuota(account.quota_used, account.quota_total)}
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Devices Section */}
      <div className="adw-sidebar-section">
        <span className="adw-sidebar-heading">Devices</span>
        <div className="adw-sidebar-item">
          <HardDrive size={16} />
          <span>Fedora System</span>
        </div>
      </div>
    </aside>
  );
};
