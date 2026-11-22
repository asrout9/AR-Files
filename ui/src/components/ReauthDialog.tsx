import React, { useState, useEffect } from "react";
import {
  X,
  Key,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Eye,
  EyeOff,
  Cloud,
  ChevronDown,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { invokeCommand } from "../services/ipc";

export const ReauthDialog: React.FC = () => {
  const { reauthAccount, setReauthAccount, updateAccountCredentials, triggerSync } =
    useExplorerStore();

  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [showTokens, setShowTokens] = useState(false);
  const [loading, setLoading] = useState(false);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (reauthAccount) {
      setAccessToken("");
      setRefreshToken("");
      setErrorMsg(null);
      setLoading(false);
      setBrowserLoading(false);
    }
  }, [reauthAccount]);

  if (!reauthAccount) return null;

  const handleClose = () => {
    if (loading || browserLoading) return;
    setReauthAccount(null);
  };

  const openLink = async (url: string) => {
    try {
      await invokeCommand("open_file", { path: url });
    } catch {
      window.open(url, "_blank");
    }
  };

  // 1-Click Interactive Browser Re-authentication (Permanent connection with automatic background renewal)
  const handleBrowserReauth = async () => {
    setBrowserLoading(true);
    setErrorMsg(null);
    try {
      await updateAccountCredentials(reauthAccount.id, "browser");
      triggerSync(reauthAccount.id);
      setReauthAccount(null);
    } catch (err: any) {
      console.error("Browser re-auth failed:", err);
      setErrorMsg(
        err?.message ||
          "Browser authentication was cancelled or timed out. Please try again."
      );
    } finally {
      setBrowserLoading(false);
    }
  };

  // Manual fallback token submission
  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = accessToken.trim();
    if (!token) {
      setErrorMsg("Access token cannot be empty.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await updateAccountCredentials(
        reauthAccount.id,
        token,
        refreshToken.trim() || undefined
      );
      triggerSync(reauthAccount.id);
      setReauthAccount(null);
    } catch (err: any) {
      console.error("Failed to update credentials:", err);
      setErrorMsg(
        err?.message ||
          "Failed to update credentials. Please ensure the token is valid."
      );
    } finally {
      setLoading(false);
    }
  };

  const isGoogleDrive =
    reauthAccount.provider_type === "google_drive" ||
    reauthAccount.id.startsWith("acc_gdrive");
  const isOneDrive =
    reauthAccount.provider_type === "onedrive" ||
    (reauthAccount.provider_type as string) === "one_drive" ||
    reauthAccount.id.startsWith("acc_onedrive");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2400,
      }}
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauth-dialog-title"
        style={{
          width: 540,
          maxWidth: "92vw",
          maxHeight: "88vh",
          backgroundColor: "var(--popover-bg)",
          borderRadius: "var(--adw-radius-l)",
          boxShadow: "var(--popover-shadow)",
          border: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
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
            <Key size={18} color="var(--active-accent)" />
            <h3
              id="reauth-dialog-title"
              style={{ margin: 0, fontSize: 15, fontWeight: 600 }}
            >
              Reconnect Cloud Storage
            </h3>
          </div>
          <button
            type="button"
            className="adw-btn adw-btn-icon"
            title="Close"
            onClick={handleClose}
            disabled={loading || browserLoading}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
          {/* Account Info Pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: "var(--adw-radius-m)",
              backgroundColor: "var(--view-bg)",
              border: "1px solid var(--border-color)",
              marginBottom: 16,
            }}
          >
            <Cloud size={20} color="var(--active-accent)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {reauthAccount.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--dim-fg)" }}>
                {reauthAccount.email || reauthAccount.id}
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                backgroundColor: "rgba(245, 194, 17, 0.15)",
                color: "var(--adw-accent-yellow, #f5c211)",
                fontWeight: 600,
              }}
            >
              Re-authentication Required
            </span>
          </div>

          {errorMsg && (
            <div
              style={{
                backgroundColor: "rgba(224, 27, 36, 0.15)",
                border: "1px solid var(--state-error)",
                color: "var(--state-error)",
                borderRadius: "var(--adw-radius-m)",
                padding: "10px 14px",
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* PRIMARY OPTION FOR GOOGLE DRIVE & ONEDRIVE: 1-Click Browser Login */}
          {(isGoogleDrive || isOneDrive) && (
            <div
              style={{
                backgroundColor: "rgba(53, 132, 228, 0.08)",
                border: "1px solid rgba(53, 132, 228, 0.25)",
                borderRadius: "var(--adw-radius-m)",
                padding: "20px",
                marginBottom: 18,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  color: "var(--window-fg)",
                }}
              >
                <ShieldCheck size={20} color="var(--active-accent)" />
                <span>1-Click Sign-In (Permanent Connection)</span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "var(--dim-fg)",
                  maxWidth: 440,
                }}
              >
                Click below to sign in with your {isOneDrive ? "Microsoft" : "Google"} Account in your web browser.
                AR Files will automatically save a <strong>permanent Refresh Token</strong>{" "}
                in your GNOME Keyring and silently renew access in the background.{" "}
                <strong>You will never have to copy or paste tokens again.</strong>
              </p>
              <button
                type="button"
                className="adw-btn adw-btn-pill adw-btn-suggested"
                disabled={browserLoading || loading}
                onClick={handleBrowserReauth}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 24px",
                  fontSize: 13,
                  fontWeight: 600,
                  backgroundColor: "var(--active-accent)",
                  color: "#ffffff",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(53, 132, 228, 0.35)",
                }}
              >
                {browserLoading ? (
                  <RefreshCw size={15} className="adw-spin" />
                ) : (
                  <ExternalLink size={15} />
                )}
                <span>
                  {browserLoading
                    ? "Waiting for browser authorization..."
                    : isOneDrive
                    ? "Sign In with Microsoft in Browser"
                    : "Sign In with Google in Browser"}
                </span>
              </button>
            </div>
          )}

          {/* FALLBACK MANUAL FORM (Collapsed for Google Drive & OneDrive) */}
          {(isGoogleDrive || isOneDrive) ? (
            <details style={{ fontSize: 12, color: "var(--dim-fg)" }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontWeight: 600,
                  color: "var(--dim-fg)",
                  marginBottom: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <ChevronDown size={14} />
                <span>Or paste manual tokens (Advanced Fallback)</span>
              </summary>
              <form
                onSubmit={handleManualSave}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  padding: "12px",
                  borderRadius: "var(--adw-radius-m)",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--view-bg)",
                }}
              >
                {isOneDrive && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: "var(--dim-fg)",
                      marginBottom: 4,
                    }}
                  >
                    <span>Tokens from Microsoft Graph Explorer:</span>
                    <button
                      type="button"
                      onClick={() =>
                        openLink("https://developer.microsoft.com/en-us/graph/graph-explorer")
                      }
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--active-accent)",
                        cursor: "pointer",
                        fontSize: 11,
                        padding: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      Graph Explorer <ExternalLink size={10} />
                    </button>
                  </div>
                )}
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--dim-fg)" }}>
                      ACCESS TOKEN
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowTokens(!showTokens)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--dim-fg)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        padding: 0,
                      }}
                    >
                      {showTokens ? <EyeOff size={12} /> : <Eye size={12} />}
                      <span>{showTokens ? "Hide" : "Show"}</span>
                    </button>
                  </div>
                  <input
                    type={showTokens ? "text" : "password"}
                    required
                    placeholder="ya29.a0..."
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    style={{
                      width: "100%",
                      height: 34,
                      padding: "0 10px",
                      borderRadius: "var(--adw-radius-s)",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--popover-bg)",
                      color: "var(--window-fg)",
                      outline: "none",
                      fontSize: 12,
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--dim-fg)",
                      marginBottom: 6,
                    }}
                  >
                    REFRESH TOKEN (OPTIONAL)
                  </label>
                  <input
                    type={showTokens ? "text" : "password"}
                    placeholder="1//0... (Enables auto-refresh)"
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                    style={{
                      width: "100%",
                      height: 34,
                      padding: "0 10px",
                      borderRadius: "var(--adw-radius-s)",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--popover-bg)",
                      color: "var(--window-fg)",
                      outline: "none",
                      fontSize: 12,
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                  <button
                    type="submit"
                    className="adw-btn adw-btn-pill adw-btn-suggested"
                    disabled={loading || !accessToken.trim()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      padding: "6px 14px",
                    }}
                  >
                    {loading && <RefreshCw size={12} className="adw-spin" />}
                    <span>{loading ? "Saving..." : "Save Manual Token"}</span>
                  </button>
                </div>
              </form>
            </details>
          ) : (
            <form
              onSubmit={handleManualSave}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--dim-fg)",
                    marginBottom: 6,
                  }}
                >
                  NEW ACCESS TOKEN *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Paste fresh access token"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  style={{
                    width: "100%",
                    height: 38,
                    padding: "0 12px",
                    borderRadius: "var(--adw-radius-s)",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--view-bg)",
                    color: "var(--window-fg)",
                    outline: "none",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 8,
                }}
              >
                <button
                  type="button"
                  className="adw-btn adw-btn-pill"
                  onClick={handleClose}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="adw-btn adw-btn-pill adw-btn-suggested"
                  disabled={loading || !accessToken.trim()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: "var(--active-accent)",
                    color: "#ffffff",
                    fontWeight: 600,
                  }}
                >
                  {loading && <RefreshCw size={14} className="adw-spin" />}
                  <span>{loading ? "Reconnecting..." : "Save Token"}</span>
                </button>
              </div>
            </form>
          )}

          {(isGoogleDrive || isOneDrive) && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 12,
              }}
            >
              <button
                type="button"
                className="adw-btn adw-btn-pill"
                onClick={handleClose}
                disabled={browserLoading || loading}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
