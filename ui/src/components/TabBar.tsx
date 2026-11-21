import React from "react";
import { X, Plus, Folder } from "lucide-react";
import { useExplorerStore } from "../store/useExplorerStore";

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, switchTab, closeTab, openNewTab } =
    useExplorerStore();

  return (
    <div className="adw-tabbar" role="tablist">
      <div className="adw-tabbar-list">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className={`adw-tab ${isActive ? "active" : ""}`}
              onClick={() => switchTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  // Middle click closes tab
                  e.preventDefault();
                  closeTab(tab.id);
                }
              }}
              title={tab.title}
            >
              <Folder size={14} className="adw-tab-icon" />
              <span className="adw-tab-title">{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  className="adw-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  title="Close Tab (Ctrl+W)"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        className="adw-btn adw-btn-icon adw-tabbar-new"
        onClick={() => openNewTab(null, null, "Files")}
        title="New Tab (Ctrl+T)"
      >
        <Plus size={16} />
      </button>
    </div>
  );
};
