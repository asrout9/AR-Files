import { create } from "zustand";
import {
  AccountRecord,
  EntryRecord,
  SortDirection,
  SortField,
  ViewMode,
} from "../types";
import { invokeCommand } from "../services/ipc";

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export interface TabItem {
  id: string;
  title: string;
  accountId: string | null;
  folderId: string | null;
  breadcrumbs: BreadcrumbItem[];
  history: Array<{
    accountId: string | null;
    folderId: string | null;
    breadcrumbs: BreadcrumbItem[];
  }>;
  historyIndex: number;
}

interface ExplorerState {
  // Tabs & Navigation Hierarchy
  tabs: TabItem[];
  activeTabId: string;
  currentAccountId: string | null;
  currentFolderId: string | null;
  breadcrumbs: BreadcrumbItem[];
  history: Array<{
    accountId: string | null;
    folderId: string | null;
    breadcrumbs: BreadcrumbItem[];
  }>;
  historyIndex: number;

  // Data & Selection
  accounts: AccountRecord[];
  entries: EntryRecord[];
  totalEntriesCount: number;
  isLoading: boolean;
  selectedIds: Set<string>;
  lastSelectedAnchorId: string | null;

  // View Settings
  viewMode: ViewMode;
  sortBy: SortField;
  sortDirection: SortDirection;
  showHidden: boolean;
  searchQuery: string;
  isGlobalSearch: boolean;
  pendingUploadsCount: number;

  // Dialog & Pane States
  isDetailsPaneOpen: boolean;
  isQuickPreviewOpen: boolean;
  isPreferencesOpen: boolean;
  isDiagnosticsOpen: boolean;
  isVersionHistoryOpen: boolean;
  versionHistoryEntry: EntryRecord | null;

  // Bandwidth & Cache
  downloadLimitBps: number;
  uploadLimitBps: number;

  // Actions
  loadAccounts: () => Promise<void>;
  loadEntries: () => Promise<void>;
  navigateTo: (
    accountId: string | null,
    folderId: string | null,
    name: string
  ) => void;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;

  // Tabs
  openNewTab: (
    accountId?: string | null,
    folderId?: string | null,
    title?: string
  ) => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;

  // Selection
  toggleSelect: (id: string, isMulti: boolean, isRange?: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // View controls
  setViewMode: (mode: ViewMode) => void;
  setSort: (by: SortField) => void;
  toggleShowHidden: () => void;
  setSearchQuery: (query: string) => void;
  toggleGlobalSearch: () => void;
  toggleDetailsPane: () => void;
  setQuickPreviewOpen: (open: boolean) => void;
  setPreferencesOpen: (open: boolean) => void;
  setDiagnosticsOpen: (open: boolean) => void;
  openVersionHistory: (entry: EntryRecord) => void;
  closeVersionHistory: () => void;

  // Cloud & Sync
  connectGoogleDrive: (name?: string) => Promise<void>;
  addOneDriveAccount: (name?: string) => Promise<void>;
  addGenericAccount: (
    providerType: string,
    name: string,
    endpoint: string,
    username?: string,
    password?: string,
    bucket?: string
  ) => Promise<void>;
  toggleAccountOffline: (accountId: string) => Promise<void>;
  refreshQuota: (accountId: string) => Promise<void>;
  refreshSyncStatus: (accountId: string) => Promise<void>;
  triggerSync: (accountId: string) => Promise<void>;
  cancelHydration: (id: string) => Promise<void>;
  pinItem: (id: string) => Promise<void>;
  unpinItem: (id: string) => Promise<void>;
  getShareLink: (accountId: string, entryId: string) => Promise<string>;
  freeUpAllCache: () => Promise<number>;
  setBandwidthLimits: (downloadBps: number, uploadBps: number) => Promise<void>;
  getBandwidthLimits: () => Promise<void>;

  // Operations
  hydrateItem: (id: string) => Promise<void>;
  freeUpSpaceItem: (id: string) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameItem: (id: string, newName: string) => Promise<void>;
  trashSelected: () => Promise<void>;
  deletePermanently: () => Promise<void>;
  undoLastOperation: () => Promise<void>;
  redoLastOperation: () => Promise<void>;
  batchRename: (previews: Array<{ id: string; oldName: string; newName: string }>) => Promise<void>;
  moveItems: (entryIds: string[], targetParentId: string | null) => Promise<void>;
  copyItems: (entryIds: string[], targetParentId: string | null, collision?: "replace" | "skip" | "keep_both") => Promise<void>;
  compressItems: (sourcePaths: string[], outputPath: string) => Promise<void>;
  extractArchive: (archivePath: string, destinationDir: string) => Promise<void>;
}

const initialBreadcrumbs: BreadcrumbItem[] = [{ id: null, name: "Google Drive" }];
const initialTabId = "tab_initial_1";
const initialTab: TabItem = {
  id: initialTabId,
  title: "Google Drive",
  accountId: "acc_gdrive",
  folderId: null,
  breadcrumbs: initialBreadcrumbs,
  history: [{ accountId: "acc_gdrive", folderId: null, breadcrumbs: initialBreadcrumbs }],
  historyIndex: 0,
};

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTabId,
  currentAccountId: "acc_gdrive",
  currentFolderId: null,
  breadcrumbs: initialBreadcrumbs,
  history: [{ accountId: "acc_gdrive", folderId: null, breadcrumbs: initialBreadcrumbs }],
  historyIndex: 0,

