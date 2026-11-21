import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
  List as ListIcon,
  LayoutGrid,
  FolderPlus,
  X,
} from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";

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
  } = useExplorerStore();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName("");
      setIsCreatingFolder(false);
    }
  };

  return (
    <header className="adw-headerbar">
      {/* Left Navigation Controls */}
      <div className="adw-headerbar-left">
        <button
          className="adw-btn adw-btn-icon"
          onClick={goBack}
          disabled={historyIndex === 0}
          title="Back (Alt+Left)"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          className="adw-btn adw-btn-icon"
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
          title="Forward (Alt+Right)"
        >
          <ChevronRight size={16} />
        </button>

        <button
          className="adw-btn adw-btn-icon"
          onClick={goUp}
          disabled={breadcrumbs.length <= 1}
          title="Parent Folder (Alt+Up)"
        >
          <ChevronUp size={16} />
        </button>

        {/* Path Bar / Breadcrumbs */}
        <div className="adw-pathbar">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id ?? "root"}>
              {idx > 0 && <span className="adw-crumb-sep">/</span>}
              <span
                className="adw-crumb"
                onClick={() => navigateTo(currentAccountId, crumb.id, crumb.name)}
              >
                {crumb.name}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Center Search Input (Nautilus style) */}
      <div className="adw-headerbar-center">
        {isSearchOpen ? (
          <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
            <input
              type="text"
              autoFocus
              className="adw-crumb"
              style={{
                width: 260,
                height: 32,
                border: "1px solid var(--border-color)",
                background: "var(--card-bg)",
                paddingLeft: 28,
              }}
              placeholder="Search current folder..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search size={14} style={{ position: "absolute", left: 8, color: "var(--dim-fg)" }} />
            <button
              className="adw-btn adw-btn-icon"
              style={{ position: "absolute", right: 2, height: 26, width: 26, border: "none" }}
              onClick={() => {
                setSearchQuery("");
                setIsSearchOpen(false);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ) : null}
      </div>

      {/* Right Controls */}
      <div className="adw-headerbar-right">
        {!isSearchOpen && (
          <button
            className="adw-btn adw-btn-icon"
            onClick={() => setIsSearchOpen(true)}
            title="Search (Ctrl+F)"
          >
            <Search size={16} />
          </button>
        )}

        {/* View Mode Toggle */}
        <div style={{ display: "flex", background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: 6 }}>
          <button
            className={`adw-btn adw-btn-icon ${viewMode === "list" ? "adw-btn-accent" : ""}`}
            style={{ border: "none", height: 30, width: 30 }}
            onClick={() => setViewMode("list")}
            title="List View"
          >
            <ListIcon size={15} />
          </button>
          <button
            className={`adw-btn adw-btn-icon ${viewMode === "grid" ? "adw-btn-accent" : ""}`}
            style={{ border: "none", height: 30, width: 30 }}
            onClick={() => setViewMode("grid")}
            title="Grid View"
          >
            <LayoutGrid size={15} />
          </button>
        </div>

        {/* New Folder Action */}
        <button
          className="adw-btn adw-btn-icon"
          onClick={() => setIsCreatingFolder(true)}
          title="New Folder (Ctrl+Shift+N)"
        >
          <FolderPlus size={16} />
        </button>

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

      {/* New Folder Modal Prompt */}
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
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
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
