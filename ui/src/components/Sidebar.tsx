import React, { useState, useEffect } from "react";
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
  Plus,
  ExternalLink,
  FolderSymlink,
  Key,
  Folder,
  Trash,
  Usb,
  Disc,
  Terminal,
  Copy,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { AccountRecord, AccountSyncStatus, SystemDevice } from "../types";
import { getTranslation, TranslationDict } from "../i18n";
import { invokeCommand } from "../services/ipc";

const EjectIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = "currentColor" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 4 4 15 20 15 12 4" />
    <line x1="4" y1="20" x2="20" y2="20" />
  </svg>
);

const formatBytes = (bytes?: number | null) => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes < 0) return "";
  if (bytes >= 1024 * 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
};

export interface PlaceItem {
  id: string;
  path: string;
  name: string;
  iconType:
    | "home"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos"
    | "trash"
    | "folder";
  isCustom?: boolean;
}

export const Sidebar: React.FC = () => {
  const {
    accounts,
    currentAccountId,
    currentFolderId,
    navigateTo,
    openNewTab,
    toggleAccountOffline,
    triggerSync,
    removeAccount,
    mountAccountVfs,
    unmountAccountVfs,
    accountMountPaths,
    pendingUploadsCount,
    language,
    setAddCloudOpen,
    setReauthAccount,
    showToast,
  } = useExplorerStore();

  const [accountContextMenu, setAccountContextMenu] = useState<{
    account: AccountRecord;
    x: number;
    y: number;
  } | null>(null);

  const [accountToRemove, setAccountToRemove] = useState<AccountRecord | null>(null);

  const [systemDevices, setSystemDevices] = useState<SystemDevice[]>([
    {
      id: "dev_root",
      name: "Fedora Linux (/)",
      mount_path: "/",
      device_type: "root",
      is_removable: false,
      is_mounted: true,
      can_unmount: false,
      can_eject: false,
    },
  ]);

  const [deviceContextMenu, setDeviceContextMenu] = useState<{
    device: SystemDevice;
    x: number;
    y: number;
  } | null>(null);

  const loadDevices = async () => {
    try {
      const res = await invokeCommand<{ devices: SystemDevice[] }>("list_system_devices");
      if (res && Array.isArray(res.devices) && res.devices.length > 0) {
        setSystemDevices(res.devices);
      }
    } catch (e) {
      console.warn("Failed to load system devices", e);
    }
  };

  useEffect(() => {
    loadDevices();
    const handleDevicesChanged = () => {
      loadDevices();
    };
    window.addEventListener("ar-devices-changed", handleDevicesChanged);
    const interval = setInterval(loadDevices, 4000);
    return () => {
      window.removeEventListener("ar-devices-changed", handleDevicesChanged);
      clearInterval(interval);
    };
  }, []);

  const handleUnmountDevice = async (device: SystemDevice) => {
    try {
      showToast(`Unmounting ${device.name}...`);
      await invokeCommand("unmount_device", {
        mount_path: device.mount_path,
        device_node: device.device_node,
      });
      showToast(`Successfully unmounted ${device.name}`);
      if (currentFolderId && (currentFolderId === device.mount_path || currentFolderId.startsWith(device.mount_path + "/"))) {
        navigateTo(null, userHome, "Home", true);
      }
      loadDevices();
    } catch (err: any) {
      showToast(`Failed to unmount ${device.name}: ${err?.message || err}`);
    }
  };

  const handleEjectDevice = async (device: SystemDevice) => {
    try {
      showToast(`Ejecting ${device.name}...`);
      await invokeCommand("eject_device", {
        mount_path: device.mount_path,
        device_node: device.device_node,
      });
      showToast(`Safely removed ${device.name}`);
      if (currentFolderId && (currentFolderId === device.mount_path || currentFolderId.startsWith(device.mount_path + "/"))) {
        navigateTo(null, userHome, "Home", true);
      }
      loadDevices();
    } catch (err: any) {
      showToast(`Failed to eject ${device.name}: ${err?.message || err}`);
    }
  };

  const handleMountDevice = async (device: SystemDevice) => {
    try {
      showToast(`Mounting ${device.name}...`);
      await invokeCommand("mount_device", {
        device_node: device.device_node,
        device_id: device.id,
      });
      showToast(`Successfully mounted ${device.name}`);
      loadDevices();
    } catch (err: any) {
      showToast(`Failed to mount ${device.name}: ${err?.message || err}`);
    }
  };

  const t = (k: keyof TranslationDict) => getTranslation(k, language);

  const userHome =
    typeof window !== "undefined" && (window as any).__USER_HOME__
      ? (window as any).__USER_HOME__
      : "/home/abhi";

  const getDefaultPlaces = (): PlaceItem[] => [
    { id: "place_home", path: userHome, name: t("home"), iconType: "home" },
    {
      id: "place_documents",
      path: `${userHome}/Documents`,
      name: t("documents"),
      iconType: "documents",
    },
    {
      id: "place_downloads",
      path: `${userHome}/Downloads`,
      name: t("downloads"),
      iconType: "downloads",
    },
    { id: "place_music", path: `${userHome}/Music`, name: "Music", iconType: "music" },
    {
      id: "place_pictures",
      path: `${userHome}/Pictures`,
      name: t("pictures"),
      iconType: "pictures",
    },
    { id: "place_videos", path: `${userHome}/Videos`, name: "Videos", iconType: "videos" },
    {
      id: "place_trash",
      path: `${userHome}/.local/share/Trash/files`,
      name: t("trash"),
      iconType: "trash",
    },
  ];

  const [places, setPlaces] = useState<PlaceItem[]>(() => {
    try {
      const stored = localStorage.getItem("ar_files_sidebar_places");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Failed to parse stored places", e);
    }
    return getDefaultPlaces();
  });

  const [dropTarget, setDropTarget] = useState<{
    index: number;
    position: "above" | "below";
  } | null>(null);

  const [placeContextMenu, setPlaceContextMenu] = useState<{
    place: PlaceItem;
    x: number;
    y: number;
  } | null>(null);

  const savePlaces = (newPlaces: PlaceItem[]) => {
    setPlaces(newPlaces);
    try {
      localStorage.setItem("ar_files_sidebar_places", JSON.stringify(newPlaces));
    } catch (e) {
      console.warn("Failed to persist places", e);
    }
  };

  const handleDropOnPlace = (
    e: React.DragEvent,
    targetIdx: number,
    position: "above" | "below"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    try {
      let folderPath = "";
      let folderName = "";

      const jsonStr = e.dataTransfer.getData("application/json");
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        if (parsed.type === "ar-place-reorder") {
          const fromIdx = parsed.fromIndex;
          let insertIdx = position === "above" ? targetIdx : targetIdx + 1;
          if (fromIdx < insertIdx) insertIdx -= 1;
          if (fromIdx === insertIdx) return;

          const reordered = [...places];
          const [moved] = reordered.splice(fromIdx, 1);
          reordered.splice(insertIdx, 0, moved);
          savePlaces(reordered);
          showToast(`Moved "${moved.name}"`);
          return;
        }

        folderPath = parsed.path;
        folderName = parsed.name;
      } else {
        folderPath = e.dataTransfer.getData("text/plain");
        folderName = folderPath.split("/").filter(Boolean).pop() || "Folder";
      }

      if (!folderPath) return;

      // If already bookmarked, reorder it
      const existingIdx = places.findIndex((p) => p.path === folderPath);
      if (existingIdx !== -1) {
        let insertIdx = position === "above" ? targetIdx : targetIdx + 1;
        if (existingIdx < insertIdx) insertIdx -= 1;
        const reordered = [...places];
        const [moved] = reordered.splice(existingIdx, 1);
        reordered.splice(insertIdx, 0, moved);
        savePlaces(reordered);
        showToast(`Moved "${moved.name}"`);
        return;
      }

      // Add as new custom place
      const newPlace: PlaceItem = {
        id: `place_custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        path: folderPath,
        name: folderName,
        iconType: "folder",
        isCustom: true,
      };

      const insertIdx = position === "above" ? targetIdx : targetIdx + 1;
      const updated = [...places];
      updated.splice(insertIdx, 0, newPlace);
      savePlaces(updated);
      showToast(`Added "${folderName}" to Places`);
    } catch (err) {
      console.error("Drop folder to place failed", err);
    }
  };

  const removePlace = (id: string) => {
    const target = places.find((p) => p.id === id);
    const updated = places.filter((p) => p.id !== id);
    savePlaces(updated);
    if (target) {
      showToast(`Removed "${target.name}" from Places`);
    }
  };

  const renderPlaceIcon = (iconType: string) => {
    switch (iconType) {
      case "home":
        return <Home size={16} />;
      case "documents":
        return <FileText size={16} />;
      case "downloads":
        return <Download size={16} />;
      case "music":
        return <Music size={16} />;
      case "pictures":
        return <ImageIcon size={16} />;
      case "videos":
        return <Video size={16} />;
      case "trash":
        return <Trash2 size={16} />;
      default:
        return <Folder size={16} color="var(--adw-accent-blue)" />;
    }
  };

  const renderDropIndicator = (key: string) => (
    <div
      key={key}
      style={{
        height: 3,
        background: "var(--adw-accent-blue)",
        borderRadius: 2,
        margin: "3px 8px",
        boxShadow: "0 0 8px var(--adw-accent-blue)",
        position: "relative",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -4,
          top: -3,
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: "var(--adw-accent-blue)",
          boxShadow: "0 0 6px var(--adw-accent-blue)",
        }}
      />
    </div>
  );

  const formatQuota = (used?: number | null, total?: number | null) => {
    if (total === undefined || total === null || total <= 0) return "";
    const u = used || 0;
    if (total >= 1024 * 1024 * 1024 * 1024) {
      const usedGb = (u / (1024 * 1024 * 1024)).toFixed(1);
      const totalTb = (total / (1024 * 1024 * 1024 * 1024)).toFixed(1);
      return `${usedGb} GB of ${totalTb} TB`;
    }
    const usedGb = (u / (1024 * 1024 * 1024)).toFixed(1);
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
    <aside className="adw-sidebar" role="navigation" aria-label="Sidebar navigation">
      {/* Places Section */}
      <div
        className="adw-sidebar-section"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          if (places.length > 0) {
            handleDropOnPlace(e, places.length - 1, "below");
          }
        }}
      >
        <span className="adw-sidebar-heading">{t("places")}</span>
        {places.map((place, idx) => {
          const isActive =
            currentAccountId === null &&
            (currentFolderId === place.path ||
              (!currentFolderId && place.path === userHome));

          return (
            <React.Fragment key={place.id}>
              {dropTarget?.index === idx &&
                dropTarget.position === "above" &&
                renderDropIndicator(`drop_above_${place.id}`)}

              <div
                role="button"
                tabIndex={0}
                aria-label={place.name}
                className={`adw-sidebar-item ${isActive ? "active" : ""}`}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/json",
                    JSON.stringify({ type: "ar-place-reorder", fromIndex: idx })
                  );
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "copy";
                  const rect = e.currentTarget.getBoundingClientRect();
                  const midY = rect.top + rect.height / 2;
                  const position = e.clientY < midY ? "above" : "below";
                  setDropTarget({ index: idx, position });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropTarget((prev) => (prev?.index === idx ? null : prev));
                  }
                }}
                onDrop={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const midY = rect.top + rect.height / 2;
                  const position = e.clientY < midY ? "above" : "below";
                  handleDropOnPlace(e, idx, position);
                }}
                onClick={() => navigateTo(null, place.path, place.name, true)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPlaceContextMenu({ place, x: e.clientX, y: e.clientY });
                }}
              >
                {renderPlaceIcon(place.iconType)}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {place.name}
                </span>
              </div>

              {dropTarget?.index === idx &&
                dropTarget.position === "below" &&
                renderDropIndicator(`drop_below_${place.id}`)}
            </React.Fragment>
          );
        })}
      </div>

      {/* Cloud Drives & Accounts Section */}
      <div className="adw-sidebar-section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 6 }}>
          <span className="adw-sidebar-heading">{t("cloudStorage")}</span>
          <button
            className="adw-btn adw-btn-icon"
            aria-label="Add Cloud Storage"
            style={{ width: 22, height: 22, border: "none", background: "none" }}
            title="Add Cloud Storage Account"
            onClick={() => setAddCloudOpen(true)}
          >
            <Plus size={14} />
          </button>
        </div>

        {accounts.map((account) => {
          const isActive = currentAccountId === account.id && currentFolderId === null;
          const used = account.quota_used || 0;
          const total = account.quota_total || 1;
          const rawPercent = account.quota_total ? (used / total) * 100 : 0;
          const barWidth = used > 0 ? Math.max(2, Math.min(100, Math.round(rawPercent) || Number(rawPercent.toFixed(1)))) : 0;
          const isOffline = account.sync_status === "offline";

          return (
            <div
              key={account.id}
              className={`adw-sidebar-item ${isActive ? "active" : ""}`}
              style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}
              onClick={() => navigateTo(account.id, null, account.name, true)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setAccountContextMenu({
                  account,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
            >
              <div style={{ display: "flex", alignItems: "center", width: "100%", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Cloud size={16} color="var(--adw-accent-blue)" />
                  <span>{account.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    className="adw-btn adw-btn-icon"
                    style={{ width: 20, height: 20, border: "none", background: "none", padding: 0 }}
                    title={isOffline ? "Go Online" : "Work Offline"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAccountOffline(account.id);
                    }}
                  >
                    {isOffline ? <CloudOff size={13} color="var(--dim-fg)" /> : <Cloud size={13} color="var(--state-available)" />}
                  </button>
                  <button
                    className="adw-btn adw-btn-icon"
                    style={{ width: 20, height: 20, border: "none", background: "none", padding: 0 }}
                    title={
                      account.sync_status === "error" || account.sync_status === "action_required"
                        ? "Update Credentials / Re-authenticate"
                        : "Sync Now"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (account.sync_status === "error" || account.sync_status === "action_required") {
                        setReauthAccount(account);
                      } else {
                        triggerSync(account.id);
                      }
                    }}
                  >
                    {getSyncIcon(account.sync_status) || <RefreshCw size={12} color="var(--dim-fg)" />}
                  </button>
                </div>
              </div>

              {/* Offline / Pending uploads banner */}
              {isOffline && (
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--dim-fg)",
                    background: "rgba(255, 255, 255, 0.05)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    width: "100%",
                  }}
                >
                  Offline {pendingUploadsCount > 0 ? `• ${pendingUploadsCount} pending` : ""}
                </div>
              )}

              {/* Quota Bar */}
              {account.quota_total ? (
                <div style={{ width: "100%", marginTop: 4 }}>
                  <div
                    style={{
                      height: 5,
                      width: "100%",
                      backgroundColor: "rgba(128, 128, 128, 0.22)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${barWidth}%`,
                        backgroundColor: rawPercent > 90 ? "var(--state-error)" : "var(--adw-accent-blue)",
                        borderRadius: 3,
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
        {systemDevices.map((device) => {
          const isActive =
            currentAccountId === null &&
            ((device.mount_path === "/" && (currentFolderId === "/" || currentFolderId === "")) ||
              (Boolean(device.mount_path) && device.mount_path !== "/" && currentFolderId === device.mount_path));

          const freeFormatted = device.free_bytes ? formatBytes(device.free_bytes) : "";
          const totalFormatted = device.total_bytes ? formatBytes(device.total_bytes) : "";
          const tooltip = device.is_mounted
            ? `${device.name} • ${device.mount_path}${freeFormatted ? ` (${freeFormatted} free of ${totalFormatted})` : ""}`
            : `${device.name} (Not mounted - click to mount)`;

          return (
            <div
              key={device.id}
              role="button"
              tabIndex={0}
              aria-label={device.name}
              title={tooltip}
              className={`adw-sidebar-item ${isActive ? "active" : ""}`}
              style={{ justifyContent: "space-between" }}
              onClick={() => {
                if (device.is_mounted && device.mount_path) {
                  navigateTo(null, device.mount_path, device.name, true);
                } else {
                  handleMountDevice(device);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDeviceContextMenu({ device, x: e.clientX, y: e.clientY });
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden", flex: 1 }}>
                {device.device_type === "removable" ? (
                  <Usb size={16} color="var(--adw-accent-blue)" />
                ) : device.device_type === "optical" ? (
                  <Disc size={16} color="var(--dim-fg)" />
                ) : (
                  <HardDrive size={16} />
                )}
                <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {device.name}
                  </span>
                  {device.is_mounted && freeFormatted ? (
                    <span style={{ fontSize: 10, color: "var(--dim-fg)", whiteSpace: "nowrap" }}>
                      {freeFormatted} free
                    </span>
                  ) : !device.is_mounted ? (
                    <span style={{ fontSize: 10, color: "var(--dim-fg)", fontStyle: "italic" }}>
                      Unmounted
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Action button (Unmount/Eject) */}
              {device.is_mounted && (device.can_unmount || device.can_eject || device.is_removable) && (
                <button
                  className="adw-btn adw-btn-icon"
                  style={{
                    width: 22,
                    height: 22,
                    minWidth: 22,
                    border: "none",
                    background: "none",
                    padding: 0,
                    opacity: 0.7,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title={device.can_eject ? "Eject device" : "Unmount device"}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnmountDevice(device);
                  }}
                >
                  <EjectIcon size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Places Right-Click Context Menu */}
      {placeContextMenu && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 900,
            }}
            onClick={() => setPlaceContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setPlaceContextMenu(null);
            }}
          />
          <div
            role="menu"
            aria-label="Place context menu"
            style={{
              position: "fixed",
              top: placeContextMenu.y,
              left: placeContextMenu.x,
              zIndex: 901,
              backgroundColor: "var(--popover-bg)",
              borderRadius: "var(--adw-radius-m)",
              boxShadow: "var(--popover-shadow)",
              padding: "6px 0",
              minWidth: 180,
              border: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <button
              role="menuitem"
              className="adw-sidebar-item"
              style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
              onClick={() => {
                navigateTo(null, placeContextMenu.place.path, placeContextMenu.place.name, true);
                setPlaceContextMenu(null);
              }}
            >
              <ExternalLink size={15} />
              <span>Open</span>
            </button>

            <button
              role="menuitem"
              className="adw-sidebar-item"
              style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
              onClick={() => {
                openNewTab(null, placeContextMenu.place.path, placeContextMenu.place.name);
                setPlaceContextMenu(null);
              }}
            >
              <ExternalLink size={15} />
              <span>Open in New Tab</span>
            </button>

            {placeContextMenu.place.isCustom && (
              <>
                <div style={{ height: 1, backgroundColor: "var(--border-color)", margin: "4px 0" }} />
                <button
                  role="menuitem"
                  className="adw-sidebar-item"
                  style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
                  onClick={() => {
                    removePlace(placeContextMenu.place.id);
                    setPlaceContextMenu(null);
                  }}
                >
                  <Trash size={15} color="var(--state-error)" />
                  <span style={{ color: "var(--state-error)" }}>Remove from Places</span>
                </button>
              </>
            )}

            <div style={{ height: 1, backgroundColor: "var(--border-color)", margin: "4px 0" }} />
            <button
              role="menuitem"
              className="adw-sidebar-item"
              style={{ borderRadius: 0, border: "none", background: "none", width: "100%", fontSize: 12, color: "var(--dim-fg)" }}
              onClick={() => {
                savePlaces(getDefaultPlaces());
                showToast("Reset Places to defaults");
                setPlaceContextMenu(null);
              }}
            >
              <span>Reset Default Places</span>
            </button>
          </div>
        </>
      )}

      {/* Cloud Account Right-Click Context Menu */}
      {accountContextMenu && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 900,
            }}
            onClick={() => setAccountContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setAccountContextMenu(null);
            }}
          />
          <div
            role="menu"
            aria-label="Cloud drive context menu"
            style={{
              position: "fixed",
              top: accountContextMenu.y,
              left: accountContextMenu.x,
              zIndex: 901,
              backgroundColor: "var(--popover-bg)",
              borderRadius: "var(--adw-radius-m)",
              boxShadow: "var(--popover-shadow)",
              padding: "6px 0",
              minWidth: 200,
              border: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Open in New Tab */}
            <button
              role="menuitem"
              className="adw-sidebar-item"
              style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
              onClick={() => {
                openNewTab(accountContextMenu.account.id, null, accountContextMenu.account.name);
                setAccountContextMenu(null);
              }}
            >
              <ExternalLink size={15} />
              <span>Open in New Tab</span>
            </button>

            {/* Sync Now */}
            <button
              role="menuitem"
              className="adw-sidebar-item"
              style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
              onClick={() => {
                triggerSync(accountContextMenu.account.id);
                setAccountContextMenu(null);
              }}
            >
              <RefreshCw size={15} />
              <span>Sync Now</span>
            </button>

            {/* Work Offline / Go Online */}
            <button
              role="menuitem"
              className="adw-sidebar-item"
              style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
              onClick={() => {
                toggleAccountOffline(accountContextMenu.account.id);
                setAccountContextMenu(null);
              }}
            >
              {accountContextMenu.account.sync_status === "offline" ? (
                <>
                  <Cloud size={15} color="var(--state-available)" />
                  <span>Go Online</span>
                </>
              ) : (
                <>
                  <CloudOff size={15} color="var(--dim-fg)" />
                  <span>Work Offline</span>
                </>
              )}
            </button>

            {/* Mount / Unmount VFS */}
            {accountMountPaths[accountContextMenu.account.id] || accountContextMenu.account.mount_path ? (
              <button
                role="menuitem"
                className="adw-sidebar-item"
                style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
                onClick={() => {
                  unmountAccountVfs(accountContextMenu.account.id);
                  setAccountContextMenu(null);
                }}
              >
                <FolderSymlink size={15} />
                <span>Unmount Drive</span>
              </button>
            ) : (
              <button
                role="menuitem"
                className="adw-sidebar-item"
                style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
                onClick={() => {
                  mountAccountVfs(accountContextMenu.account.id);
                  setAccountContextMenu(null);
                }}
              >
                <FolderSymlink size={15} />
                <span>Mount Drive (FUSE)</span>
              </button>
            )}

            {/* Update Credentials */}
            <button
              role="menuitem"
              className="adw-sidebar-item"
              style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
              onClick={() => {
                setReauthAccount(accountContextMenu.account);
                setAccountContextMenu(null);
              }}
            >
              <Key size={15} color="var(--active-accent)" />
              <span>Update Credentials</span>
            </button>

            <div style={{ height: 1, backgroundColor: "var(--border-color)", margin: "4px 0" }} />

            {/* Remove Cloud Storage */}
            <button
              role="menuitem"
              className="adw-sidebar-item"
              style={{
                borderRadius: 0,
                border: "none",
                background: "none",
                width: "100%",
                color: "var(--state-error)",
              }}
              onClick={() => {
                setAccountToRemove(accountContextMenu.account);
                setAccountContextMenu(null);
              }}
            >
              <Trash2 size={15} color="var(--state-error)" />
              <span style={{ color: "var(--state-error)", fontWeight: 500 }}>Remove Drive</span>
            </button>
          </div>
        </>
      )}

      {/* Device Right-Click Context Menu */}
      {deviceContextMenu && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 900,
            }}
            onClick={() => setDeviceContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setDeviceContextMenu(null);
            }}
          />
          <div
            role="menu"
            aria-label="Device context menu"
            style={{
              position: "fixed",
              top: deviceContextMenu.y,
              left: deviceContextMenu.x,
              zIndex: 901,
              backgroundColor: "var(--popover-bg)",
              borderRadius: "var(--adw-radius-m)",
              boxShadow: "var(--popover-shadow)",
              padding: "6px 0",
              minWidth: 190,
              border: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {deviceContextMenu.device.is_mounted ? (
              <>
                <button
                  role="menuitem"
                  className="adw-sidebar-item"
                  style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
                  onClick={() => {
                    navigateTo(null, deviceContextMenu.device.mount_path, deviceContextMenu.device.name, true);
                    setDeviceContextMenu(null);
                  }}
                >
                  <ExternalLink size={15} />
                  <span>Open</span>
                </button>

                <button
                  role="menuitem"
                  className="adw-sidebar-item"
                  style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
                  onClick={() => {
                    openNewTab(null, deviceContextMenu.device.mount_path, deviceContextMenu.device.name);
                    setDeviceContextMenu(null);
                  }}
                >
                  <ExternalLink size={15} />
                  <span>Open in New Tab</span>
                </button>

                <button
                  role="menuitem"
                  className="adw-sidebar-item"
                  style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
                  onClick={() => {
                    invokeCommand("open_in_terminal", { path: deviceContextMenu.device.mount_path });
                    setDeviceContextMenu(null);
                  }}
                >
                  <Terminal size={15} />
                  <span>Open in Terminal</span>
                </button>

                <button
                  role="menuitem"
                  className="adw-sidebar-item"
                  style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
                  onClick={() => {
                    navigator.clipboard.writeText(deviceContextMenu.device.mount_path);
                    showToast("Mount path copied to clipboard");
                    setDeviceContextMenu(null);
                  }}
                >
                  <Copy size={15} />
                  <span>Copy Path</span>
                </button>
              </>
            ) : (
              <button
                role="menuitem"
                className="adw-sidebar-item"
                style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
                onClick={() => {
                  handleMountDevice(deviceContextMenu.device);
                  setDeviceContextMenu(null);
                }}
              >
                <HardDrive size={15} />
                <span>Mount Drive</span>
              </button>
            )}

            {/* Unmount or Eject */}
            {deviceContextMenu.device.is_mounted &&
              (deviceContextMenu.device.can_unmount || deviceContextMenu.device.is_removable) && (
                <>
                  <div style={{ height: 1, backgroundColor: "var(--border-color)", margin: "4px 0" }} />
                  <button
                    role="menuitem"
                    className="adw-sidebar-item"
                    style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
                    onClick={() => {
                      handleUnmountDevice(deviceContextMenu.device);
                      setDeviceContextMenu(null);
                    }}
                  >
                    <EjectIcon size={15} />
                    <span>Unmount</span>
                  </button>
                </>
              )}

            {deviceContextMenu.device.is_removable && (
              <button
                role="menuitem"
                className="adw-sidebar-item"
                style={{ borderRadius: 0, border: "none", background: "none", width: "100%" }}
                onClick={() => {
                  handleEjectDevice(deviceContextMenu.device);
                  setDeviceContextMenu(null);
                }}
              >
                <EjectIcon size={15} color="var(--state-error)" />
                <span style={{ color: "var(--state-error)" }}>Safely Remove / Eject</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Confirmation Dialog for Removing Cloud Storage */}
      {accountToRemove && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setAccountToRemove(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-drive-title"
            style={{
              backgroundColor: "var(--popover-bg)",
              borderRadius: "var(--adw-radius-l)",
              boxShadow: "var(--popover-shadow)",
              padding: 24,
              maxWidth: 420,
              width: "90%",
              border: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  backgroundColor: "rgba(224, 27, 36, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Trash2 size={20} color="var(--state-error)" />
              </div>
              <div>
                <h3 id="remove-drive-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                  Remove Cloud Drive
                </h3>
                <span style={{ fontSize: 13, color: "var(--dim-fg)" }}>
                  {accountToRemove.name} ({accountToRemove.provider_type})
                </span>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--window-fg)" }}>
              Are you sure you want to remove <strong>{accountToRemove.name}</strong>? Local cached files and placeholders for this drive will be disconnected from AR Files.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="adw-btn"
                onClick={() => setAccountToRemove(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="adw-btn"
                style={{
                  backgroundColor: "var(--state-error)",
                  color: "#ffffff",
                  fontWeight: 600,
                }}
                onClick={async () => {
                  await removeAccount(accountToRemove.id);
                  setAccountToRemove(null);
                }}
              >
                Remove Drive
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