  accounts: [],
  entries: [],
  totalEntriesCount: 0,
  isLoading: false,
  selectedIds: new Set(),
  lastSelectedAnchorId: null,

  viewMode: "list",
  sortBy: "name",
  sortDirection: "asc",
  showHidden: false,
  searchQuery: "",
  isGlobalSearch: false,
  pendingUploadsCount: 0,

  isDetailsPaneOpen: false,
  isQuickPreviewOpen: false,
  isPreferencesOpen: false,
  isDiagnosticsOpen: false,
  isVersionHistoryOpen: false,
  versionHistoryEntry: null,

  downloadLimitBps: 0,
  uploadLimitBps: 0,

  loadAccounts: async () => {
    try {
      const accounts = await invokeCommand<AccountRecord[]>("list_accounts");
      set({ accounts });
    } catch (err) {
      console.error("Failed to load accounts", err);
    }
  },

  loadEntries: async () => {
    const {
      currentAccountId,
      currentFolderId,
      sortBy,
      sortDirection,
      showHidden,
      searchQuery,
      isGlobalSearch,
    } = get();
    set({ isLoading: true });

    if (isGlobalSearch && searchQuery.trim()) {
      try {
        const results = await invokeCommand<EntryRecord[]>("search_all_accounts", {
          query: searchQuery.trim(),
          limit: 200,
        });
        set({
          entries: results || [],
          totalEntriesCount: results ? results.length : 0,
          isLoading: false,
        });
        return;
      } catch (err) {
        console.error("Global search failed", err);
      }
    }

    try {
      const res = await invokeCommand<{ items: EntryRecord[]; total_count: number }>(
        "list_entries",
        {
          query: {
            account_id: currentAccountId,
            parent_id: currentFolderId,
            offset: 0,
            limit: 1000,
            sort_by: sortBy,
            sort_direction: sortDirection,
            show_hidden: showHidden,
            filter: searchQuery.trim() ? searchQuery : null,
          },
        }
      );

      // Sort with folders first and natural alphanumeric collation
      const sorted = [...res.items].sort((a, b) => {
        if (a.is_directory !== b.is_directory) {
          return a.is_directory ? -1 : 1;
        }
        let diff = 0;
        switch (sortBy) {
          case "name":
            diff = a.name.localeCompare(b.name, undefined, {
              numeric: true,
              sensitivity: "base",
            });
            break;
          case "size":
            diff = a.size - b.size;
            break;
          case "modified":
            diff = a.mtime - b.mtime;
            break;
          case "created":
            diff = a.created_at - b.created_at;
            break;
          case "type":
            diff = a.mime_type.localeCompare(b.mime_type);
            break;
          default:
            diff = a.name.localeCompare(b.name);
        }
        return sortDirection === "asc" ? diff : -diff;
      });

      // Filter hidden if not enabled
      const visible = showHidden
        ? sorted
        : sorted.filter((e) => !e.name.startsWith("."));

      set({
        entries: visible,
        totalEntriesCount: res.total_count,
        isLoading: false,
      });
    } catch (err) {
      console.error("Failed to load entries", err);
      set({ isLoading: false });
    }
  },

