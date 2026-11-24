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
  // WebKitGTK 6.0 Script Message Handler with reply
  const webkit = typeof window !== "undefined" && (window as any).webkit;
  if (webkit?.messageHandlers?.ar_ipc?.postMessage) {
    const res = await webkit.messageHandlers.ar_ipc.postMessage(JSON.stringify({ cmd, args }));
    const parsed = typeof res === "string" ? JSON.parse(res) : res;
    if (parsed) {
      if (parsed.unhandled) {
        throw new Error(parsed.error || `Command "${cmd}" is not handled by the host`);
      }
      if (parsed.success === false) {
        throw new Error(parsed.error || "Operation failed");
      }
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      if (parsed.success === true && parsed.data !== undefined) {
        return parsed.data as T;
      }
      return parsed as T;
    }
  }

  if (isTauri) {
    const tauri = (window as TauriWindow).__TAURI_INTERNALS__;
    if (tauri?.invoke) {
      return (await tauri.invoke(cmd, args)) as T;
    }
  }

  // Fallback in-memory mock implementation ONLY for pure browser / testing environments
  return handleMockCommand<T>(cmd, args);
}

// In-memory mock data store for dev preview without full Tauri binary
let mockDefaultFileManager = false;
let mockAccountMounts: Record<string, string> = {
  acc_gdrive: "/home/user/CloudDrives/Google_Drive",
};

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
    case "list_local_directory": {
      const targetPath = (args.path as string) || "/home/user";
      const localMockFiles: EntryRecord[] = [
        {
          id: `${targetPath}/Documents`,
          account_id: "acc_local",
          parent_id: targetPath,
          name: "Documents",
          path: `${targetPath}/Documents`,
          is_directory: true,
          size: 0,
          mtime: Date.now() - 3600000,
          mime_type: "inode/directory",
          state: "available",
          created_at: Date.now(),
          updated_at: Date.now(),
          sync_version: 1,
        },
        {
          id: `${targetPath}/Downloads`,
          account_id: "acc_local",
          parent_id: targetPath,
          name: "Downloads",
          path: `${targetPath}/Downloads`,
          is_directory: true,
          size: 0,
          mtime: Date.now() - 7200000,
          mime_type: "inode/directory",
          state: "available",
          created_at: Date.now(),
          updated_at: Date.now(),
          sync_version: 1,
        },
        {
          id: `${targetPath}/test_file.txt`,
          account_id: "acc_local",
          parent_id: targetPath,
          name: "test_file.txt",
          path: `${targetPath}/test_file.txt`,
          is_directory: false,
          size: 1024,
          mtime: Date.now() - 60000,
          mime_type: "text/plain",
          state: "available",
          created_at: Date.now(),
          updated_at: Date.now(),
          sync_version: 1,
        },
      ];
      return { items: localMockFiles, total_count: localMockFiles.length } as unknown as T;
    }

    case "open_file":
      return { success: true } as unknown as T;

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

    case "start_google_oauth": {
      const name = (args.account_name as string) || "Google Drive";
      const email = (args.email as string) || "user@gmail.com";
      const newAcc: AccountRecord = {
        id: `acc_gdrive_${Date.now()}`,
        provider_type: "google_drive",
        name,
        email,
        root_folder_id: "root_gdrive",
        quota_total: 15 * 1024 * 1024 * 1024,
        quota_used: 4.8 * 1024 * 1024 * 1024,
        sync_status: "idle",
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      mockAccounts.push(newAcc);
      mockEntries.push(
        {
          id: `folder_docs_${newAcc.id}`,
          account_id: newAcc.id,
          parent_id: null,
          name: "Documents",
          path: "/Documents",
          is_directory: true,
          size: 0,
          mtime: Date.now(),
          mime_type: "inode/directory",
          state: "available",
          sync_version: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        {
          id: `file_plan_${newAcc.id}`,
          account_id: newAcc.id,
          parent_id: null,
          name: "Project_Plan_2026.docx",
          path: "/Project_Plan_2026.docx",
          is_directory: false,
          size: 1542890,
          mtime: Date.now(),
          mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          state: "available",
          sync_version: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        {
          id: `file_guide_${newAcc.id}`,
          account_id: newAcc.id,
          parent_id: null,
          name: "Getting Started with Google Drive.pdf",
          path: "/Getting Started with Google Drive.pdf",
          is_directory: false,
          size: 2097152,
          mtime: Date.now(),
          mime_type: "application/pdf",
          state: "pinned",
          sync_version: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        }
      );
      return newAcc as unknown as T;
    }

    case "add_onedrive_account": {
      const name = (args.name as string) || "OneDrive";
      const email = (args.email as string) || "user@live.com";
      const newAcc: AccountRecord = {
        id: `acc_onedrive_${Date.now()}`,
        provider_type: "onedrive",
        name,
        email,
        root_folder_id: "root_onedrive",
        quota_total: 1024 * 1024 * 1024 * 1024,
        quota_used: 120 * 1024 * 1024 * 1024,
        sync_status: "idle",
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      mockAccounts.push(newAcc);
      mockEntries.push({
        id: `folder_m365_${newAcc.id}`,
        account_id: newAcc.id,
        parent_id: null,
        name: "Personal Vault",
        path: "/Personal Vault",
        is_directory: true,
        size: 0,
        mtime: Date.now(),
        mime_type: "inode/directory",
        state: "available",
        sync_version: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      return newAcc as unknown as T;
    }

    case "add_generic_account": {
      const ptype = (args.provider_type as string) || "webdav";
      const name = (args.name as string) || "Nextcloud";
      const newAcc: AccountRecord = {
        id: `acc_generic_${Date.now()}`,
        provider_type: ptype,
        name,
        email: (args.username as string) || null,
        root_folder_id: "root_generic",
        quota_total: 500 * 1024 * 1024 * 1024,
        quota_used: 45 * 1024 * 1024 * 1024,
        sync_status: "idle",
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      mockAccounts.push(newAcc);
      mockEntries.push({
        id: `folder_rem_${newAcc.id}`,
        account_id: newAcc.id,
        parent_id: null,
        name: "Remote_Files",
        path: "/Remote_Files",
        is_directory: true,
        size: 0,
        mtime: Date.now(),
        mime_type: "inode/directory",
        state: "available",
        sync_version: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      return newAcc as unknown as T;
    }

    case "remove_account": {
      const accId = args.account_id as string;
      mockAccounts = mockAccounts.filter((a) => a.id !== accId);
      mockEntries = mockEntries.filter((e) => e.account_id !== accId);
      delete mockAccountMounts[accId];
      return true as unknown as T;
    }

    case "update_account_credentials": {
      const accId = args.account_id as string;
      const acc = mockAccounts.find((a) => a.id === accId);
      if (acc) {
        acc.sync_status = "idle";
      }
      return true as unknown as T;
    }

    case "mount_account_vfs": {
      const accId = args.account_id as string;
      const accName =
        (args.account_name as string) ||
        mockAccounts.find((a) => a.id === accId)?.name ||
        "Drive";
      const mountPath = `/home/user/CloudDrives/${accName.replace(/ /g, "_")}`;
      mockAccountMounts[accId] = mountPath;
      const acc = mockAccounts.find((a) => a.id === accId);
      if (acc) acc.mount_path = mountPath;
      return mountPath as unknown as T;
    }

    case "unmount_account_vfs": {
      const accId = args.account_id as string;
      delete mockAccountMounts[accId];
      const acc = mockAccounts.find((a) => a.id === accId);
      if (acc) acc.mount_path = undefined;
      return null as unknown as T;
    }

    case "is_account_mounted": {
      const accId = args.account_id as string;
      return Boolean(mockAccountMounts[accId]) as unknown as T;
    }

    case "get_account_mount_path": {
      const accId = args.account_id as string;
      return (mockAccountMounts[accId] || null) as unknown as T;
    }

    case "is_default_file_manager": {
      return mockDefaultFileManager as unknown as T;
    }

    case "set_as_default_file_manager": {
      mockDefaultFileManager = true;
      return true as unknown as T;
    }

    case "open_in_terminal": {
      return { success: true, cwd: (args.path as string) || "/home/user" } as unknown as T;
    }

    case "list_apps_for_file": {
      return {
        recommended: [
          { id: "text-editor.desktop", name: "Text Editor", display_name: "Text Editor", description: "Default text editor", executable: "gnome-text-editor", is_recommended: true },
          { id: "image-viewer.desktop", name: "Image Viewer", display_name: "Image Viewer", description: "Default image viewer", executable: "loupe", is_recommended: true },
        ],
        others: [
          { id: "code.desktop", name: "Visual Studio Code", display_name: "Code", description: "Code Editing", executable: "code", is_recommended: false },
        ],
        mime_type: (args.mime_type as string) || "application/octet-stream",
      } as unknown as T;
    }

    case "open_file_with": {
      return { success: true } as unknown as T;
    }

    case "read_text_preview": {
      return {
        success: true,
        content: "// Sample source file preview\nfunction hello() {\n  return 'Hello World';\n}\n",
        line_count: 5,
        size: 120,
        is_truncated: false,
      } as unknown as T;
    }

    case "get_thumbnail": {
      const path = (args.path as string) || "";
      const thumbUrl = (args.thumbnail_url as string) || null;
      if (thumbUrl) {
        return { thumbnail: thumbUrl } as unknown as T;
      }
      if (path && /\.(png|jpe?g|webp|gif|svg|bmp|ico|avif)$/i.test(path)) {
        return { thumbnail: path.startsWith("file://") ? path : `file://${path}` } as unknown as T;
      }
      return { thumbnail: null } as unknown as T;
    }

    case "analyze_folder_intelligence": {
      return {
        folder_path: (args.folder_path as string) || "/home/user",
        empty_folders: [],
        duplicate_files: [],
        duplicate_folders: [],
        summary: {
          empty_folder_count: 0,
          duplicate_group_count: 0,
          duplicate_file_count: 0,
          duplicate_folder_group_count: 0,
          reclaimable_bytes: 0,
        },
      } as unknown as T;
    }

    case "list_system_devices": {
      return {
        devices: [
          {
            id: "dev_root",
            name: "Fedora Linux (/)",
            mount_path: "/",
            device_type: "root",
            is_removable: false,
            is_mounted: true,
            can_unmount: false,
            can_eject: false,
            total_bytes: 512 * 1024 * 1024 * 1024,
            used_bytes: 120 * 1024 * 1024 * 1024,
            free_bytes: 392 * 1024 * 1024 * 1024,
            device_node: "/dev/root",
          },
          {
            id: "mount_usb_drive",
            name: "USB Flash Drive",
            mount_path: "/run/media/user/USB_DRIVE",
            device_type: "removable",
            is_removable: true,
            is_mounted: true,
            can_unmount: true,
            can_eject: true,
            total_bytes: 32 * 1024 * 1024 * 1024,
            used_bytes: 8 * 1024 * 1024 * 1024,
            free_bytes: 24 * 1024 * 1024 * 1024,
            device_node: "/dev/sdb1",
          },
        ],
      } as unknown as T;
    }

    case "mount_device": {
      return { success: true } as unknown as T;
    }

    case "unmount_device": {
      return { success: true } as unknown as T;
    }

    case "eject_device": {
      return { success: true } as unknown as T;
    }

    case "finish_picker_operation": {
      return { success: true } as unknown as T;
    }

    case "compress_to_size": {
      const src = (args.source_path as string) || (args.path as string) || "sample.jpg";
      const targetBytes = (args.target_bytes as number) || 102400;
      const formattedSize = (args.formatted_size as string) || "100KB";
      const customOut = args.output_path as string | undefined;

      let outPath = customOut;
      if (!outPath) {
        const lastSlash = src.lastIndexOf("/");
        const dir = lastSlash >= 0 ? src.substring(0, lastSlash) : "";
        const filename = lastSlash >= 0 ? src.substring(lastSlash + 1) : src;
        const dot = filename.lastIndexOf(".");
        const stem = dot > 0 ? filename.substring(0, dot) : filename;
        const ext = dot > 0 ? filename.substring(dot) : "";
        const cleanSize = formattedSize.replace(/\s+/g, "");
        const outName = `${stem}_compressed_${cleanSize}${ext}`;
        outPath = dir ? `${dir}/${outName}` : outName;
      }

      const compressedSize = Math.min(targetBytes, Math.max(1024, Math.floor(targetBytes * 0.92)));
      return {
        success: true,
        output_path: outPath,
        original_size: targetBytes * 2,
        compressed_size: compressedSize,
      } as unknown as T;
    }

    case "compress_entries": {
      return { success: true } as unknown as T;
    }

    case "copy_entries": {
      return { success: true } as unknown as T;
    }

    case "move_entries": {
      return { success: true } as unknown as T;
    }

    default:
      return null as unknown as T;
  }
}
