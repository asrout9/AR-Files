import React, { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
  List as ListIcon,
  LayoutGrid,
  FolderPlus,
  X,
  Eye,
  EyeOff,
  ArrowUpDown,
  RefreshCw,
  CloudOff,
  Info,
  MoreVertical,
  Sliders,
  Activity,
  Globe,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";
import { SortField } from "../types";
import { getTranslation, TranslationDict } from "../i18n";

export const HeaderBar: React.FC = () => {
  const {
    breadcrumbs,
    historyIndex,
    history,
    goBack,
    goForward,
    goUp,
    navigateTo,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    createFolder,
    currentAccountId,
    showHidden,
    toggleShowHidden,
    sortBy,
    sortDirection,
    setSort,
    openNewTab,
    closeTab,
    activeTabId,
    selectAll,
    accounts,
    pendingUploadsCount,
    isDetailsPaneOpen,
    toggleDetailsPane,
    isGlobalSearch,
    toggleGlobalSearch,
    setPreferencesOpen,
    setDiagnosticsOpen,
    language,
  } = useExplorerStore();

  const t = (k: keyof TranslationDict) => getTranslation(k, language);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const pathInputRef = useRef<HTMLInputElement>(null);

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+H / Cmd+H: Toggle Hidden Files
      if ((e.ctrlKey || e.metaKey) && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        toggleShowHidden();
      }
      // Ctrl+L / Cmd+L: Edit Location
      else if ((e.ctrlKey || e.metaKey) && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        const fullPath = "/" + breadcrumbs.map((b) => b.name).join("/");
        setPathInput(fullPath);
        setIsEditingPath(true);
      }
      // Ctrl+F / Cmd+F: Toggle Search
      else if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      // Ctrl+T / Cmd+T: New Tab
      else if ((e.ctrlKey || e.metaKey) && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        openNewTab(currentAccountId, null, "Files");
      }
      // Ctrl+W / Cmd+W: Close Current Tab
      else if ((e.ctrlKey || e.metaKey) && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        closeTab(activeTabId);
      }
      // Ctrl+A / Cmd+A: Select All
      else if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
        if (
          document.activeElement?.tagName !== "INPUT" &&
          document.activeElement?.tagName !== "TEXTAREA"
        ) {
          e.preventDefault();
          selectAll();
        }
      }
      // Alt+Up: Go Up
      else if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        goUp();
      }
      // Alt+Left: Go Back
      else if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
      // Alt+Right: Go Forward
      else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
      }
      // Ctrl+I: Toggle Details Pane
      else if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        toggleDetailsPane();
      }
      // Ctrl+,: Preferences
      else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setPreferencesOpen(true);
      }
      // Ctrl+Shift+D: Diagnostics
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        setDiagnosticsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    breadcrumbs,
    currentAccountId,
    activeTabId,
    toggleShowHidden,
    openNewTab,
    closeTab,
    selectAll,
    goUp,
    goBack,
    goForward,
    toggleDetailsPane,
    setPreferencesOpen,
    setDiagnosticsOpen,
  ]);

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName("");
      setIsCreatingFolder(false);
    }
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      const parts = pathInput.trim().split("/").filter(Boolean);
      const targetName = parts[parts.length - 1] || "Root";
      navigateTo(currentAccountId, null, targetName);
      setIsEditingPath(false);
    }
  };

  const sortOptions: Array<{ field: SortField; label: string }> = [
    { field: "name", label: "Name" },
    { field: "size", label: "Size" },
    { field: "modified", label: "Modified Date" },
    { field: "created", label: "Created Date" },
    { field: "type", label: "Type" },
  ];

  return (
    <header className="adw-headerbar" role="toolbar" aria-label="Window header bar">
      {/* Left Navigation Controls */}
      <div className="adw-headerbar-left">
        <button
          className="adw-btn adw-btn-icon"
          aria-label="Back"
          onClick={goBack}
          disabled={historyIndex === 0}
          title="Back (Alt+Left)"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          className="adw-btn adw-btn-icon"
          aria-label="Forward"
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
          title="Forward (Alt+Right)"
        >
          <ChevronRight size={16} />
        </button>

        <button
          className="adw-btn adw-btn-icon"
          aria-label="Parent folder"
          onClick={goUp}
          disabled={breadcrumbs.length <= 1}
          title="Parent Folder (Alt+Up)"
        >
          <ChevronUp size={16} />
        </button>

        {/* Path Bar / Breadcrumbs / Location Bar */}
        {isEditingPath ? (
          <form onSubmit={handlePathSubmit} style={{ display: "flex", flex: 1 }}>
            <input
              ref={pathInputRef}
              type="text"
              autoFocus
              className="adw-crumb"
              style={{
                width: 260,
                height: 32,
                border: "1px solid var(--border-color)",
                background: "var(--card-bg)",
                padding: "0 8px",
              }}
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onBlur={() => setIsEditingPath(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setIsEditingPath(false);
              }}
            />
          </form>
        ) : (
          <div
            className="adw-pathbar"
            onDoubleClick={() => {
              const fullPath = "/" + breadcrumbs.map((b) => b.name).join("/");
              setPathInput(fullPath);
              setIsEditingPath(true);
            }}
            title="Click crumb to navigate, double-click or Ctrl+L to edit path"
          >
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id ?? "root"}>
                {idx > 0 && <span className="adw-crumb-sep">/</span>}
                <span
                  className="adw-crumb"
                  onClick={() =>
                    navigateTo(currentAccountId, crumb.id, crumb.name)
                  }
                >
                  {crumb.name}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Center Search Input (Nautilus style) */}
      <div className="adw-headerbar-center">
        {isSearchOpen ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              position: "relative",
              gap: 6,
            }}
          >
            <button
              className={`adw-btn adw-btn-icon ${isGlobalSearch ? "adw-btn-accent" : ""}`}
              onClick={toggleGlobalSearch}
              title={isGlobalSearch ? "Searching all accounts (FTS5) - click for current folder" : "Searching current folder - click for all accounts (FTS5)"}
              style={{ width: 28, height: 28, padding: 0 }}
            >
              <Globe size={14} />
            </button>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                type="text"
                autoFocus
                className="adw-crumb"
                style={{
                  width: 270,
                  height: 32,
                  border: "1px solid var(--border-color)",
                  background: "var(--card-bg)",
                  paddingLeft: 28,
                  paddingRight: 26,
                }}
                placeholder={isGlobalSearch ? `${t("globalSearch")}...` : t("searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search
                size={14}
                style={{ position: "absolute", left: 8, color: "var(--dim-fg)" }}
              />
              <button
                className="adw-btn adw-btn-icon"
                style={{
                  position: "absolute",
                  right: 4,
                  width: 20,
                  height: 20,
                  padding: 0,
                  border: "none",
                }}
                onClick={() => {
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Right Controls */}
      <div className="adw-headerbar-right">
        {!isSearchOpen && (
          <button
            className="adw-btn adw-btn-icon"
            aria-label="Search files and cloud"
            onClick={() => setIsSearchOpen(true)}
            title="Search (Ctrl+F)"
          >
            <Search size={16} />
          </button>
        )}

        {/* Hidden Files Toggle */}
        <button
          className={`adw-btn adw-btn-icon ${showHidden ? "adw-btn-accent" : ""}`}
          aria-label="Toggle hidden files"
          onClick={toggleShowHidden}
          title={`Hidden Files: ${showHidden ? "Shown" : "Hidden"} (Ctrl+H)`}
        >
          {showHidden ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>

        {/* Sort Menu Dropdown */}
        <div style={{ position: "relative" }}>
          <button
            className={`adw-btn adw-btn-icon ${isSortMenuOpen ? "adw-btn-accent" : ""}`}
            aria-label="Sort options"
            onClick={() => setIsSortMenuOpen((prev) => !prev)}
            title={`Sort: ${sortBy} (${sortDirection})`}
          >
            <ArrowUpDown size={15} />
          </button>

          {isSortMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: 38,
                right: 0,
                background: "var(--popover-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--adw-radius-m)",
                boxShadow: "var(--popover-shadow)",
                padding: "6px 0",
                zIndex: 100,
                minWidth: 160,
              }}
              onMouseLeave={() => setIsSortMenuOpen(false)}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--dim-fg)",
                  padding: "4px 12px",
                  textTransform: "uppercase",
                }}
              >
                Sort by
              </div>
              {sortOptions.map((opt) => (
                <div
                  key={opt.field}
                  style={{
                    padding: "6px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    background:
                      sortBy === opt.field ? "var(--hover-bg)" : "transparent",
                    color:
                      sortBy === opt.field
                        ? "var(--adw-accent-blue)"
                        : "var(--window-fg)",
                    fontSize: 13,
                  }}
                  onClick={() => {
                    setSort(opt.field);
                    setIsSortMenuOpen(false);
                  }}
                >
                  <span>{opt.label}</span>
                  {sortBy === opt.field && (
                    <span style={{ fontSize: 11 }}>
                      {sortDirection === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cloud Sync & Offline Status Indicator */}
        {(() => {
          const currentAccount = accounts.find((a) => a.id === currentAccountId);
          if (!currentAccount) return null;

          if (currentAccount.sync_status === "offline") {
            return (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--dim-fg)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: "rgba(255, 255, 255, 0.06)",
                  padding: "3px 8px",
                  borderRadius: 12,
                }}
              >
                <CloudOff size={12} />
                <span>Offline{pendingUploadsCount > 0 ? ` • ${pendingUploadsCount} pending` : ""}</span>
              </span>
            );
          }

          if (currentAccount.sync_status === "syncing" || currentAccount.sync_status === "indexing") {
            return (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--adw-accent-blue)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <RefreshCw size={11} className="spin" style={{ animation: "spin 1s linear infinite" }} />
                <span>Syncing</span>
              </span>
            );
          }

          return null;
        })()}

        {/* View Mode Toggle */}
        <div
          style={{
            display: "flex",
            background: "var(--card-bg)",
            border: "1px solid var(--border-color)",
            borderRadius: 6,
          }}
        >
          <button
            className={`adw-btn adw-btn-icon ${
              viewMode === "list" ? "adw-btn-accent" : ""
            }`}
            style={{ border: "none", height: 30, width: 30 }}
            aria-label="List view"
            onClick={() => setViewMode("list")}
            title="List View"
          >
            <ListIcon size={15} />
          </button>
          <button
            className={`adw-btn adw-btn-icon ${
              viewMode === "grid" ? "adw-btn-accent" : ""
            }`}
            style={{ border: "none", height: 30, width: 30 }}
            aria-label="Grid view"
            onClick={() => setViewMode("grid")}
            title="Grid View"
          >
            <LayoutGrid size={15} />
          </button>
        </div>

        {/* New Folder Action */}
        <button
          className="adw-btn adw-btn-icon"
          aria-label="New folder"
          onClick={() => setIsCreatingFolder(true)}
          title="New Folder (Ctrl+Shift+N)"
        >
          <FolderPlus size={16} />
        </button>

        {/* Details Pane Toggle */}
        <button
          className={`adw-btn adw-btn-icon ${isDetailsPaneOpen ? "adw-btn-accent" : ""}`}
          aria-label="Toggle details pane"
          onClick={toggleDetailsPane}
          title="Toggle Properties & Details (Ctrl+I)"
        >
          <Info size={16} />
        </button>

        {/* More Menu */}
        <div style={{ position: "relative" }}>
          <button
            className={`adw-btn adw-btn-icon ${isMenuOpen ? "adw-btn-accent" : ""}`}
            aria-label="Application menu"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            title="Menu"
          >
            <MoreVertical size={16} />
          </button>

          {isMenuOpen && (
            <>
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 998,
                }}
                onClick={() => setIsMenuOpen(false)}
              />
              <div
                style={{
                  position: "absolute",
                  top: 36,
                  right: 0,
                  backgroundColor: "var(--popover-bg)",
                  borderRadius: "var(--adw-radius-m)",
                  boxShadow: "var(--popover-shadow)",
                  border: "1px solid var(--border-color)",
                  padding: "6px 0",
                  minWidth: 220,
                  zIndex: 999,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <button
                  className="adw-sidebar-item"
                  style={{
                    borderRadius: 0,
                    border: "none",
                    background: "none",
                    width: "100%",
                  }}
                  onClick={() => {
                    setPreferencesOpen(true);
                    setIsMenuOpen(false);
                  }}
                >
                  <Sliders size={15} />
                  <span>{t("preferences")} (Ctrl+,)</span>
                </button>

                <button
                  className="adw-sidebar-item"
                  style={{
                    borderRadius: 0,
                    border: "none",
                    background: "none",
                    width: "100%",
                  }}
                  onClick={() => {
                    setDiagnosticsOpen(true);
                    setIsMenuOpen(false);
                  }}
                >
                  <Activity size={15} />
                  <span>{t("diagnostics")} (Ctrl+Shift+D)</span>
                </button>

                <div
                  style={{
                    height: 1,
                    backgroundColor: "var(--border-color)",
                    margin: "4px 0",
                  }}
                />

                <button
                  className="adw-sidebar-item"
                  style={{
                    borderRadius: 0,
                    border: "none",
                    background: "none",
                    width: "100%",
                  }}
                  onClick={() => {
                    toggleGlobalSearch();
                    setIsMenuOpen(false);
                  }}
                >
                  <Globe size={15} color={isGlobalSearch ? "var(--active-accent)" : undefined} />
                  <span>{isGlobalSearch ? "✓ Search All Accounts (FTS5)" : "Search All Accounts (FTS5)"}</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Window Controls (GNOME libadwaita layout: close on right) */}
        <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
          <button
            className="adw-btn adw-btn-icon"
            style={{ borderRadius: "50%", width: 24, height: 24, padding: 0 }}
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* New Folder Dialog */}
      {isCreatingFolder && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <form
            onSubmit={handleCreateFolderSubmit}
            style={{
              background: "var(--popover-bg)",
              padding: 24,
              borderRadius: "var(--adw-radius-l)",
              boxShadow: "var(--popover-shadow)",
              width: 320,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>New Folder</h3>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder Name"
              style={{
                height: 36,
                padding: "0 10px",
                border: "1px solid var(--border-color)",
                borderRadius: "var(--adw-radius-s)",
                background: "var(--view-bg)",
                color: "var(--window-fg)",
                outline: "none",
              }}
            />
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <button
                type="button"
                className="adw-btn"
                onClick={() => setIsCreatingFolder(false)}
              >
                Cancel
              </button>
              <button type="submit" className="adw-btn adw-btn-accent">
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </header>
  );
};
