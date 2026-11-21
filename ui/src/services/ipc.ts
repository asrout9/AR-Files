import {
  AccountRecord,
  EntryRecord,
  FolderListingQuery,
} from "../types";

// Tauri 2 window.__TAURI__ check
interface TauriWindow extends Window {
  __TAURI_INTERNALS__?: {
    invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
}

const isTauri = typeof window !== "undefined" && Boolean((window as TauriWindow).__TAURI_INTERNALS__);

export async function invokeCommand<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri) {
    const tauri = (window as TauriWindow).__TAURI_INTERNALS__;
    if (tauri?.invoke) {
      return (await tauri.invoke(cmd, args)) as T;
    }
  }

  // Fallback in-memory mock implementation for browser dev / testing
  return handleMockCommand<T>(cmd, args);
}

// In-memory mock data store for dev preview without full Tauri binary
let mockAccounts: AccountRecord[] = [
  {
    id: "acc_gdrive",
    provider_type: "google_drive",
    name: "Google Drive",
    email: "abhi@fedora.org",
    root_folder_id: "root_gdrive",
    quota_total: 15 * 1024 * 1024 * 1024,
    quota_used: 6.4 * 1024 * 1024 * 1024,
    sync_status: "idle",
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: "acc_onedrive",
    provider_type: "onedrive",
    name: "OneDrive Work",
    email: "abhi@enterprise.com",
    root_folder_id: "root_onedrive",
    quota_total: 1024 * 1024 * 1024 * 1024,
    quota_used: 128 * 1024 * 1024 * 1024,
    sync_status: "syncing",
    created_at: Date.now(),
    updated_at: Date.now(),
  },
];

