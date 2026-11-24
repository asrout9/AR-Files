import { create } from "zustand";
import {
  AccountRecord,
  ActiveJob,
  DuplicateGroup,
  EntryRecord,
  FolderIntelligenceResult,
  SortDirection,
  SortField,
  ViewMode,
} from "../types";
import { invokeCommand } from "../services/ipc";
import { LanguageCode } from "../i18n";

export function applyAppFontSize(size: number) {
  if (typeof document !== "undefined") {
    const clamped = Math.max(10, Math.min(24, size));
    const scale = clamped / 14;
    document.documentElement.style.setProperty("--app-font-size", `${clamped}px`);
    document.documentElement.style.setProperty("--app-font-scale", scale.toFixed(3));
  }
}

if (typeof document !== "undefined") {
  try {
    const savedTheme = localStorage.getItem("ar_files_theme");
    if (savedTheme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else if (savedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }

    const savedFontSize = parseInt(localStorage.getItem("ar_files_font_size") || "14", 10);
    if (!isNaN(savedFontSize)) {
      applyAppFontSize(savedFontSize);
    }
  } catch {}
}

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export interface ClipboardState {
  mode: "copy" | "cut";
  entries: EntryRecord[];
  sourceAccountId: string | null;
  sourceFolderId: string | null;
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
  isPreviewPaneOpen: boolean;
  togglePreviewPane: () => void;
  setPreviewPaneOpen: (open: boolean) => void;
  isQuickPreviewOpen: boolean;
  isPreferencesOpen: boolean;
  isDiagnosticsOpen: boolean;
  isVersionHistoryOpen: boolean;
  versionHistoryEntry: EntryRecord | null;
  isAddCloudOpen: boolean;

  // Folder Intelligence
  folderIntelligence: FolderIntelligenceResult | null;
  isAnalyzingIntelligence: boolean;
  isSmartCleanupOpen: boolean;
  isIntelligenceBannerDismissed: boolean;
  setSmartCleanupOpen: (open: boolean) => void;
  dismissIntelligenceBanner: () => void;
  runFolderIntelligenceScan: () => Promise<void>;

  // Bandwidth & Cache
  downloadLimitBps: number;
  uploadLimitBps: number;

  // Desktop & FUSE
  isDefaultFileManager: boolean;
  accountMountPaths: Record<string, string | null>;
  checkDefaultFileManager: () => Promise<void>;
  setAsDefaultFileManager: () => Promise<void>;
  mountAccountVfs: (accountId: string) => Promise<string>;
  unmountAccountVfs: (accountId: string) => Promise<void>;
  loadAccountMountPaths: () => Promise<void>;

  // Appearance Theme & Font Size
  theme: "system" | "light" | "dark";
  setTheme: (theme: "system" | "light" | "dark") => void;
  fontSize: number;
  setFontSize: (size: number) => void;

  // i18n
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;

  // Toast notifications
  toast: { message: string; withUndo: boolean } | null;
  showToast: (message: string, withUndo?: boolean) => void;
  clearToast: () => void;

  // Actions
  loadAccounts: () => Promise<void>;
  loadEntries: () => Promise<void>;
  navigateTo: (
    accountId: string | null,
    folderId: string | null,
    name: string,
    isRoot?: boolean
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
  setAddCloudOpen: (open: boolean) => void;
  reauthAccount: AccountRecord | null;
  setReauthAccount: (acc: AccountRecord | null) => void;
  updateAccountCredentials: (
    accountId: string,
    token: string,
    refreshToken?: string
  ) => Promise<void>;
  openVersionHistory: (entry: EntryRecord) => void;
  closeVersionHistory: () => void;

  // Cloud & Sync
  connectGoogleDrive: (
    name?: string,
    email?: string,
    accessToken?: string,
    refreshToken?: string,
    clientId?: string,
    clientSecret?: string
  ) => Promise<void>;
  addOneDriveAccount: (name?: string, email?: string, token?: string) => Promise<void>;
  addGenericAccount: (
    providerType: string,
    name: string,
    endpoint: string,
    username?: string,
    password?: string,
    bucket?: string
  ) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
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

  // Operations & Progress Jobs
  activeJobs: ActiveJob[];
  addActiveJob: (job: ActiveJob) => void;
  updateActiveJob: (id: string, updates: Partial<ActiveJob>) => void;
  removeActiveJob: (id: string) => void;
  cancelActiveJob: (id: string) => void;

  openItem: (entry: EntryRecord) => Promise<void>;
  hydrateItem: (id: string) => Promise<void>;
  freeUpSpaceItem: (id: string) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameItem: (id: string, newName: string) => Promise<void>;
  trashSelected: (
    explicitIds?: string[],
    options?: {
      onProgress?: (completed: number, total: number, currentName?: string) => void;
      signal?: AbortSignal;
    }
  ) => Promise<{ success: boolean; trashedCount: number; errors: string[] }>;
  deletePermanently: (
    explicitIds?: string[],
    options?: {
      onProgress?: (completed: number, total: number, currentName?: string) => void;
      signal?: AbortSignal;
    }
  ) => Promise<{ success: boolean; deletedCount: number; errors: string[] }>;
  undoLastOperation: () => Promise<void>;
  redoLastOperation: () => Promise<void>;
  batchRename: (previews: Array<{ id: string; oldName: string; newName: string }>) => Promise<void>;
  moveItems: (entryIds: string[], targetParentId: string | null) => Promise<void>;
  copyItems: (entryIds: string[], targetParentId: string | null, collision?: "replace" | "skip" | "keep_both") => Promise<void>;
  compressItems: (sourcePaths: string[], outputPath: string) => Promise<void>;
  compressFileToSize: (
    sourcePath: string,
    targetBytes: number,
    formattedSize: string,
    outputPath?: string
  ) => Promise<{ output_path: string; original_size: number; compressed_size: number }>;
  extractArchive: (archivePath: string, destinationDir: string) => Promise<void>;

  // Clipboard & Selection Actions
  clipboard: ClipboardState | null;
  copySelected: (explicitEntries?: EntryRecord[]) => void;
  cutSelected: (explicitEntries?: EntryRecord[]) => void;
  pasteClipboard: (targetFolderId?: string | null) => Promise<void>;
  duplicateSelected: (explicitEntries?: EntryRecord[]) => Promise<void>;
  clearClipboard: () => void;
}

const userHome =
  typeof window !== "undefined" && (window as any).__USER_HOME__
    ? (window as any).__USER_HOME__
    : "/home/abhi";

const initialPath =
  typeof window !== "undefined" && (window as any).__INITIAL_PATH__
    ? (window as any).__INITIAL_PATH__
    : userHome;

const initialTitle =
  initialPath === userHome
    ? "Home"
    : initialPath.split("/").filter(Boolean).pop() || "Folder";

const initialBreadcrumbs: BreadcrumbItem[] = [{ id: initialPath, name: initialTitle }];
const initialTabId = "tab_initial_1";
const initialTab: TabItem = {
  id: initialTabId,
  title: initialTitle,
  accountId: null,
  folderId: initialPath,
  breadcrumbs: initialBreadcrumbs,
  history: [{ accountId: null, folderId: initialPath, breadcrumbs: initialBreadcrumbs }],
  historyIndex: 0,
};

const jobAbortControllers = new Map<string, AbortController>();

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  activeJobs: [],
  addActiveJob: (job: ActiveJob) =>
    set((state) => ({ activeJobs: [...state.activeJobs.filter((j) => j.id !== job.id), job] })),
  updateActiveJob: (id: string, updates: Partial<ActiveJob>) =>
    set((state) => ({
      activeJobs: state.activeJobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
    })),
  removeActiveJob: (id: string) =>
    set((state) => ({ activeJobs: state.activeJobs.filter((j) => j.id !== id) })),
  cancelActiveJob: (id: string) => {
    const controller = jobAbortControllers.get(id);
    if (controller) {
      controller.abort();
    }
    set((state) => ({
      activeJobs: state.activeJobs.map((j) =>
        j.id === id ? { ...j, status: "cancelled" } : j
      ),
    }));
  },

  tabs: [initialTab],
  activeTabId: initialTabId,
  currentAccountId: null,
  currentFolderId: userHome,
  breadcrumbs: initialBreadcrumbs,
  history: [{ accountId: null, folderId: userHome, breadcrumbs: initialBreadcrumbs }],
  historyIndex: 0,

  accounts: [],
  entries: [],
  totalEntriesCount: 0,
  isLoading: false,
  selectedIds: new Set(),
  lastSelectedAnchorId: null,
  clipboard: null,

  viewMode: "list",
  sortBy: "name",
  sortDirection: "asc",
  showHidden: false,
  searchQuery: "",
  isGlobalSearch: false,
  pendingUploadsCount: 0,

  isDetailsPaneOpen: false,
  isPreviewPaneOpen: (typeof window !== "undefined" && localStorage.getItem("ar_files_preview_pane") === "true") || false,
  togglePreviewPane: () => {
    const next = !get().isPreviewPaneOpen;
    try {
      localStorage.setItem("ar_files_preview_pane", String(next));
    } catch {}
    set({ isPreviewPaneOpen: next });
  },
  setPreviewPaneOpen: (open: boolean) => {
    try {
      localStorage.setItem("ar_files_preview_pane", String(open));
    } catch {}
    set({ isPreviewPaneOpen: open });
  },
  isQuickPreviewOpen: false,
  isPreferencesOpen: false,
  isDiagnosticsOpen: false,
  isVersionHistoryOpen: false,
  versionHistoryEntry: null,
  isAddCloudOpen: false,
  folderIntelligence: null,
  isAnalyzingIntelligence: false,
  isSmartCleanupOpen: false,
  isIntelligenceBannerDismissed: false,
  setSmartCleanupOpen: (open: boolean) => set({ isSmartCleanupOpen: open }),
  dismissIntelligenceBanner: () => set({ isIntelligenceBannerDismissed: true }),
  reauthAccount: null,
  setReauthAccount: (acc: AccountRecord | null) => set({ reauthAccount: acc }),

  downloadLimitBps: 0,
  uploadLimitBps: 0,

  isDefaultFileManager: false,
  accountMountPaths: {},
  theme: (typeof window !== "undefined" && (localStorage.getItem("ar_files_theme") as "system" | "light" | "dark")) || "system",
  setTheme: (theme: "system" | "light" | "dark") => {
    try {
      localStorage.setItem("ar_files_theme", theme);
      if (typeof document !== "undefined") {
        if (theme === "light") {
          document.documentElement.setAttribute("data-theme", "light");
        } else if (theme === "dark") {
          document.documentElement.setAttribute("data-theme", "dark");
        } else {
          document.documentElement.removeAttribute("data-theme");
        }
      }
    } catch {}
    set({ theme });
  },
  fontSize:
    (typeof window !== "undefined" &&
      parseInt(localStorage.getItem("ar_files_font_size") || "14", 10)) ||
    14,
  setFontSize: (size: number) => {
    try {
      const clamped = Math.max(10, Math.min(24, size));
      localStorage.setItem("ar_files_font_size", clamped.toString());
      applyAppFontSize(clamped);
      set({ fontSize: clamped });
    } catch {
      set({ fontSize: size });
    }
  },
  language: (typeof window !== "undefined" && (localStorage.getItem("ar_files_language") as LanguageCode)) || "en",
  setLanguage: (language: LanguageCode) => {
    try {
      localStorage.setItem("ar_files_language", language);
    } catch {}
    set({ language });
  },

  toast: null,
  showToast: (message: string, withUndo = false) => {
    set({ toast: { message, withUndo } });
    setTimeout(() => {
      const cur = get().toast;
      if (cur && cur.message === message) {
        set({ toast: null });
      }
    }, withUndo ? 6000 : 3500);
  },
  clearToast: () => set({ toast: null }),

  loadAccounts: async () => {
    try {
      const accounts = await invokeCommand<AccountRecord[]>("list_accounts");
      if (Array.isArray(accounts)) {
        set((state) => {
          const byId = new Map<string, AccountRecord>();
          for (const a of accounts) byId.set(a.id, a);
          for (const a of state.accounts) {
            if (!byId.has(a.id)) byId.set(a.id, a);
          }
          return { accounts: Array.from(byId.values()) };
        });
      }
      get().loadAccountMountPaths();
      get().checkDefaultFileManager();
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
      let rawItems: EntryRecord[] = [];
      let total = 0;

      if (currentAccountId === null) {
        // Local Filesystem
        const homePath =
          typeof window !== "undefined" && (window as any).__USER_HOME__
            ? (window as any).__USER_HOME__
            : "/home/abhi";
        const dirPath = currentFolderId || homePath;
        const res = await invokeCommand<{ items: EntryRecord[]; total_count: number }>(
          "list_local_directory",
          { path: dirPath }
        );
        rawItems = res?.items || [];
        total = res?.total_count || rawItems.length;
      } else {
        // Cloud Account
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
        rawItems = res?.items || [];
        total = res?.total_count || rawItems.length;
      }

      // Filter hidden if not enabled
      let visible = showHidden
        ? rawItems
        : rawItems.filter((e) => !e.name.startsWith("."));

      // Filter query for local files
      if (searchQuery.trim() && !isGlobalSearch) {
        const q = searchQuery.toLowerCase();
        visible = visible.filter((e) => e.name.toLowerCase().includes(q));
      }

      // Sort with folders first and natural alphanumeric collation
      const sorted = [...visible].sort((a, b) => {
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

      set({
        entries: sorted,
        totalEntriesCount: total,
        isLoading: false,
      });

      // Automatically run folder intelligence scan in background
      get().runFolderIntelligenceScan();
    } catch (err: any) {
      console.error("Failed to load entries", err);
      const msg = err?.message || String(err);
      if (msg.includes("Permission denied")) {
        get().showToast("Permission denied: cannot read folder contents. Elevated privileges required.");
      } else {
        get().showToast(`Failed to open folder: ${msg}`);
      }
      set({ isLoading: false, entries: [], totalEntriesCount: 0 });
    }
  },

  navigateTo: (accountId, folderId, name, isRoot = false) => {
    const {
      breadcrumbs,
      history,
      historyIndex,
      currentFolderId,
      currentAccountId,
      tabs,
      activeTabId,
    } = get();

    if (folderId === currentFolderId && accountId === currentAccountId) return;

    const homePath =
      typeof window !== "undefined" && (window as any).__USER_HOME__
        ? (window as any).__USER_HOME__
        : "/home/abhi";

    let newCrumbs: BreadcrumbItem[];

    if (accountId === null) {
      // Local directory navigation
      const targetPath = folderId || homePath;
      if (isRoot || targetPath === homePath) {
        if (targetPath === homePath) {
          newCrumbs = [{ id: homePath, name: "Home" }];
        } else if (targetPath.startsWith(homePath + "/")) {
          newCrumbs = [{ id: homePath, name: "Home" }];
          const rel = targetPath.slice(homePath.length + 1);
          const parts = rel.split("/").filter(Boolean);
          let curr = homePath;
          for (const part of parts) {
            curr = curr + "/" + part;
            newCrumbs.push({ id: curr, name: part });
          }
        } else if (targetPath.includes("/.local/share/Trash")) {
          newCrumbs = [{ id: targetPath, name: "Trash" }];
        } else {
          // System root or absolute path
          newCrumbs = [{ id: "/", name: "/" }];
          const parts = targetPath.split("/").filter(Boolean);
          let curr = "";
          for (const part of parts) {
            curr = curr + "/" + part;
            newCrumbs.push({ id: curr, name: part });
          }
        }
      } else {
        // Check if target is already in existing breadcrumb trail
        const existingIdx = breadcrumbs.findIndex((c) => c.id === targetPath);
        if (existingIdx >= 0) {
          newCrumbs = breadcrumbs.slice(0, existingIdx + 1);
        } else if (targetPath.startsWith(homePath + "/")) {
          newCrumbs = [{ id: homePath, name: "Home" }];
          const rel = targetPath.slice(homePath.length + 1);
          const parts = rel.split("/").filter(Boolean);
          let curr = homePath;
          for (const part of parts) {
            curr = curr + "/" + part;
            newCrumbs.push({ id: curr, name: part });
          }
        } else {
          newCrumbs = [...breadcrumbs, { id: targetPath, name }];
        }
      }
    } else {
      // Cloud account navigation
      if (isRoot || folderId === null || accountId !== currentAccountId) {
        newCrumbs = [{ id: null, name }];
      } else {
        const existingIdx = breadcrumbs.findIndex((c) => c.id === folderId);
        if (existingIdx >= 0) {
          newCrumbs = breadcrumbs.slice(0, existingIdx + 1);
        } else {
          newCrumbs = [...breadcrumbs, { id: folderId, name }];
        }
      }
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
      folderIntelligence: null,
      isIntelligenceBannerDismissed: false,
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
        folderIntelligence: null,
        isIntelligenceBannerDismissed: false,
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
        folderIntelligence: null,
        isIntelligenceBannerDismissed: false,
      });
      get().loadEntries();
    }
  },

  goUp: () => {
    const { breadcrumbs, currentAccountId, currentFolderId, tabs, activeTabId } = get();

    if (currentAccountId === null) {
      // Local filesystem navigation
      const homePath =
        typeof window !== "undefined" && (window as any).__USER_HOME__
          ? (window as any).__USER_HOME__
          : "/home/abhi";
      const curr = currentFolderId || homePath;
      if (curr === "/" || !curr) return;

      const lastSlash = curr.lastIndexOf("/");
      const parentDir = lastSlash > 0 ? curr.slice(0, lastSlash) : "/";
      const parentName = parentDir === "/" ? "/" : parentDir.slice(parentDir.lastIndexOf("/") + 1);
      get().navigateTo(null, parentDir, parentName, true);
      return;
    }

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
      folderIntelligence: null,
      isIntelligenceBannerDismissed: false,
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
      folderIntelligence: null,
      isIntelligenceBannerDismissed: false,
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

  setAddCloudOpen: (open: boolean) => {
    set({ isAddCloudOpen: open });
  },

  runFolderIntelligenceScan: async () => {
    const { currentAccountId, currentFolderId, accountMountPaths } = get();
    set({ isAnalyzingIntelligence: true });

    try {
      if (currentAccountId === null) {
        // Local Filesystem
        const homePath =
          typeof window !== "undefined" && (window as any).__USER_HOME__
            ? (window as any).__USER_HOME__
            : "/home/abhi";
        const targetPath = currentFolderId || homePath;
        const res = await invokeCommand<FolderIntelligenceResult>("analyze_folder_intelligence", {
          path: targetPath,
        });
        if (res && res.summary) {
          set({ folderIntelligence: res, isAnalyzingIntelligence: false });
        } else {
          set({ folderIntelligence: null, isAnalyzingIntelligence: false });
        }
      } else {
        // Cloud Drive
        // 1. Invoke backend analyze_folder_intelligence with account_id and parent_id
        try {
          const res = await invokeCommand<FolderIntelligenceResult>("analyze_folder_intelligence", {
            account_id: currentAccountId,
            parent_id: currentFolderId,
          });
          if (res && res.summary) {
            set({ folderIntelligence: res, isAnalyzingIntelligence: false });
            return;
          }
        } catch (ipcErr) {
          console.warn("Backend cloud intelligence failed, checking FUSE/fallback:", ipcErr);
        }

        const mount = accountMountPaths[currentAccountId];
        if (mount) {
          const res = await invokeCommand<FolderIntelligenceResult>("analyze_folder_intelligence", {
            path: mount,
          });
          if (res && res.summary) {
            set({ folderIntelligence: res, isAnalyzingIntelligence: false });
            return;
          }
        }

        // In-memory analysis fallback from displayed entries in cloud panel
        const currentEntries = get().entries;
        const validFiles = currentEntries.filter((e) => !e.is_directory && e.size > 0);

        const normalizeStem = (name: string): string => {
          let s = name.trim().replace(/^#+/, "").trim();
          const dot = s.lastIndexOf(".");
          let stem = dot > 0 ? s.slice(0, dot) : s;
          const ext = dot > 0 ? s.slice(dot).toLowerCase() : "";
          stem = stem.replace(/\s*\(\d+\)$/, "");
          stem = stem.replace(/[\s_-]*copy$/i, "");
          stem = stem.replace(/\s*\([Rr]ecovered\)$/, "");
          return stem.toLowerCase().trim() + ext;
        };

        const parentArr = validFiles.map((_, idx) => idx);
        const findRoot = (i: number): number => {
          if (parentArr[i] !== i) parentArr[i] = findRoot(parentArr[i]);
          return parentArr[i];
        };
        const unionRoot = (i: number, j: number) => {
          const ri = findRoot(i);
          const rj = findRoot(j);
          if (ri !== rj) parentArr[ri] = rj;
        };

        const byHash = new Map<string, number[]>();
        const byNormName = new Map<string, number[]>();

        validFiles.forEach((f, idx) => {
          if (f.content_hash && f.content_hash.trim()) {
            const h = f.content_hash.trim();
            const list = byHash.get(h) || [];
            list.push(idx);
            byHash.set(h, list);
          }
          const norm = normalizeStem(f.name);
          const list = byNormName.get(norm) || [];
          list.push(idx);
          byNormName.set(norm, list);
        });

        byHash.forEach((idxs) => {
          if (idxs.length > 1) {
            for (let k = 1; k < idxs.length; k++) unionRoot(idxs[0], idxs[k]);
          }
        });

        byNormName.forEach((idxs) => {
          if (idxs.length > 1) {
            for (let i = 0; i < idxs.length; i++) {
              for (let j = i + 1; j < idxs.length; j++) {
                const sz1 = validFiles[idxs[i]].size;
                const sz2 = validFiles[idxs[j]].size;
                const maxSz = Math.max(sz1, sz2);
                const minSz = Math.min(sz1, sz2);
                const diff = maxSz - minSz;
                if (sz1 === sz2 || diff / maxSz <= 0.05 || diff <= 15360) {
                  unionRoot(idxs[i], idxs[j]);
                }
              }
            }
          }
        });

        const clusters = new Map<number, EntryRecord[]>();
        validFiles.forEach((f, idx) => {
          const rootIdx = findRoot(idx);
          const list = clusters.get(rootIdx) || [];
          list.push(f);
          clusters.set(rootIdx, list);
        });

        const duplicateFiles: DuplicateGroup[] = [];
        let reclaimable = 0;
        let dupFileCount = 0;

        clusters.forEach((group, rootIdx) => {
          if (group.length > 1) {
            const sortedGroup = [...group].sort((a, b) => {
              const ca = a.ctime || a.mtime;
              const cb = b.ctime || b.mtime;
              return ca - cb;
            });
            const maxSz = Math.max(...sortedGroup.map((it) => it.size));
            const groupSum = sortedGroup.reduce((acc, it) => acc + it.size, 0);
            const rec = groupSum - maxSz;
            reclaimable += rec;
            dupFileCount += sortedGroup.length;
            duplicateFiles.push({
              hash: `cluster_${rootIdx}`,
              size: maxSz,
              reclaimable_bytes: rec,
              items: sortedGroup.map((item) => ({
                id: item.id,
                name: item.name,
                path: item.path,
                size: item.size,
                mtime: item.mtime,
                ctime: item.ctime || item.mtime,
                thumbnail_url: item.thumbnail_url || null,
              })),
            });
          }
        });

        const res: FolderIntelligenceResult = {
          empty_folders: [],
          duplicate_files: duplicateFiles,
          duplicate_folders: [],
          summary: {
            empty_folder_count: 0,
            duplicate_group_count: duplicateFiles.length,
            duplicate_file_count: dupFileCount,
            duplicate_folder_group_count: 0,
            reclaimable_bytes: reclaimable,
          },
        };
        set({ folderIntelligence: res, isAnalyzingIntelligence: false });
      }
    } catch (err) {
      console.warn("Folder intelligence scan failed:", err);
      set({ folderIntelligence: null, isAnalyzingIntelligence: false });
    }
  },

  openVersionHistory: (entry: EntryRecord) => {
    set({ isVersionHistoryOpen: true, versionHistoryEntry: entry });
  },

  closeVersionHistory: () => {
    set({ isVersionHistoryOpen: false, versionHistoryEntry: null });
  },

  connectGoogleDrive: async (
    name = "Google Drive",
    email = "user@gmail.com",
    accessToken?: string,
    refreshToken?: string,
    clientId?: string,
    clientSecret?: string
  ) => {
    try {
      const newAcc = await invokeCommand<AccountRecord>("start_google_oauth", {
        account_name: name,
        email,
        access_token: accessToken || undefined,
        refresh_token: refreshToken || undefined,
        client_id: clientId || undefined,
        client_secret: clientSecret || undefined,
      });
      if (newAcc && newAcc.id) {
        set((state) => ({
          accounts: [...state.accounts.filter((a) => a.id !== newAcc.id), newAcc],
        }));
        get().navigateTo(newAcc.id, null, newAcc.name, true);
        get().showToast(`Connected to ${newAcc.name} (${newAcc.email || email}) successfully`);
      }
      await get().loadAccounts();
    } catch (err) {
      console.error("Connect Google Drive failed", err);
      throw err;
    }
  },

  updateAccountCredentials: async (
    accountId: string,
    token: string,
    refreshToken?: string
  ) => {
    try {
      await invokeCommand("update_account_credentials", {
        account_id: accountId,
        token,
        refresh_token: refreshToken || undefined,
      });
      await get().loadAccounts();
      await get().loadEntries();
      await get().refreshSyncStatus(accountId);
      const acc = get().accounts.find((a) => a.id === accountId);
      get().showToast(
        `Credentials updated for ${acc?.name || "account"}. Synchronizing...`
      );
    } catch (err: any) {
      console.error("Failed to update account credentials:", err);
      throw err;
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

  openItem: async (entry: EntryRecord) => {
    // 0. If in picker mode (File Chooser portal)
    if (typeof window !== "undefined" && (window as any).__PICKER_MODE__?.active) {
      if (entry.is_directory) {
        const targetFolder = get().currentAccountId ? entry.id : (entry.path || entry.id);
        get().navigateTo(get().currentAccountId, targetFolder, entry.name, false);
        return;
      }
      window.dispatchEvent(new CustomEvent("ar-picker-confirm", { detail: { entry } }));
      return;
    }

    // 1. If it's a folder, navigate into it
    if (entry.is_directory) {
      const targetFolder = get().currentAccountId ? entry.id : (entry.path || entry.id);
      get().navigateTo(get().currentAccountId, targetFolder, entry.name, false);
      return;
    }

    // 2. If it's a local filesystem file, launch directly
    if (entry.account_id === "acc_local" && entry.path) {
      await invokeCommand("open_file", { path: entry.path });
      return;
    }

    // 3. If it's already cached locally and available
    if (entry.local_path && (entry.state === "available" || entry.state === "pinned")) {
      try {
        await invokeCommand("open_file", { path: entry.local_path, entry_id: entry.id });
        return;
      } catch (err) {
        console.warn("Cached file failed to open directly, re-downloading...", err);
      }
    }

    // 4. Cloud file needs to be downloaded first
    try {
      // Show rotating sync badge on icon
      set((state) => ({
        entries: state.entries.map((e) =>
          e.id === entry.id ? { ...e, state: "hydrating", error_message: null } : e
        ),
      }));

      // Trigger download from cloud
      const res = await invokeCommand<any>("hydrate_entry", { entry_id: entry.id });
      const downloadedPath = typeof res === "string" ? res : res?.data || res?.local_path;

      // Reload entries to display green checkmark badge
      await get().loadEntries();

      // Automatically open downloaded file with default system application
      const finalLocalPath =
        downloadedPath ||
        get().entries.find((e) => e.id === entry.id)?.local_path;

      if (finalLocalPath) {
        await invokeCommand("open_file", { path: finalLocalPath, entry_id: entry.id });
      } else {
        await invokeCommand("open_file", { entry_id: entry.id });
      }
    } catch (err: any) {
      console.error("Failed to download and open file:", err);
      await get().loadEntries();

      const errMsg = err?.message || String(err);
      const isAuthError =
        errMsg.includes("401") ||
        errMsg.includes("UNAUTHENTICATED") ||
        errMsg.includes("AuthRequired") ||
        errMsg.includes("Authentication required") ||
        errMsg.includes("invalid_grant") ||
        errMsg.includes("Unauthorized") ||
        errMsg.includes("token rejected");

      if (isAuthError) {
        const acc = get().accounts.find((a) => a.id === entry.account_id);
        if (acc) {
          set({ reauthAccount: acc });
          get().showToast(
            `Session expired for ${acc.name}. Please provide a new token to reconnect.`
          );
        }
      } else {
        get().showToast(`Error opening file: ${errMsg}`);
      }
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

  addOneDriveAccount: async (name = "OneDrive", email = "user@live.com", token?: string) => {
    try {
      const newAcc = await invokeCommand<AccountRecord>("add_onedrive_account", {
        name,
        email,
        token: token || undefined,
      });
      if (newAcc && newAcc.id) {
        set((state) => ({
          accounts: [...state.accounts.filter((a) => a.id !== newAcc.id), newAcc],
        }));
        get().navigateTo(newAcc.id, null, newAcc.name, true);
        get().showToast(`Connected to ${newAcc.name} (${newAcc.email || email}) successfully`);
      }
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
      const newAcc = await invokeCommand<AccountRecord>("add_generic_account", {
        provider_type: providerType,
        name,
        endpoint,
        username,
        password,
        bucket,
      });
      if (newAcc && newAcc.id) {
        set((state) => ({
          accounts: [...state.accounts.filter((a) => a.id !== newAcc.id), newAcc],
        }));
        get().navigateTo(newAcc.id, null, newAcc.name, true);
        get().showToast(`Connected to ${newAcc.name} successfully`);
      }
      await get().loadAccounts();
    } catch (err) {
      console.error("Failed to add generic account", err);
      throw err;
    }
  },

  removeAccount: async (accountId: string) => {
    try {
      await invokeCommand("remove_account", { account_id: accountId });
      const { currentAccountId, accounts, tabs, activeTabId } = get();
      const userHome =
        typeof window !== "undefined" && (window as any).__USER_HOME__
          ? (window as any).__USER_HOME__
          : "/home/abhi";

      // If active tab or current folder is inside the removed account, navigate to userHome
      if (currentAccountId === accountId) {
        get().navigateTo(null, userHome, "Home", true);
      }

      // Filter tabs that belonged to this account
      const remainingTabs = tabs.filter((t) => t.accountId !== accountId);
      if (remainingTabs.length === 0) {
        get().openNewTab(null, userHome, "Home");
      } else {
        const stillActive = remainingTabs.some((t) => t.id === activeTabId);
        set({
          tabs: remainingTabs,
          activeTabId: stillActive ? activeTabId : remainingTabs[0].id,
        });
      }

      set({
        accounts: accounts.filter((a) => a.id !== accountId),
      });
    } catch (err) {
      console.error("Failed to remove account", err);
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

  trashSelected: async (
    explicitIds?: string[],
    options?: {
      onProgress?: (completed: number, total: number, currentName?: string) => void;
      signal?: AbortSignal;
    }
  ) => {
    const { selectedIds, entries } = get();
    const ids =
      explicitIds && explicitIds.length > 0
        ? explicitIds
        : Array.from(selectedIds);
    if (ids.length === 0) return { success: true, trashedCount: 0, errors: [] };

    const total = ids.length;
    let completed = 0;
    const errors: string[] = [];
    const isLarge = total > 5;
    const jobId = `job_trash_${Date.now()}`;
    const controller = new AbortController();

    if (isLarge) {
      jobAbortControllers.set(jobId, controller);
      get().addActiveJob({
        id: jobId,
        type: "trash",
        title: `Moving ${total} items to Trash`,
        itemsCompleted: 0,
        totalItems: total,
        bytesProcessed: 0,
        totalBytes: 0,
        speedBps: 0,
        etaSeconds: null,
        status: "running",
      });
    }

    const nameMap = new Map<string, string>();
    for (const e of entries) {
      nameMap.set(e.id, e.name);
      if (e.path) nameMap.set(e.path, e.name);
    }

    const CHUNK_SIZE = 15;
    const startTime = Date.now();

    try {
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        if (options?.signal?.aborted || controller.signal.aborted) {
          console.warn("Trash operation cancelled");
          break;
        }

        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const firstId = chunk[0];
        const currentName = nameMap.get(firstId) || firstId.split("/").pop() || "item";

        const res = await invokeCommand<{ success: boolean; trashed?: string[]; errors?: string[] }>(
          "trash_entries",
          { entry_ids: chunk }
        );

        if (res && res.errors && res.errors.length > 0) {
          errors.push(...res.errors);
        }

        completed += chunk.length;
        const currentCompleted = Math.min(completed, total);

        options?.onProgress?.(currentCompleted, total, currentName);

        if (isLarge) {
          const elapsedSec = (Date.now() - startTime) / 1000;
          const speedItems = elapsedSec > 0 ? currentCompleted / elapsedSec : 0;
          const remainingItems = total - currentCompleted;
          const eta = speedItems > 0 ? Math.ceil(remainingItems / speedItems) : null;

          get().updateActiveJob(jobId, {
            itemsCompleted: currentCompleted,
            etaSeconds: eta,
          });
        }

        if (ids.length > CHUNK_SIZE) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      set({ selectedIds: new Set(), lastSelectedAnchorId: null });
      await get().loadEntries();

      if (isLarge) {
        get().updateActiveJob(jobId, {
          status: options?.signal?.aborted || controller.signal.aborted ? "cancelled" : "completed",
          itemsCompleted: completed,
        });
        setTimeout(() => {
          get().removeActiveJob(jobId);
          jobAbortControllers.delete(jobId);
        }, 1200);
      }

      return {
        success: errors.length === 0,
        trashedCount: completed,
        errors,
      };
    } catch (err: any) {
      console.error("Trash failed", err);
      if (isLarge) {
        get().updateActiveJob(jobId, { status: "failed" });
        setTimeout(() => {
          get().removeActiveJob(jobId);
          jobAbortControllers.delete(jobId);
        }, 2000);
      }
      throw err;
    }
  },

  deletePermanently: async (
    explicitIds?: string[],
    options?: {
      onProgress?: (completed: number, total: number, currentName?: string) => void;
      signal?: AbortSignal;
    }
  ) => {
    const { selectedIds, entries } = get();
    const ids =
      explicitIds && explicitIds.length > 0
        ? explicitIds
        : Array.from(selectedIds);
    if (ids.length === 0) return { success: true, deletedCount: 0, errors: [] };

    const total = ids.length;
    let completed = 0;
    const errors: string[] = [];
    const isLarge = total > 5;
    const jobId = `job_delete_${Date.now()}`;
    const controller = new AbortController();

    if (isLarge) {
      jobAbortControllers.set(jobId, controller);
      get().addActiveJob({
        id: jobId,
        type: "delete",
        title: `Permanently deleting ${total} items`,
        itemsCompleted: 0,
        totalItems: total,
        bytesProcessed: 0,
        totalBytes: 0,
        speedBps: 0,
        etaSeconds: null,
        status: "running",
      });
    }

    const nameMap = new Map<string, string>();
    for (const e of entries) {
      nameMap.set(e.id, e.name);
      if (e.path) nameMap.set(e.path, e.name);
    }

    const CHUNK_SIZE = 15;
    const startTime = Date.now();

    try {
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        if (options?.signal?.aborted || controller.signal.aborted) {
          console.warn("Permanent delete cancelled");
          break;
        }

        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const firstId = chunk[0];
        const currentName = nameMap.get(firstId) || firstId.split("/").pop() || "item";

        const res = await invokeCommand<{ success: boolean; errors?: string[] }>(
          "delete_permanently",
          { entry_ids: chunk }
        );

        if (res && res.errors && res.errors.length > 0) {
          errors.push(...res.errors);
        }

        completed += chunk.length;
        const currentCompleted = Math.min(completed, total);

        options?.onProgress?.(currentCompleted, total, currentName);

        if (isLarge) {
          const elapsedSec = (Date.now() - startTime) / 1000;
          const speedItems = elapsedSec > 0 ? currentCompleted / elapsedSec : 0;
          const remainingItems = total - currentCompleted;
          const eta = speedItems > 0 ? Math.ceil(remainingItems / speedItems) : null;

          get().updateActiveJob(jobId, {
            itemsCompleted: currentCompleted,
            etaSeconds: eta,
          });
        }

        if (ids.length > CHUNK_SIZE) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      set({ selectedIds: new Set(), lastSelectedAnchorId: null });
      await get().loadEntries();

      if (isLarge) {
        get().updateActiveJob(jobId, {
          status: options?.signal?.aborted || controller.signal.aborted ? "cancelled" : "completed",
          itemsCompleted: completed,
        });
        setTimeout(() => {
          get().removeActiveJob(jobId);
          jobAbortControllers.delete(jobId);
        }, 1200);
      }

      return {
        success: errors.length === 0,
        deletedCount: completed,
        errors,
      };
    } catch (err: any) {
      console.error("Permanent delete failed", err);
      if (isLarge) {
        get().updateActiveJob(jobId, { status: "failed" });
        setTimeout(() => {
          get().removeActiveJob(jobId);
          jobAbortControllers.delete(jobId);
        }, 2000);
      }
      throw err;
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
      throw err;
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
      throw err;
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

  compressFileToSize: async (sourcePath, targetBytes, formattedSize, outputPath) => {
    try {
      const res = await invokeCommand<{
        output_path: string;
        original_size: number;
        compressed_size: number;
      }>("compress_to_size", {
        source_path: sourcePath,
        target_bytes: targetBytes,
        formatted_size: formattedSize,
        output_path: outputPath,
      });
      await get().loadEntries();
      return res;
    } catch (err: any) {
      console.error("Compress to size failed", err);
      throw err;
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

  checkDefaultFileManager: async () => {
    try {
      const isDefault = await invokeCommand<boolean>("is_default_file_manager");
      set({ isDefaultFileManager: Boolean(isDefault) });
    } catch (err) {
      console.error("Failed to check default file manager", err);
    }
  },

  setAsDefaultFileManager: async () => {
    try {
      await invokeCommand<boolean>("set_as_default_file_manager");
      set({ isDefaultFileManager: true });
    } catch (err) {
      console.error("Failed to set as default file manager", err);
    }
  },

  mountAccountVfs: async (accountId: string) => {
    try {
      const acc = get().accounts.find((a) => a.id === accountId);
      const mountPath = await invokeCommand<string>("mount_account_vfs", {
        account_id: accountId,
        account_name: acc?.name,
      });
      set((state) => ({
        accountMountPaths: { ...state.accountMountPaths, [accountId]: mountPath },
        accounts: state.accounts.map((a) =>
          a.id === accountId ? { ...a, mount_path: mountPath } : a
        ),
      }));
      return mountPath;
    } catch (err) {
      console.error("Failed to mount account VFS", err);
      throw err;
    }
  },

  unmountAccountVfs: async (accountId: string) => {
    try {
      await invokeCommand<void>("unmount_account_vfs", {
        account_id: accountId,
      });
      set((state) => ({
        accountMountPaths: { ...state.accountMountPaths, [accountId]: null },
        accounts: state.accounts.map((a) =>
          a.id === accountId ? { ...a, mount_path: undefined } : a
        ),
      }));
    } catch (err) {
      console.error("Failed to unmount account VFS", err);
      throw err;
    }
  },

  loadAccountMountPaths: async () => {
    const { accounts } = get();
    const mountMap: Record<string, string | null> = {};
    for (const acc of accounts) {
      try {
        const p = await invokeCommand<string | null>("get_account_mount_path", {
          account_id: acc.id,
        });
        mountMap[acc.id] = p;
      } catch {
        mountMap[acc.id] = acc.mount_path || null;
      }
    }
    set({ accountMountPaths: mountMap });
  },

  copySelected: (explicitEntries) => {
    const { selectedIds, entries, currentAccountId, currentFolderId, showToast } = get();
    const target =
      explicitEntries && explicitEntries.length > 0
        ? explicitEntries
        : entries.filter((e) => selectedIds.has(e.id));
    if (target.length === 0) return;

    set({
      clipboard: {
        mode: "copy",
        entries: target,
        sourceAccountId: currentAccountId,
        sourceFolderId: currentFolderId,
      },
    });

    try {
      const paths = target.map((e) => e.path || e.id).join("\n");
      navigator.clipboard?.writeText(paths);
    } catch {}

    const count = target.length;
    showToast(count === 1 ? `Copied "${target[0].name}"` : `Copied ${count} items`);
  },

  cutSelected: (explicitEntries) => {
    const { selectedIds, entries, currentAccountId, currentFolderId, showToast } = get();
    const target =
      explicitEntries && explicitEntries.length > 0
        ? explicitEntries
        : entries.filter((e) => selectedIds.has(e.id));
    if (target.length === 0) return;

    set({
      clipboard: {
        mode: "cut",
        entries: target,
        sourceAccountId: currentAccountId,
        sourceFolderId: currentFolderId,
      },
    });

    try {
      const paths = target.map((e) => e.path || e.id).join("\n");
      navigator.clipboard?.writeText(paths);
    } catch {}

    const count = target.length;
    showToast(count === 1 ? `Cut "${target[0].name}"` : `Cut ${count} items`);
  },

  pasteClipboard: async (targetFolderId) => {
    const {
      clipboard,
      currentFolderId,
      showToast,
      addActiveJob,
      updateActiveJob,
      removeActiveJob,
    } = get();
    if (!clipboard || clipboard.entries.length === 0) return;

    const destFolder =
      targetFolderId !== undefined && targetFolderId !== null
        ? targetFolderId
        : currentFolderId;

    const entries = clipboard.entries;
    const totalItems = entries.length;
    const isCut = clipboard.mode === "cut";
    const opType: "move" | "copy" = isCut ? "move" : "copy";
    const opVerb = isCut ? "Moving" : "Copying";
    const pastVerb = isCut ? "Moved" : "Pasted";
    const totalBytes = entries.reduce((acc, e) => acc + (e.size || 0), 0);

    const jobId = `job_paste_${Date.now()}`;
    const controller = new AbortController();
    jobAbortControllers.set(jobId, controller);

    addActiveJob({
      id: jobId,
      type: opType,
      title:
        totalItems === 1
          ? `${opVerb} "${entries[0].name}"`
          : `${opVerb} ${totalItems} items`,
      itemsCompleted: 0,
      totalItems,
      bytesProcessed: 0,
      totalBytes,
      speedBps: 0,
      etaSeconds: null,
      status: "running",
    });

    const startTime = Date.now();
    let completedItems = 0;
    let processedBytes = 0;

    try {
      const chunkSize = totalItems <= 15 ? 1 : Math.min(10, Math.ceil(totalItems / 10));

      for (let i = 0; i < totalItems; i += chunkSize) {
        if (controller.signal.aborted) {
          console.warn("Paste operation aborted");
          break;
        }

        const chunk = entries.slice(i, i + chunkSize);
        const chunkIds = chunk.map((e) => e.path || e.id);

        if (isCut) {
          await invokeCommand("move_entries", {
            entry_ids: chunkIds,
            target_parent_id: destFolder,
          });
        } else {
          await invokeCommand("copy_entries", {
            entry_ids: chunkIds,
            target_parent_id: destFolder,
            collision: "keep_both",
          });
        }

        completedItems += chunk.length;
        const chunkBytes = chunk.reduce((acc, e) => acc + (e.size || 0), 0);
        processedBytes += chunkBytes;

        const elapsedSec = (Date.now() - startTime) / 1000;
        const speedBps =
          elapsedSec > 0 && processedBytes > 0
            ? Math.round(processedBytes / elapsedSec)
            : 0;
        const speedItems = elapsedSec > 0 ? completedItems / elapsedSec : 0;
        const remainingItems = totalItems - completedItems;
        const etaSeconds =
          speedItems > 0 && remainingItems > 0
            ? Math.ceil(remainingItems / speedItems)
            : null;

        updateActiveJob(jobId, {
          itemsCompleted: completedItems,
          bytesProcessed: processedBytes,
          speedBps,
          etaSeconds,
        });

        if (totalItems > 1) {
          await new Promise((r) => setTimeout(r, 15));
        }
      }

      await get().loadEntries();

      if (isCut) {
        set({ clipboard: null });
      }

      const isAborted = controller.signal.aborted;
      updateActiveJob(jobId, {
        status: isAborted ? "cancelled" : "completed",
        itemsCompleted: completedItems,
        bytesProcessed: processedBytes,
      });

      if (!isAborted) {
        showToast(
          totalItems === 1
            ? `${pastVerb} "${entries[0].name}"`
            : `${pastVerb} ${completedItems} item${completedItems > 1 ? "s" : ""}`
        );
      }

      setTimeout(() => {
        removeActiveJob(jobId);
        jobAbortControllers.delete(jobId);
      }, 1200);
    } catch (err: any) {
      console.error("Paste operation failed:", err);
      updateActiveJob(jobId, {
        status: "failed",
      });
      showToast(err.message || "Paste operation failed");
      setTimeout(() => {
        removeActiveJob(jobId);
        jobAbortControllers.delete(jobId);
      }, 2500);
      throw err;
    }
  },

  duplicateSelected: async (explicitEntries) => {
    const { selectedIds, entries, currentFolderId, copyItems, showToast } = get();
    const target =
      explicitEntries && explicitEntries.length > 0
        ? explicitEntries
        : entries.filter((e) => selectedIds.has(e.id));
    if (target.length === 0) return;

    const ids = target.map((e) => e.id);
    const count = ids.length;
    try {
      await copyItems(ids, currentFolderId, "keep_both");
      showToast(count === 1 ? `Duplicated "${target[0].name}"` : `Duplicated ${count} items`);
    } catch (err: any) {
      showToast(err.message || "Duplicate failed");
    }
  },

  clearClipboard: () => {
    set({ clipboard: null });
  },
}));
