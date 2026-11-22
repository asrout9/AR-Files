import React, { useState, useEffect } from "react";
import {
  X,
  AppWindow,
  Search,
  Terminal,
  Check,
  ExternalLink,
} from "lucide-react";
import { EntryRecord, DesktopApp } from "../types";
import { invokeCommand } from "../services/ipc";
import { useExplorerStore } from "../store/useExplorerStore";

interface OpenWithModalProps {
  entry: EntryRecord | null;
  onClose: () => void;
}

export const OpenWithModal: React.FC<OpenWithModalProps> = ({ entry, onClose }) => {
  const { showToast } = useExplorerStore();

  const [recommended, setRecommended] = useState<DesktopApp[]>([]);
  const [others, setOthers] = useState<DesktopApp[]>([]);
  const [selectedApp, setSelectedApp] = useState<DesktopApp | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [customCommand, setCustomCommand] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!entry) return;

    let isMounted = true;
    setIsLoading(true);

    const loadApps = async () => {
      try {
        const filePath = entry.local_path || entry.path || entry.id;
        const res = await invokeCommand<{
          recommended: DesktopApp[];
          others: DesktopApp[];
          mime_type: string;
        }>("list_apps_for_file", {
          path: filePath,
          mime_type: entry.mime_type,
        });

        if (isMounted && res) {
          setRecommended(res.recommended || []);
          setOthers(res.others || []);
          if (res.recommended && res.recommended.length > 0) {
            setSelectedApp(res.recommended[0]);
          }
        }
      } catch (err) {
        console.error("Failed to list apps for file:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadApps();

    return () => {
      isMounted = false;
    };
  }, [entry]);

  if (!entry) return null;

  const filePath = entry.local_path || entry.path || entry.id;

  const handleLaunch = async () => {
    try {
      if (useCustom) {
        if (!customCommand.trim()) return;
        await invokeCommand("open_file_with", {
          path: filePath,
          custom_command: customCommand.trim(),
        });
        showToast(`Opened with "${customCommand.trim()}"`);
      } else if (selectedApp) {
        await invokeCommand("open_file_with", {
          path: filePath,
          app_id: selectedApp.id,
        });
        showToast(`Opened with ${selectedApp.name}`);
      } else {
        return;
      }
      onClose();
    } catch (err: any) {
      showToast(err.message || "Failed to open file with selected application");
    }
  };

  const filteredRecommended = recommended.filter((app) =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (app.description && app.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredOthers = others.filter((app) =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (app.description && app.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2200,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-with-title"
        style={{
          width: 540,
          maxWidth: "92vw",
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
            padding: "14px 18px",
            background: "var(--headerbar-bg)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <AppWindow size={18} color="var(--active-accent)" />
            <div style={{ minWidth: 0 }}>
              <h3 id="open-with-title" style={{ fontSize: 15, fontWeight: 600 }}>
                Open With...
              </h3>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--dim-fg)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 380,
                }}
              >
                {entry.name}
              </div>
            </div>
          </div>
          <button
            className="adw-btn adw-btn-icon"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Bar */}
        <div
          style={{
            padding: "10px 18px",
            borderBottom: "1px solid var(--border-color)",
            background: "var(--view-bg)",
          }}
        >
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 10,
                color: "var(--dim-fg)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Search installed applications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                height: 32,
                borderRadius: "var(--adw-radius-s)",
                border: "1px solid var(--border-color)",
                paddingLeft: 32,
                paddingRight: 10,
                background: "var(--card-bg)",
                color: "var(--window-fg)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Apps List Viewport */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                color: "var(--dim-fg)",
                fontSize: 13,
                gap: 8,
                padding: "40px 0",
              }}
            >
              <span>Scanning system desktop applications...</span>
            </div>
          ) : (
            <>
              {/* Recommended Applications */}
              {filteredRecommended.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--dim-fg)",
                      textTransform: "uppercase",
                      padding: "4px 8px 6px",
                    }}
                  >
                    Recommended Applications
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {filteredRecommended.map((app) => {
                      const isSel = !useCustom && selectedApp?.id === app.id;
                      return (
                        <button
                          key={app.id}
                          type="button"
                          className="adw-sidebar-item"
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            borderRadius: "var(--adw-radius-s)",
                            border: isSel
                              ? "1px solid var(--adw-accent-blue)"
                              : "1px solid transparent",
                            background: isSel
                              ? "var(--selected-bg)"
                              : "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          onClick={() => {
                            setSelectedApp(app);
                            setUseCustom(false);
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <AppWindow size={18} color="var(--adw-accent-blue)" />
                            <div>
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: 13,
                                  color: isSel
                                    ? "var(--selected-fg)"
                                    : "var(--window-fg)",
                                }}
                              >
                                {app.name}
                              </div>
                              {app.description && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: "var(--dim-fg)",
                                    maxWidth: 380,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {app.description}
                                </div>
                              )}
                            </div>
                          </div>
                          {isSel && (
                            <Check size={16} color="var(--adw-accent-blue)" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Other Applications */}
              {filteredOthers.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--dim-fg)",
                      textTransform: "uppercase",
                      padding: "8px 8px 6px",
                    }}
                  >
                    Other Applications ({filteredOthers.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {filteredOthers.map((app) => {
                      const isSel = !useCustom && selectedApp?.id === app.id;
                      return (
                        <button
                          key={app.id}
                          type="button"
                          className="adw-sidebar-item"
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "7px 12px",
                            borderRadius: "var(--adw-radius-s)",
                            border: isSel
                              ? "1px solid var(--adw-accent-blue)"
                              : "1px solid transparent",
                            background: isSel
                              ? "var(--selected-bg)"
                              : "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          onClick={() => {
                            setSelectedApp(app);
                            setUseCustom(false);
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <AppWindow size={16} color="var(--dim-fg)" />
                            <div>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: isSel ? 600 : 400,
                                  color: isSel
                                    ? "var(--selected-fg)"
                                    : "var(--window-fg)",
                                }}
                              >
                                {app.name}
                              </div>
                            </div>
                          </div>
                          {isSel && (
                            <Check size={16} color="var(--adw-accent-blue)" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredRecommended.length === 0 && filteredOthers.length === 0 && (
                <div
                  style={{
                    padding: "30px 0",
                    textAlign: "center",
                    color: "var(--dim-fg)",
                    fontSize: 13,
                  }}
                >
                  No applications matched "{searchQuery}"
                </div>
              )}

              {/* Custom Command Section */}
              <div
                style={{
                  marginTop: 8,
                  padding: "10px 12px",
                  background: "var(--card-bg)",
                  borderRadius: "var(--adw-radius-m)",
                  border: useCustom
                    ? "1px solid var(--adw-accent-blue)"
                    : "1px solid var(--border-color)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    cursor: "pointer",
                  }}
                  onClick={() => setUseCustom(true)}
                >
                  <Terminal size={15} color="var(--dim-fg)" />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    Use Custom Command or Binary
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. code, gedit, vlc, mpv"
                  value={customCommand}
                  onFocus={() => setUseCustom(true)}
                  onChange={(e) => {
                    setCustomCommand(e.target.value);
                    setUseCustom(true);
                  }}
                  style={{
                    width: "100%",
                    height: 32,
                    borderRadius: "var(--adw-radius-s)",
                    border: "1px solid var(--border-color)",
                    padding: "0 10px",
                    background: "var(--view-bg)",
                    color: "var(--window-fg)",
                    fontSize: 13,
                    fontFamily: "var(--adw-font-mono)",
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            padding: "12px 18px",
            background: "var(--headerbar-bg)",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <button type="button" className="adw-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="adw-btn adw-btn-accent"
            disabled={!useCustom && !selectedApp}
            onClick={handleLaunch}
            style={{ padding: "0 18px" }}
          >
            <ExternalLink size={14} style={{ marginRight: 6 }} />
            Open
          </button>
        </div>
      </div>
    </div>
  );
};