let mockEntries: EntryRecord[] = [
  {
    id: "folder_docs",
    account_id: "acc_gdrive",
    parent_id: null,
    name: "Documents",
    path: "/Documents",
    is_directory: true,
    size: 0,
    mtime: Date.now() - 3600000,
    mime_type: "inode/directory",
    state: "available",
    sync_version: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: "folder_photos",
    account_id: "acc_gdrive",
    parent_id: null,
    name: "Photos & Media",
    path: "/Photos & Media",
    is_directory: true,
    size: 0,
    mtime: Date.now() - 7200000,
    mime_type: "inode/directory",
    state: "available",
    sync_version: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: "file_report",
    account_id: "acc_gdrive",
    parent_id: null,
    name: "Annual_Report_2026.pdf",
    path: "/Annual_Report_2026.pdf",
    is_directory: false,
    size: 4528190,
    mtime: Date.now() - 1800000,
    mime_type: "application/pdf",
    state: "available",
    local_path: "/home/user/.cache/content/file_report",
    sync_version: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: "file_budget",
    account_id: "acc_gdrive",
    parent_id: null,
    name: "Q4_Financial_Model.xlsx",
    path: "/Q4_Financial_Model.xlsx",
    is_directory: false,
    size: 18451000,
    mtime: Date.now() - 900000,
    mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    state: "cloud_only",
    sync_version: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: "file_archive",
    account_id: "acc_gdrive",
    parent_id: null,
    name: "Fedora_Backup_Raw.tar.gz",
    path: "/Fedora_Backup_Raw.tar.gz",
    is_directory: false,
    size: 1250000000,
    mtime: Date.now() - 86400000,
    mime_type: "application/gzip",
    state: "pinned",
    local_path: "/home/user/.cache/content/file_archive",
    sync_version: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  {
    id: "file_syncing",
    account_id: "acc_gdrive",
    parent_id: null,
    name: "Project_Notes_Draft.md",
    path: "/Project_Notes_Draft.md",
    is_directory: false,
    size: 84320,
    mtime: Date.now() - 60000,
    mime_type: "text/markdown",
    state: "syncing_up",
    sync_version: 1,
    created_at: Date.now(),
    updated_at: Date.now(),
  },
];

async function handleMockCommand<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "list_accounts":
      return mockAccounts as unknown as T;

    case "list_entries": {
      const q = (args.query || {}) as FolderListingQuery;
      let filtered = mockEntries.filter((e) => {
        if (q.parent_id !== undefined && e.parent_id !== q.parent_id) return false;
        if (q.account_id && e.account_id !== q.account_id) return false;
        if (!q.show_hidden && e.name.startsWith(".")) return false;
        if (q.filter && !e.name.toLowerCase().includes(q.filter.toLowerCase())) return false;
        return true;
      });

      // Sort
      filtered.sort((a, b) => {
        if (a.is_directory !== b.is_directory) {
          return a.is_directory ? -1 : 1;
        }
        if (q.sort_by === "size") {
          return q.sort_direction === "asc" ? a.size - b.size : b.size - a.size;
        }
        if (q.sort_by === "modified") {
          return q.sort_direction === "asc" ? a.mtime - b.mtime : b.mtime - a.mtime;
        }
        return q.sort_direction === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      });

      const total_count = filtered.length;
      const offset = q.offset || 0;
      const limit = q.limit || 50;
      const slice = filtered.slice(offset, offset + limit);

      return {
        items: slice,
        total_count,
        offset,
        limit,
        has_more: offset + slice.length < total_count,
      } as unknown as T;
    }

    case "hydrate_entry": {
      const id = args.id as string;
      const entry = mockEntries.find((e) => e.id === id);
      if (entry) {
        entry.state = "available";
      }
      return entry as unknown as T;
    }

    case "free_up_space": {
      const id = args.id as string;
      const entry = mockEntries.find((e) => e.id === id);
      if (entry) {
        entry.state = "cloud_only";
        entry.local_path = null;
      }
      return true as unknown as T;
    }

    case "create_folder": {
      const name = (args.name as string) || "New Folder";
      const pid = (args.parent_id as string) || null;
      const newDir: EntryRecord = {
        id: `folder_${Date.now()}`,
        account_id: "acc_gdrive",
        parent_id: pid,
        name,
        path: `/${name}`,
        is_directory: true,
        size: 0,
        mtime: Date.now(),
        mime_type: "inode/directory",
        state: "available",
        sync_version: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      mockEntries.unshift(newDir);
      return newDir as unknown as T;
    }

    case "trash_entries": {
      const ids = (args.entry_ids as string[]) || [];
      mockEntries = mockEntries.filter((e) => !ids.includes(e.id));
      return true as unknown as T;
    }

    case "rename_entry": {
      const id = args.id as string;
      const newName = args.new_name as string;
      const entry = mockEntries.find((e) => e.id === id);
      if (entry) {
        entry.name = newName;
      }
      return entry as unknown as T;
    }

    case "pin_item": {
      const id = args.id as string;
      const entry = mockEntries.find((e) => e.id === id);
      if (entry) {
        entry.state = "pinned";
      }
      return true as unknown as T;
    }

    case "unpin_item": {
      const id = args.id as string;
      const entry = mockEntries.find((e) => e.id === id);
      if (entry) {
        entry.state = "available";
      }
      return true as unknown as T;
    }

    case "search_all_accounts": {
      const query = ((args.query as string) || "").toLowerCase();
      const limit = (args.limit as number) || 50;
      const results = mockEntries
        .filter((e) => e.name.toLowerCase().includes(query))
        .slice(0, limit);
      return results as unknown as T;
    }

    case "get_file_versions": {
      const entryId = args.entry_id as string;
      const entry = mockEntries.find((e) => e.id === entryId);
      const versions = [
        {
          id: entryId,
          version_id: "v3",
          size: entry ? entry.size : 1024,
          modified_time: Date.now() - 3600000,
          author: "Current User",
          download_url: "https://cloud.provider.mock/v3",
        },
        {
          id: entryId,
          version_id: "v2",
          size: entry ? Math.round(entry.size * 0.9) : 900,
          modified_time: Date.now() - 86400000,
          author: "Current User",
          download_url: "https://cloud.provider.mock/v2",
        },
        {
          id: entryId,
          version_id: "v1",
          size: entry ? Math.round(entry.size * 0.75) : 750,
          modified_time: Date.now() - 172800000,
          author: "Alice Cooper",
          download_url: "https://cloud.provider.mock/v1",
        },
      ];
      return versions as unknown as T;
    }

    case "get_share_link": {
      const entryId = args.entry_id as string;
      return `https://files.cirrus.local/share/${entryId}` as unknown as T;
    }

    case "free_up_all_cache": {
      let evictedCount = 0;
      for (const entry of mockEntries) {
        if (entry.state === "available") {
          entry.state = "cloud_only";
          entry.local_path = null;
          evictedCount++;
        }
      }
      return evictedCount as unknown as T;
    }

    case "set_bandwidth_limits": {
      return true as unknown as T;
    }

    case "get_bandwidth_limits": {
      return [0, 0] as unknown as T;
    }

    case "get_diagnostics": {
      return {
        total_indexed_entries: mockEntries.length,
        wal_mode_enabled: true,
        active_providers_count: mockAccounts.length,
        download_limit_bps: 0,
        upload_limit_bps: 0,
        total_cache_bytes: 52428800, // 50 MB
        unresponsive_mounts: [],
      } as unknown as T;
    }

    case "generate_thumbnail": {
      return null as unknown as T;
    }

    case "add_onedrive_account": {
      const name = (args.name as string) || "OneDrive";
      const newAcc: AccountRecord = {
        id: `acc_onedrive_${Date.now()}`,
        provider_type: "onedrive",
        name,
        email: "user@live.com",
        root_folder_id: "root_onedrive",
        quota_total: 1024 * 1024 * 1024 * 1024,
        quota_used: 120 * 1024 * 1024 * 1024,
        sync_status: "idle",
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      mockAccounts.push(newAcc);
      return newAcc as unknown as T;
    }

    case "add_generic_account": {
      const ptype = (args.provider_type as string) || "webdav";
      const name = (args.name as string) || "Nextcloud";
      const newAcc: AccountRecord = {
        id: `acc_generic_${Date.now()}`,
        provider_type: ptype,
        name,
        email: null,
        root_folder_id: "root_generic",
        quota_total: 500 * 1024 * 1024 * 1024,
        quota_used: 45 * 1024 * 1024 * 1024,
        sync_status: "idle",
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      mockAccounts.push(newAcc);
      return newAcc as unknown as T;
    }

    default:
      return null as unknown as T;
  }
}