  navigateTo: (accountId, folderId, name) => {
    const {
      breadcrumbs,
      history,
      historyIndex,
      currentFolderId,
      tabs,
      activeTabId,
    } = get();
    if (folderId === currentFolderId) return;

    let newCrumbs: BreadcrumbItem[];
    if (folderId === null) {
      newCrumbs = [{ id: null, name }];
    } else {
      newCrumbs = [...breadcrumbs, { id: folderId, name }];
    }

    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push({ accountId, folderId, breadcrumbs: newCrumbs });

    // Update active tab metadata
    const updatedTabs = tabs.map((t) =>
      t.id === activeTabId
        ? {
            ...t,
            title: name,
            accountId,
            folderId,
            breadcrumbs: newCrumbs,
            history: nextHistory,
            historyIndex: nextHistory.length - 1,
          }
        : t
    );

    set({
      tabs: updatedTabs,
      currentAccountId: accountId,
      currentFolderId: folderId,
      breadcrumbs: newCrumbs,
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
      selectedIds: new Set(),
      lastSelectedAnchorId: null,
      searchQuery: "",
    });

    get().loadEntries();
  },

  goBack: () => {
    const { history, historyIndex, tabs, activeTabId } = get();
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      const updatedTabs = tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              title: prev.breadcrumbs[prev.breadcrumbs.length - 1]?.name || "Folder",
              accountId: prev.accountId,
              folderId: prev.folderId,
              breadcrumbs: prev.breadcrumbs,
              historyIndex: historyIndex - 1,
            }
          : t
      );
      set({
        tabs: updatedTabs,
        currentAccountId: prev.accountId,
        currentFolderId: prev.folderId,
        breadcrumbs: prev.breadcrumbs,
        historyIndex: historyIndex - 1,
        selectedIds: new Set(),
        lastSelectedAnchorId: null,
      });
      get().loadEntries();
    }
  },

  goForward: () => {
    const { history, historyIndex, tabs, activeTabId } = get();
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      const updatedTabs = tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              title: next.breadcrumbs[next.breadcrumbs.length - 1]?.name || "Folder",
              accountId: next.accountId,
              folderId: next.folderId,
              breadcrumbs: next.breadcrumbs,
              historyIndex: historyIndex + 1,
            }
          : t
      );
      set({
        tabs: updatedTabs,
        currentAccountId: next.accountId,
        currentFolderId: next.folderId,
        breadcrumbs: next.breadcrumbs,
        historyIndex: historyIndex + 1,
        selectedIds: new Set(),
        lastSelectedAnchorId: null,
      });
      get().loadEntries();
    }
  },

  goUp: () => {
    const { breadcrumbs, currentAccountId, tabs, activeTabId } = get();
    if (breadcrumbs.length > 1) {
      const parentCrumb = breadcrumbs[breadcrumbs.length - 2];
      const trimmedCrumbs = breadcrumbs.slice(0, -1);
      const updatedTabs = tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              title: parentCrumb.name,
              folderId: parentCrumb.id,
              breadcrumbs: trimmedCrumbs,
            }
          : t
      );
      set({
        tabs: updatedTabs,
        currentFolderId: parentCrumb.id,
        breadcrumbs: trimmedCrumbs,
        selectedIds: new Set(),
        lastSelectedAnchorId: null,
      });
      get().loadEntries();
    } else {
      get().navigateTo(currentAccountId, null, breadcrumbs[0]?.name || "Root");
    }
  },

  openNewTab: (accountId = null, folderId = null, title = "New Tab") => {
    const { tabs, currentAccountId } = get();
    const effectiveAcc = accountId ?? currentAccountId;
    const newTabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const crumbs: BreadcrumbItem[] = [{ id: folderId, name: title }];
    const newTab: TabItem = {
      id: newTabId,
      title,
      accountId: effectiveAcc,
      folderId,
      breadcrumbs: crumbs,
      history: [{ accountId: effectiveAcc, folderId, breadcrumbs: crumbs }],
      historyIndex: 0,
    };

    set({
      tabs: [...tabs, newTab],
      activeTabId: newTabId,
      currentAccountId: effectiveAcc,
      currentFolderId: folderId,
      breadcrumbs: crumbs,
      history: newTab.history,
      historyIndex: 0,
      selectedIds: new Set(),
      lastSelectedAnchorId: null,
    });
    get().loadEntries();
  },

  closeTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return; // Keep at least one tab open

    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);

    if (activeTabId === tabId) {
      const nextActiveIndex = Math.max(0, tabIndex - 1);
      const nextActive = newTabs[nextActiveIndex];
      set({
        tabs: newTabs,
        activeTabId: nextActive.id,
        currentAccountId: nextActive.accountId,
        currentFolderId: nextActive.folderId,
        breadcrumbs: nextActive.breadcrumbs,
        history: nextActive.history,
        historyIndex: nextActive.historyIndex,
        selectedIds: new Set(),
        lastSelectedAnchorId: null,
      });
      get().loadEntries();
    } else {
      set({ tabs: newTabs });
    }
  },

  switchTab: (tabId: string) => {
    const { tabs, activeTabId } = get();
    if (tabId === activeTabId) return;

    const targetTab = tabs.find((t) => t.id === tabId);
    if (!targetTab) return;

    set({
      activeTabId: tabId,
      currentAccountId: targetTab.accountId,
      currentFolderId: targetTab.folderId,
      breadcrumbs: targetTab.breadcrumbs,
      history: targetTab.history,
      historyIndex: targetTab.historyIndex,
      selectedIds: new Set(),
      lastSelectedAnchorId: null,
    });
    get().loadEntries();
  },

  toggleSelect: (id: string, isMulti: boolean, isRange = false) => {
    const { selectedIds, entries, lastSelectedAnchorId } = get();
    const newSelection = new Set(selectedIds);

    if (isRange && lastSelectedAnchorId) {
      // Contiguous shift-click range selection
      const anchorIdx = entries.findIndex((e) => e.id === lastSelectedAnchorId);
      const targetIdx = entries.findIndex((e) => e.id === id);

      if (anchorIdx !== -1 && targetIdx !== -1) {
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        for (let i = start; i <= end; i++) {
          newSelection.add(entries[i].id);
        }
      }
      set({ selectedIds: newSelection });
      return;
    }

    if (isMulti) {
      // Ctrl/Cmd click toggle
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      set({ selectedIds: newSelection, lastSelectedAnchorId: id });
    } else {
      // Single click
      set({ selectedIds: new Set([id]), lastSelectedAnchorId: id });
    }
  },

  selectAll: () => {
    const { entries } = get();
    set({ selectedIds: new Set(entries.map((e) => e.id)) });
  },

  clearSelection: () => {
    set({ selectedIds: new Set(), lastSelectedAnchorId: null });
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  setSort: (by) => {
    const { sortBy, sortDirection } = get();
    let nextDir: SortDirection = "asc";
    if (sortBy === by) {
      nextDir = sortDirection === "asc" ? "desc" : "asc";
    }
    set({ sortBy: by, sortDirection: nextDir });
    get().loadEntries();
  },

  toggleShowHidden: () => {
    const nextVal = !get().showHidden;
    set({ showHidden: nextVal });
    get().loadEntries();
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().loadEntries();
  },

  toggleGlobalSearch: () => {
    set((state) => ({ isGlobalSearch: !state.isGlobalSearch }));
    get().loadEntries();
  },

  toggleDetailsPane: () => {
    set((state) => ({ isDetailsPaneOpen: !state.isDetailsPaneOpen }));
  },

  setQuickPreviewOpen: (open: boolean) => {
    set({ isQuickPreviewOpen: open });
  },

  setPreferencesOpen: (open: boolean) => {
    set({ isPreferencesOpen: open });
  },

  setDiagnosticsOpen: (open: boolean) => {
    set({ isDiagnosticsOpen: open });
  },

  openVersionHistory: (entry: EntryRecord) => {
    set({ isVersionHistoryOpen: true, versionHistoryEntry: entry });
  },

  closeVersionHistory: () => {
    set({ isVersionHistoryOpen: false, versionHistoryEntry: null });
  },

  connectGoogleDrive: async (name?: string) => {
    try {
      await invokeCommand("start_google_oauth", { account_name: name });
      await get().loadAccounts();
    } catch (err) {
      console.error("Connect Google Drive failed", err);
    }
  },

  toggleAccountOffline: async (accountId: string) => {
    const acc = get().accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const isNowOffline = acc.sync_status !== "offline";
    try {
      await invokeCommand("set_offline_mode", {
        account_id: accountId,
        offline: isNowOffline,
      });
      set((state) => ({
        accounts: state.accounts.map((a) =>
          a.id === accountId
            ? { ...a, sync_status: isNowOffline ? "offline" : "idle" }
            : a
        ),
      }));
      await get().refreshSyncStatus(accountId);
    } catch (err) {
      console.error("Toggle offline mode failed", err);
    }
  },

  refreshQuota: async (accountId: string) => {
    try {
      const quota = await invokeCommand<{ total_bytes: number; used_bytes: number }>(
        "get_account_quota",
        { account_id: accountId }
      );
      if (quota) {
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.id === accountId
              ? {
                  ...a,
                  quota_total: quota.total_bytes,
                  quota_used: quota.used_bytes,
                }
              : a
          ),
        }));
      }
    } catch (err) {
      console.error("Refresh quota failed", err);
    }
  },

  refreshSyncStatus: async (accountId: string) => {
    try {
      const statusInfo = await invokeCommand<{
        pending_uploads_count: number;
        is_offline: boolean;
      }>("get_sync_status", { account_id: accountId });
      if (statusInfo) {
        set({
          pendingUploadsCount: statusInfo.pending_uploads_count,
        });
      }
    } catch (err) {
      console.error("Refresh sync status failed", err);
    }
  },

  triggerSync: async (accountId: string) => {
    try {
      await invokeCommand("trigger_sync", { account_id: accountId });
      await get().loadEntries();
      await get().refreshQuota(accountId);
      await get().refreshSyncStatus(accountId);
    } catch (err) {
      console.error("Trigger sync failed", err);
    }
  },

  hydrateItem: async (id: string) => {
    try {
      set((state) => ({
        entries: state.entries.map((e) =>
          e.id === id ? { ...e, state: "hydrating" } : e
        ),
      }));
      await invokeCommand("hydrate_entry", { entry_id: id });
      await get().loadEntries();
    } catch (err) {
      console.error("Hydration command failed", err);
      await get().loadEntries();
    }
  },

  cancelHydration: async (id: string) => {
    try {
      await invokeCommand("cancel_hydration", { entry_id: id });
      await get().loadEntries();
    } catch (err) {
      console.error("Cancel hydration failed", err);
    }
  },

  pinItem: async (id: string) => {
    try {
      set((state) => ({
        entries: state.entries.map((e) =>
          e.id === id ? { ...e, state: "pinned" } : e
        ),
      }));
      await invokeCommand("pin_entry", { entry_id: id });
      await get().loadEntries();
    } catch (err) {
      console.error("Pin entry failed", err);
    }
  },

  unpinItem: async (id: string) => {
    try {
      await invokeCommand("unpin_entry", { entry_id: id });
      await get().loadEntries();
    } catch (err) {
      console.error("Unpin entry failed", err);
    }
  },

  freeUpSpaceItem: async (id: string) => {
    try {
      await invokeCommand("free_up_space", { entry_id: id });
      await get().loadEntries();
    } catch (err) {
      console.error("Free up space command failed", err);
    }
  },

  addOneDriveAccount: async (name = "OneDrive") => {
    try {
      await invokeCommand("add_onedrive_account", { name });
      await get().loadAccounts();
    } catch (err) {
      console.error("Failed to add OneDrive account", err);
      throw err;
    }
  },

  addGenericAccount: async (
    providerType: string,
    name: string,
    endpoint: string,
    username?: string,
    password?: string,
    bucket?: string
  ) => {
    try {
      await invokeCommand("add_generic_account", {
        provider_type: providerType,
        name,
        endpoint,
        username,
        password,
        bucket,
      });
      await get().loadAccounts();
    } catch (err) {
      console.error("Failed to add generic account", err);
      throw err;
    }
  },

  getShareLink: async (accountId: string, entryId: string) => {
    try {
      const link = await invokeCommand<string>("get_share_link", {
        account_id: accountId,
        entry_id: entryId,
      });
      return link;
    } catch (err) {
      console.error("Failed to get share link", err);
      throw err;
    }
  },

  freeUpAllCache: async () => {
    try {
      const evicted = await invokeCommand<number>("free_up_all_cache");
      await get().loadEntries();
      return evicted;
    } catch (err) {
      console.error("Failed to free up all cache", err);
      return 0;
    }
  },

  setBandwidthLimits: async (downloadBps: number, uploadBps: number) => {
    try {
      await invokeCommand("set_bandwidth_limits", {
        download_bps: downloadBps,
        upload_bps: uploadBps,
      });
      set({ downloadLimitBps: downloadBps, uploadLimitBps: uploadBps });
    } catch (err) {
      console.error("Failed to set bandwidth limits", err);
    }
  },

  getBandwidthLimits: async () => {
    try {
      const limits = await invokeCommand<[number, number]>("get_bandwidth_limits");
      if (limits) {
        set({ downloadLimitBps: limits[0], uploadLimitBps: limits[1] });
      }
    } catch (err) {
      console.error("Failed to get bandwidth limits", err);
    }
  },

  createFolder: async (name: string) => {
    const { currentAccountId, currentFolderId } = get();
    try {
      await invokeCommand("create_folder", {
        account_id: currentAccountId || "acc_local",
        parent_id: currentFolderId,
        name,
      });
      await get().loadEntries();
    } catch (err) {
      console.error("Create folder failed", err);
    }
  },

  renameItem: async (id: string, newName: string) => {
    try {
      await invokeCommand("rename_entry", { id, new_name: newName });
      await get().loadEntries();
    } catch (err) {
      console.error("Rename failed", err);
    }
  },

  trashSelected: async () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;
    try {
      await invokeCommand("trash_entries", {
        entry_ids: Array.from(selectedIds),
      });
      set({ selectedIds: new Set(), lastSelectedAnchorId: null });
      await get().loadEntries();
    } catch (err) {
      console.error("Trash failed", err);
    }
  },

  deletePermanently: async () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;
    try {
      await invokeCommand("delete_permanently", {
        entry_ids: Array.from(selectedIds),
      });
      set({ selectedIds: new Set(), lastSelectedAnchorId: null });
      await get().loadEntries();
    } catch (err) {
      console.error("Permanent delete failed", err);
    }
  },

  undoLastOperation: async () => {
    try {
      await invokeCommand("undo_last_operation");
      await get().loadEntries();
    } catch (err) {
      console.error("Undo failed", err);
    }
  },

  redoLastOperation: async () => {
    try {
      await invokeCommand("redo_last_operation");
      await get().loadEntries();
    } catch (err) {
      console.error("Redo failed", err);
    }
  },

  batchRename: async (previews) => {
    try {
      const payload = previews.map((p) => ({
        entry_id: p.id,
        old_name: p.oldName,
        new_name: p.newName,
      }));
      await invokeCommand("apply_batch_rename", { previews: payload });
      await get().loadEntries();
    } catch (err) {
      console.error("Batch rename failed", err);
    }
  },

  moveItems: async (entryIds, targetParentId) => {
    try {
      await invokeCommand("move_entries", {
        entry_ids: entryIds,
        target_parent_id: targetParentId,
      });
      await get().loadEntries();
    } catch (err) {
      console.error("Move failed", err);
    }
  },

  copyItems: async (entryIds, targetParentId, collision = "keep_both") => {
    try {
      await invokeCommand("copy_entries", {
        entry_ids: entryIds,
        target_parent_id: targetParentId,
        collision,
      });
      await get().loadEntries();
    } catch (err) {
      console.error("Copy failed", err);
    }
  },

  compressItems: async (sourcePaths, outputPath) => {
    try {
      await invokeCommand("compress_entries", {
        source_paths: sourcePaths,
        output_path: outputPath,
      });
      await get().loadEntries();
    } catch (err) {
      console.error("Compress failed", err);
    }
  },

  extractArchive: async (archivePath, destinationDir) => {
    try {
      await invokeCommand("extract_archive", {
        archive_path: archivePath,
        destination_dir: destinationDir,
      });
      await get().loadEntries();
    } catch (err) {
      console.error("Extract failed", err);
    }
  },
}));
