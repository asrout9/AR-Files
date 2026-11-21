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

interface ExplorerState {
  // Navigation & Hierarchy
  currentAccountId: string | null;
  currentFolderId: string | null;
  breadcrumbs: BreadcrumbItem[];
  history: Array<{ accountId: string | null; folderId: string | null; breadcrumbs: BreadcrumbItem[] }>;
  historyIndex: number;

  // Data
  accounts: AccountRecord[];
  entries: EntryRecord[];
  totalEntriesCount: number;
  isLoading: boolean;
  selectedIds: Set<string>;

  // View Settings
  viewMode: ViewMode;
  sortBy: SortField;
  sortDirection: SortDirection;
  showHidden: boolean;
  searchQuery: string;

  // Actions
  loadAccounts: () => Promise<void>;
  loadEntries: () => Promise<void>;
  navigateTo: (accountId: string | null, folderId: string | null, name: string) => void;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;
  toggleSelect: (id: string, isMulti: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setViewMode: (mode: ViewMode) => void;
  setSort: (by: SortField) => void;
  toggleShowHidden: () => void;
  setSearchQuery: (query: string) => void;
  hydrateItem: (id: string) => Promise<void>;
  freeUpSpaceItem: (id: string) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameItem: (id: string, newName: string) => Promise<void>;
  trashSelected: () => Promise<void>;
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  currentAccountId: "acc_gdrive",
  currentFolderId: null,
  breadcrumbs: [{ id: null, name: "Google Drive" }],
  history: [{ accountId: "acc_gdrive", folderId: null, breadcrumbs: [{ id: null, name: "Google Drive" }] }],
  historyIndex: 0,

  accounts: [],
  entries: [],
  totalEntriesCount: 0,
  isLoading: false,
  selectedIds: new Set(),

  viewMode: "list",
  sortBy: "name",
  sortDirection: "asc",
  showHidden: false,
  searchQuery: "",

  loadAccounts: async () => {
    try {
      const accounts = await invokeCommand<AccountRecord[]>("list_accounts");
      set({ accounts });
    } catch (err) {
      console.error("Failed to load accounts", err);
    }
  },

  loadEntries: async () => {
    const { currentAccountId, currentFolderId, sortBy, sortDirection, showHidden, searchQuery } = get();
    set({ isLoading: true });

    try {
      const res = await invokeCommand<{ items: EntryRecord[]; total_count: number }>("list_entries", {
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
      });

      set({
        entries: res.items,
        totalEntriesCount: res.total_count,
        isLoading: false,
      });
    } catch (err) {
      console.error("Failed to load entries", err);
      set({ isLoading: false });
    }
  },

  navigateTo: (accountId, folderId, name) => {
    const { breadcrumbs, history, historyIndex, currentFolderId } = get();
    if (folderId === currentFolderId) return;

    let newCrumbs: BreadcrumbItem[];
    if (folderId === null) {
      newCrumbs = [{ id: null, name }];
    } else {
      newCrumbs = [...breadcrumbs, { id: folderId, name }];
    }

    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push({ accountId, folderId, breadcrumbs: newCrumbs });

    set({
      currentAccountId: accountId,
      currentFolderId: folderId,
      breadcrumbs: newCrumbs,
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
      selectedIds: new Set(),
      searchQuery: "",
    });

    get().loadEntries();
  },

  goBack: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      set({
        currentAccountId: prev.accountId,
        currentFolderId: prev.folderId,
        breadcrumbs: prev.breadcrumbs,
        historyIndex: historyIndex - 1,
        selectedIds: new Set(),
      });
      get().loadEntries();
    }
  },

  goForward: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      set({
        currentAccountId: next.accountId,
        currentFolderId: next.folderId,
        breadcrumbs: next.breadcrumbs,
        historyIndex: historyIndex + 1,
        selectedIds: new Set(),
      });
      get().loadEntries();
    }
  },

  goUp: () => {
    const { breadcrumbs } = get();
    if (breadcrumbs.length > 1) {
      const parentCrumb = breadcrumbs[breadcrumbs.length - 2];
      const trimmedCrumbs = breadcrumbs.slice(0, -1);
      set({
        currentFolderId: parentCrumb.id,
        breadcrumbs: trimmedCrumbs,
        selectedIds: new Set(),
      });
      get().loadEntries();
    }
  },

  toggleSelect: (id, isMulti) => {
    const { selectedIds } = get();
    const next = new Set(isMulti ? selectedIds : []);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selectedIds: next });
  },

  selectAll: () => {
    const { entries } = get();
    set({ selectedIds: new Set(entries.map((e) => e.id)) });
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  setViewMode: (viewMode) => set({ viewMode }),

  setSort: (by) => {
    const { sortBy, sortDirection } = get();
    if (sortBy === by) {
      set({ sortDirection: sortDirection === "asc" ? "desc" : "asc" });
    } else {
      set({ sortBy: by, sortDirection: "asc" });
    }
    get().loadEntries();
  },

  toggleShowHidden: () => {
    set((state) => ({ showHidden: !state.showHidden }));
    get().loadEntries();
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().loadEntries();
  },

  hydrateItem: async (id) => {
    try {
      await invokeCommand("hydrate_entry", { id });
      get().loadEntries();
    } catch (err) {
      console.error("Hydration failed", err);
    }
  },

  freeUpSpaceItem: async (id) => {
    try {
      await invokeCommand("free_up_space", { id });
      get().loadEntries();
    } catch (err) {
      console.error("Free up space failed", err);
    }
  },

  createFolder: async (name) => {
    const { currentFolderId } = get();
    try {
      await invokeCommand("create_folder", { parent_id: currentFolderId, name });
      get().loadEntries();
    } catch (err) {
      console.error("Create folder failed", err);
    }
  },

  renameItem: async (id, newName) => {
    try {
      await invokeCommand("rename_entry", { id, new_name: newName });
      get().loadEntries();
    } catch (err) {
      console.error("Rename failed", err);
    }
  },

  trashSelected: async () => {
    const { selectedIds } = get();
    if (selectedIds.size === 0) return;
    try {
      await invokeCommand("trash_entries", { entry_ids: Array.from(selectedIds) });
      set({ selectedIds: new Set() });
      get().loadEntries();
    } catch (err) {
      console.error("Trash failed", err);
    }
  },
}));
