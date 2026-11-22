import React, { useState } from "react";
import {
  X,
  Cloud,
  Server,
  Globe,
  Database,
  Terminal,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  HardDrive,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";

export type CloudProviderId =
  | "google_drive"
  | "onedrive"
  | "nextcloud"
  | "webdav"
  | "s3"
  | "sftp";

interface ProviderDefinition {
  id: CloudProviderId;
  name: string;
  tagline: string;
  badge: string;
  color: string;
  icon: React.ReactNode;
}

const PROVIDERS: ProviderDefinition[] = [
  {
    id: "google_drive",
    name: "Google Drive",
    tagline: "Google Workspace & Personal Drive (OAuth 2.0 PKCE)",
    badge: "OAuth PKCE",
    color: "#3584e4",
    icon: <Cloud size={24} color="#3584e4" />,
  },
  {
    id: "onedrive",
    name: "Microsoft OneDrive",
    tagline: "Personal, School & Work accounts (Microsoft 365)",
    badge: "OneDrive API",
    color: "#1c71d8",
    icon: <Cloud size={24} color="#1c71d8" />,
  },
  {
    id: "nextcloud",
    name: "Nextcloud",
    tagline: "Self-hosted files, calendars & enterprise storage",
    badge: "WebDAV / OCS",
    color: "#0082c9",
    icon: <Server size={24} color="#0082c9" />,
  },
  {
    id: "webdav",
    name: "Generic WebDAV",
    tagline: "OwnCloud, Fastmail, mailbox.org, or custom WebDAV",
    badge: "HTTP / WebDAV",
    color: "#e66100",
    icon: <Globe size={24} color="#e66100" />,
  },
  {
    id: "s3",
    name: "Amazon S3 / S3-Compatible",
    tagline: "AWS S3, Cloudflare R2, MinIO, Wasabi, Backblaze B2",
    badge: "Object Storage",
    color: "#f5c211",
    icon: <Database size={24} color="#f5c211" />,
  },
  {
    id: "sftp",
    name: "SFTP (SSH)",
    tagline: "Secure file transfer over remote SSH connection",
    badge: "SSH Protocol",
    color: "#2ec27e",
    icon: <Terminal size={24} color="#2ec27e" />,
  },
];

export const AddCloudDialog: React.FC = () => {
  const {
    isAddCloudOpen,
    setAddCloudOpen,
    connectGoogleDrive,
    addOneDriveAccount,
    addGenericAccount,
  } = useExplorerStore();

  const [selectedProvider, setSelectedProvider] = useState<CloudProviderId | null>(null);
  const [accountName, setAccountName] = useState("");
  const [email, setEmail] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bucket, setBucket] = useState("");
  const [googleAuthMethod, setGoogleAuthMethod] = useState<"token" | "browser">("browser");
  const [onedriveAuthMethod, setOnedriveAuthMethod] = useState<"browser" | "token">("browser");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isAddCloudOpen) return null;

  const handleSelectProvider = (prov: ProviderDefinition) => {
    setSelectedProvider(prov.id);
    setAccountName(prov.name);
    setErrorMsg(null);
    setAuthStatus(null);
    setIsSuccess(false);

    if (prov.id === "google_drive") {
      setEmail("user@gmail.com");
      setEndpoint("");
    } else if (prov.id === "onedrive") {
      setEmail("user@live.com");
      setEndpoint("");
    } else if (prov.id === "nextcloud") {
      setEmail("");
      setEndpoint("https://");
    } else if (prov.id === "webdav") {
      setEmail("");
      setEndpoint("https://");
    } else if (prov.id === "s3") {
      setEmail("");
      setEndpoint("https://s3.amazonaws.com");
    } else if (prov.id === "sftp") {
      setEmail("");
      setEndpoint("sftp.example.com:22");
    } else {
      setEmail("");
      setEndpoint("");
    }
    setUsername("");
    setPassword("");
    setBucket("");
    setGoogleAuthMethod("browser");
    setOnedriveAuthMethod("browser");
    setAccessToken("");
    setRefreshToken("");
    setClientId("");
    setClientSecret("");
  };

  const handleBackToProviders = () => {
    setSelectedProvider(null);
    setErrorMsg(null);
    setAuthStatus(null);
    setIsSuccess(false);
    setLoading(false);
  };

  const handleClose = () => {
    setSelectedProvider(null);
    setErrorMsg(null);
    setAuthStatus(null);
    setIsSuccess(false);
    setLoading(false);
    setAddCloudOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;

    setErrorMsg(null);
    setLoading(true);

    try {
      if (selectedProvider === "google_drive") {
        if (googleAuthMethod === "token" && !accessToken.trim()) {
          throw new Error("Please paste your Google OAuth Access Token, or switch to 'Sign in with Google (1-Click)'.");
        }
        setAuthStatus(
          googleAuthMethod === "browser"
            ? "Opening browser for Google sign-in. Please approve access..."
            : "Connecting to Google Drive and verifying credentials..."
        );
        await connectGoogleDrive(
          accountName.trim() || "Google Drive",
          email.trim() || "user@gmail.com",
          googleAuthMethod === "token" ? accessToken.trim() : undefined,
          googleAuthMethod === "token" ? (refreshToken.trim() || undefined) : undefined,
          googleAuthMethod === "browser" ? (clientId.trim() || undefined) : undefined,
          googleAuthMethod === "browser" ? (clientSecret.trim() || undefined) : undefined
        );
        setIsSuccess(true);
        setAuthStatus("Google Drive connected successfully!");
        await new Promise((r) => setTimeout(r, 450));
      } else if (selectedProvider === "onedrive") {
        if (onedriveAuthMethod === "token") {
          const cleanToken = accessToken
            .trim()
            .replace(/^["']|["']$/g, "")
            .replace(/^bearer\s+/i, "")
            .trim();
          if (!cleanToken) {
            throw new Error("Microsoft Graph Access Token is required to connect OneDrive.");
          }
          setAuthStatus("Connecting to Microsoft Graph API...");
          await addOneDriveAccount(
            accountName.trim() || "OneDrive",
            email.trim() || "user@live.com",
            cleanToken
          );
        } else {
          setAuthStatus("Waiting for Microsoft authorization in browser...");
          await addOneDriveAccount(
            accountName.trim() || "OneDrive",
            email.trim() || "user@live.com",
            "browser"
          );
        }
        setIsSuccess(true);
        setAuthStatus("Microsoft OneDrive connected successfully!");
        await new Promise((r) => setTimeout(r, 450));
      } else if (selectedProvider === "nextcloud" || selectedProvider === "webdav") {
        if (!endpoint.trim() || endpoint.trim() === "https://") {
          throw new Error("Server URL is required.");
        }
        setAuthStatus("Verifying WebDAV credentials...");
        await new Promise((r) => setTimeout(r, 250));
        await addGenericAccount(
          selectedProvider,
          accountName.trim() || (selectedProvider === "nextcloud" ? "Nextcloud" : "WebDAV"),
          endpoint.trim(),
          username.trim() || undefined,
          password || undefined
        );
        setIsSuccess(true);
        setAuthStatus("Storage connected successfully!");
        await new Promise((r) => setTimeout(r, 400));
      } else if (selectedProvider === "s3") {
        if (!bucket.trim()) {
          throw new Error("Bucket name is required.");
        }
        setAuthStatus("Connecting to S3 bucket...");
        await new Promise((r) => setTimeout(r, 250));
        await addGenericAccount(
          "s3",
          accountName.trim() || "Amazon S3",
          endpoint.trim() || "https://s3.amazonaws.com",
          username.trim() || undefined,
          password || undefined,
          bucket.trim()
        );
        setIsSuccess(true);
        setAuthStatus("S3 Storage connected successfully!");
        await new Promise((r) => setTimeout(r, 400));
      } else if (selectedProvider === "sftp") {
        if (!endpoint.trim()) {
          throw new Error("SFTP Host and Port are required.");
        }
        if (!username.trim()) {
          throw new Error("Username is required for SFTP.");
        }
        setAuthStatus("Connecting to SFTP server...");
        await new Promise((r) => setTimeout(r, 250));
        await addGenericAccount(
          "sftp",
          accountName.trim() || "SFTP Server",
          endpoint.trim(),
          username.trim(),
          password || undefined
        );
        setIsSuccess(true);
        setAuthStatus("SFTP connected successfully!");
        await new Promise((r) => setTimeout(r, 400));
      }

      handleClose();
    } catch (err: any) {
      console.error("Failed to add cloud account:", err);
      setErrorMsg(err?.message || "Failed to connect cloud storage. Please check your credentials.");
      setLoading(false);
      setAuthStatus(null);
      setIsSuccess(false);
    }
  };

  const currentProviderDef = PROVIDERS.find((p) => p.id === selectedProvider);

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
        zIndex: 2300,
      }}
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-cloud-title"
        style={{
          width: 580,
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
            {selectedProvider && (
              <button
                type="button"
                className="adw-btn adw-btn-icon"
                title="Back to providers"
                onClick={handleBackToProviders}
                style={{ marginRight: 2 }}
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <HardDrive size={18} color="var(--active-accent)" />
            <div>
              <h3 id="add-cloud-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                {selectedProvider
                  ? `Connect ${currentProviderDef?.name}`
                  : "Add Cloud Storage"}
              </h3>
            </div>
          </div>
          <button
            type="button"
            className="adw-btn adw-btn-icon"
            title="Close"
            onClick={handleClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
          {errorMsg && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                backgroundColor: "rgba(224, 27, 36, 0.12)",
                border: "1px solid var(--state-error)",
                color: "var(--state-error)",
                borderRadius: "var(--adw-radius-m)",
                padding: "10px 14px",
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {!selectedProvider ? (
            /* Provider Selector View */
            <div>
              <p
                style={{
                  margin: "0 0 16px 0",
                  fontSize: 13,
                  color: "var(--dim-fg)",
                  lineHeight: 1.4,
                }}
              >
                Select a cloud service or storage protocol to integrate directly into AR Files with virtual placeholders and automatic sync:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {PROVIDERS.map((prov) => (
                  <div
                    key={prov.id}
                    onClick={() => handleSelectProvider(prov)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      borderRadius: "var(--adw-radius-m)",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "var(--card-bg)",
                      cursor: "pointer",
                      transition: "background-color 0.15s ease, border-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                      e.currentTarget.style.borderColor = "var(--active-accent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--card-bg)";
                      e.currentTarget.style.borderColor = "var(--border-color)";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: "var(--adw-radius-m)",
                          backgroundColor: `${prov.color}18`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {prov.icon}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--window-fg)" }}>
                            {prov.name}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              padding: "1px 6px",
                              borderRadius: "var(--adw-radius-s)",
                              backgroundColor: "var(--hover-bg)",
                              color: "var(--dim-fg)",
                              fontWeight: 500,
                            }}
                          >
                            {prov.badge}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--dim-fg)", marginTop: 2 }}>
                          {prov.tagline}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} color="var(--dim-fg)" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Provider Configuration Form */
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Account Label */}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                  ACCOUNT LABEL
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Storage Drive"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  style={{
                    width: "100%",
                    height: 36,
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

              {/* Provider-specific fields */}
              {selectedProvider === "google_drive" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                      GOOGLE ACCOUNT EMAIL
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="asrout9@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{
                        width: "100%",
                        height: 36,
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

                  {/* Segmented Auth Method Selector */}
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                      AUTHENTICATION METHOD
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        background: "var(--view-bg)",
                        padding: 4,
                        borderRadius: "var(--adw-radius-m)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setGoogleAuthMethod("browser")}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: "var(--adw-radius-s)",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                          backgroundColor: googleAuthMethod === "browser" ? "var(--active-accent)" : "transparent",
                          color: googleAuthMethod === "browser" ? "#ffffff" : "var(--dim-fg)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        Sign in with Google (1-Click)
                      </button>
                      <button
                        type="button"
                        onClick={() => setGoogleAuthMethod("token")}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: "var(--adw-radius-s)",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                          backgroundColor: googleAuthMethod === "token" ? "var(--active-accent)" : "transparent",
                          color: googleAuthMethod === "token" ? "#ffffff" : "var(--dim-fg)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        OAuth Access Token (Manual)
                      </button>
                    </div>
                  </div>

                  {googleAuthMethod === "token" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                          GOOGLE ACCESS TOKEN *
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="ya29.a0..."
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          style={{
                            width: "100%",
                            height: 36,
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

                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--dim-fg)" }}>
                            REFRESH TOKEN
                          </label>
                          <span style={{ fontSize: 11, color: "var(--state-available)", fontWeight: 600 }}>
                            Recommended (Prevents 1-Hour Expiration)
                          </span>
                        </div>
                        <input
                          type="password"
                          placeholder="1//0... (Enables continuous automatic background renewal)"
                          value={refreshToken}
                          onChange={(e) => setRefreshToken(e.target.value)}
                          style={{
                            width: "100%",
                            height: 36,
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

                      {/* Step-by-step guidance card */}
                      <div
                        style={{
                          backgroundColor: "rgba(53, 132, 228, 0.08)",
                          border: "1px solid rgba(53, 132, 228, 0.25)",
                          borderRadius: "var(--adw-radius-m)",
                          padding: "14px 16px",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, color: "var(--window-fg)" }}>
                          <ShieldCheck size={16} color="var(--active-accent)" />
                          <span>How to get your instant Google Token in 30 seconds:</span>
                        </div>
                        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: "var(--dim-fg)" }}>
                          <li>
                            Open{" "}
                            <a
                              href="https://developers.google.com/oauthplayground"
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => {
                                e.preventDefault();
                                window.open("https://developers.google.com/oauthplayground", "_blank");
                              }}
                              style={{ color: "var(--active-accent)", fontWeight: 600, textDecoration: "underline" }}
                            >
                              Google OAuth 2.0 Playground ↗
                            </a>
                          </li>
                          <li>In Step 1 on the left side, select <strong>Drive API v3</strong> and check <code>https://www.googleapis.com/auth/drive</code></li>
                          <li>Click <strong>Authorize APIs</strong> and choose your Google account (<code>asrout9@gmail.com</code>)</li>
                          <li>In Step 2, click <strong>Exchange authorization code for tokens</strong></li>
                          <li>Copy both the <strong>Access token</strong> and <strong>Refresh token</strong> and paste them into the fields above (the Refresh token ensures AR Files stays connected permanently without expiring after 1 hour)!</li>
                        </ol>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div
                        style={{
                          backgroundColor: "rgba(53, 132, 228, 0.08)",
                          border: "1px solid rgba(53, 132, 228, 0.25)",
                          borderRadius: "var(--adw-radius-m)",
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13, color: "var(--window-fg)" }}>
                          <ShieldCheck size={18} color="var(--active-accent)" />
                          <span>1-Click Seamless Browser Sign-in</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--dim-fg)" }}>
                          Clicking <strong>Connect Google Drive</strong> below opens Google's standard login page in your default browser.
                          After approving access, AR Files automatically receives a <strong>permanent Refresh Token</strong> and silently maintains your connection in the background. 
                          You will never have to re-enter credentials or copy/paste tokens.
                        </p>
                      </div>

                      {/* Optional Advanced custom client id toggle */}
                      <div>
                        <details style={{ fontSize: 12, color: "var(--dim-fg)" }}>
                          <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--active-accent)", marginBottom: 8 }}>
                            Advanced: Use Custom Google Cloud Client ID (Optional)
                          </summary>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 4 }}>
                                GOOGLE CLOUD DESKTOP CLIENT ID
                              </label>
                              <input
                                type="text"
                                placeholder="Leave blank to use default built-in client"
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                style={{
                                  width: "100%",
                                  height: 34,
                                  padding: "0 10px",
                                  borderRadius: "var(--adw-radius-s)",
                                  border: "1px solid var(--border-color)",
                                  backgroundColor: "var(--view-bg)",
                                  color: "var(--window-fg)",
                                  outline: "none",
                                  fontSize: 12,
                                  boxSizing: "border-box",
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 4 }}>
                                GOOGLE CLOUD CLIENT SECRET (OPTIONAL)
                              </label>
                              <input
                                type="password"
                                placeholder="GOCSPX-xxxx"
                                value={clientSecret}
                                onChange={(e) => setClientSecret(e.target.value)}
                                style={{
                                  width: "100%",
                                  height: 34,
                                  padding: "0 10px",
                                  borderRadius: "var(--adw-radius-s)",
                                  border: "1px solid var(--border-color)",
                                  backgroundColor: "var(--view-bg)",
                                  color: "var(--window-fg)",
                                  outline: "none",
                                  fontSize: 12,
                                  boxSizing: "border-box",
                                }}
                              />
                            </div>
                          </div>
                        </details>
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedProvider === "onedrive" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                      AUTHENTICATION METHOD
                    </label>
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        background: "var(--view-bg)",
                        padding: 4,
                        borderRadius: "var(--adw-radius-m)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOnedriveAuthMethod("browser")}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: "var(--adw-radius-s)",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                          backgroundColor: onedriveAuthMethod === "browser" ? "var(--active-accent)" : "transparent",
                          color: onedriveAuthMethod === "browser" ? "#ffffff" : "var(--dim-fg)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        Sign in with Microsoft (1-Click)
                      </button>
                      <button
                        type="button"
                        onClick={() => setOnedriveAuthMethod("token")}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: "var(--adw-radius-s)",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                          backgroundColor: onedriveAuthMethod === "token" ? "var(--active-accent)" : "transparent",
                          color: onedriveAuthMethod === "token" ? "#ffffff" : "var(--dim-fg)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        OAuth Access Token (Manual)
                      </button>
                    </div>
                  </div>

                  {onedriveAuthMethod === "browser" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div
                        style={{
                          backgroundColor: "rgba(53, 132, 228, 0.08)",
                          border: "1px solid rgba(53, 132, 228, 0.25)",
                          borderRadius: "var(--adw-radius-m)",
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 13, color: "var(--window-fg)" }}>
                          <ShieldCheck size={18} color="var(--active-accent)" />
                          <span>1-Click Seamless Browser Sign-in</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: "var(--dim-fg)" }}>
                          Clicking <strong>Connect Microsoft OneDrive</strong> below opens Microsoft's standard login page in your default browser.
                          After approving access, AR Files automatically receives a <strong>permanent Refresh Token</strong> and silently maintains your connection in the background. 
                          You will never have to re-enter credentials or copy/paste tokens.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                          MICROSOFT ACCOUNT EMAIL (OPTIONAL)
                        </label>
                        <input
                          type="email"
                          placeholder="user@live.com (Auto-detected from token if omitted)"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          style={{
                            width: "100%",
                            height: 36,
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

                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                          MICROSOFT GRAPH ACCESS TOKEN *
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="EwB..."
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          style={{
                            width: "100%",
                            height: 36,
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

                      {/* Step by step guide card for OneDrive */}
                      <div
                        style={{
                          backgroundColor: "rgba(28, 113, 216, 0.08)",
                          border: "1px solid rgba(28, 113, 216, 0.25)",
                          borderRadius: "var(--adw-radius-m)",
                          padding: "14px 16px",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, color: "var(--window-fg)" }}>
                          <ShieldCheck size={16} color="#1c71d8" />
                          <span>How to get your instant Microsoft Token in 30 seconds:</span>
                        </div>
                        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: "var(--dim-fg)" }}>
                          <li>
                            Open{" "}
                            <a
                              href="https://developer.microsoft.com/en-us/graph/graph-explorer"
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => {
                                e.preventDefault();
                                window.open("https://developer.microsoft.com/en-us/graph/graph-explorer", "_blank");
                              }}
                              style={{ color: "#1c71d8", fontWeight: 600, textDecoration: "underline" }}
                            >
                              Microsoft Graph Explorer ↗
                            </a>
                          </li>
                          <li>Click <strong>Sign in to Graph Explorer</strong> (top right) with your personal or M365 account.</li>
                          <li>
                            In the query box at the top, make sure it says <code>GET</code> <code>https://graph.microsoft.com/v1.0/me/drive</code> and click <strong>Run query</strong>.
                          </li>
                          <li>
                            Click the <strong>Modify permissions</strong> tab (or the prompt) and click <strong>Consent</strong> next to <code>Files.ReadWrite</code> or <code>Files.Read</code>.
                          </li>
                          <li>
                            Click the <strong>Access token</strong> tab (next to Response preview), click <strong>Copy access token</strong>, and paste it into the field above!
                          </li>
                        </ol>
                        <div
                          style={{
                            marginTop: 10,
                            padding: "8px 10px",
                            background: "rgba(224, 160, 0, 0.12)",
                            border: "1px solid rgba(224, 160, 0, 0.3)",
                            borderRadius: 6,
                            fontSize: 11.5,
                            color: "var(--window-fg)",
                            lineHeight: 1.5,
                          }}
                        >
                          <strong>Important:</strong> If you copy the token before consenting to <code>Files.ReadWrite</code>, Microsoft Graph will reject the token with <strong>401 Unauthorized</strong> because the default login token only contains basic profile read permissions.
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {(selectedProvider === "nextcloud" || selectedProvider === "webdav") && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                      SERVER ENDPOINT URL *
                    </label>
                    <input
                      type="url"
                      required
                      placeholder={selectedProvider === "nextcloud" ? "https://cloud.example.com" : "https://webdav.example.com/remote.php/webdav"}
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      style={{
                        width: "100%",
                        height: 36,
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

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                        USERNAME
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        style={{
                          width: "100%",
                          height: 36,
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

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                        PASSWORD / APP TOKEN
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{
                          width: "100%",
                          height: 36,
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
                  </div>
                </>
              )}

              {selectedProvider === "s3" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                        ENDPOINT URL
                      </label>
                      <input
                        type="text"
                        placeholder="https://s3.amazonaws.com"
                        value={endpoint}
                        onChange={(e) => setEndpoint(e.target.value)}
                        style={{
                          width: "100%",
                          height: 36,
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

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                        BUCKET NAME *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="my-storage-bucket"
                        value={bucket}
                        onChange={(e) => setBucket(e.target.value)}
                        style={{
                          width: "100%",
                          height: 36,
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
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                        ACCESS KEY ID
                      </label>
                      <input
                        type="text"
                        placeholder="AKIA..."
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        style={{
                          width: "100%",
                          height: 36,
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

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                        SECRET ACCESS KEY
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{
                          width: "100%",
                          height: 36,
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
                  </div>
                </>
              )}

              {selectedProvider === "sftp" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                      SFTP HOST & PORT *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="sftp.example.com:22"
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      style={{
                        width: "100%",
                        height: 36,
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

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                        SSH USERNAME *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        style={{
                          width: "100%",
                          height: 36,
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

                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim-fg)", marginBottom: 6 }}>
                        PASSWORD OR KEY PASSPHRASE
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{
                          width: "100%",
                          height: 36,
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
                  </div>
                </>
              )}

              {/* Authentication Status & Feedback */}
              {authStatus && (
                <div
                  style={{
                    backgroundColor: isSuccess ? "rgba(46, 194, 126, 0.12)" : "rgba(53, 132, 228, 0.12)",
                    border: `1px solid ${isSuccess ? "#2ec27e" : "var(--active-accent)"}`,
                    color: isSuccess ? "#2ec27e" : "var(--window-fg)",
                    borderRadius: "var(--adw-radius-m)",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {isSuccess ? (
                    <ShieldCheck size={18} color="#2ec27e" style={{ flexShrink: 0 }} />
                  ) : (
                    <RefreshCw size={16} className="spin-animation" color="var(--active-accent)" style={{ flexShrink: 0 }} />
                  )}
                  <span>{authStatus}</span>
                </div>
              )}

              {/* Form Action Buttons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 10,
                  paddingTop: 14,
                  borderTop: "1px solid var(--border-color)",
                }}
              >
                <button
                  type="button"
                  className="adw-btn"
                  onClick={handleBackToProviders}
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="adw-btn adw-btn-accent"
                  disabled={loading}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  {loading && <RefreshCw size={14} className="spin-animation" />}
                  <span>{loading ? "Connecting..." : `Connect ${currentProviderDef?.name}`}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
