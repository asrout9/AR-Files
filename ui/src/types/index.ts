export type FileState =
  | 'cloud_only'
  | 'hydrating'
  | 'available'
  | 'pinned'
  | 'syncing_up'
  | 'conflict'
  | 'error'
  | 'excluded';

export interface SystemDevice {
  id: string;
  name: string;
  mount_path: string;
  device_type: "root" | "removable" | "drive" | "optical" | "network";
  is_removable: boolean;
  is_mounted: boolean;
  can_unmount: boolean;
  can_eject: boolean;
  total_bytes?: number;
  used_bytes?: number;
  free_bytes?: number;
  device_node?: string | null;
  fs_type?: string | null;
}

export interface DesktopApp {
  id: string;
  name: string;
  display_name: string;
  description: string;
  executable: string;
  icon?: string | null;
  is_recommended: boolean;
}

export interface ActiveJob {
  id: string;
  type: string;
  title: string;
  itemsCompleted: number;
  totalItems: number;
  bytesProcessed: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number | null;
  status: "running" | "completed" | "failed" | "cancelled";
}

export interface EmptyFolderItem {
  id: string;
  name: string;
  path: string;
  mtime: number;
}

export interface DuplicateFileItem {
  id: string;
  name: string;
  path: string;
  size: number;
  mtime: number;
  ctime?: number | null;
  local_path?: string | null;
  thumbnail_url?: string | null;
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  reclaimable_bytes: number;
  items: DuplicateFileItem[];
}

export interface DuplicateFolderItem {
  id: string;
  name: string;
  path: string;
  mtime: number;
  item_count: number;
}

export interface DuplicateFolderGroup {
  signature: string;
  items: DuplicateFolderItem[];
}

export interface FolderIntelligenceSummary {
  empty_folder_count: number;
  duplicate_group_count: number;
  duplicate_file_count: number;
  duplicate_folder_group_count: number;
  reclaimable_bytes: number;
}

export interface FolderIntelligenceResult {
  empty_folders: EmptyFolderItem[];
  duplicate_files: DuplicateGroup[];
  duplicate_folders: DuplicateFolderGroup[];
  summary: FolderIntelligenceSummary;
}

export interface EntryRecord {
  id: string;
  account_id: string;
  remote_id?: string | null;
  parent_id?: string | null;
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  mtime: number;
  ctime?: number | null;
  mime_type: string;
  etag?: string | null;
  content_hash?: string | null;
  state: FileState;
  local_path?: string | null;
  error_message?: string | null;
  sync_version: number;
  last_accessed_at?: number | null;
  created_at: number;
  updated_at: number;
  thumbnail_url?: string | null;
}

export type AccountSyncStatus =
  | 'idle'
  | 'indexing'
  | 'syncing'
  | 'paused'
  | 'offline'
  | 'action_required'
  | 'error';

export interface AccountRecord {
  id: string;
  provider_type: string;
  name: string;
  email?: string | null;
  root_folder_id?: string | null;
  quota_total?: number | null;
  quota_used?: number | null;
  sync_status: AccountSyncStatus;
  delta_token?: string | null;
  mount_path?: string | null;
  created_at: number;
  updated_at: number;
  thumbnail_url?: string | null;
}

export type SortField = 'name' | 'size' | 'modified' | 'created' | 'type' | 'state';
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid' | 'compact';

export interface FolderListingQuery {
  parent_id?: string | null;
  account_id?: string | null;
  offset: number;
  limit: number;
  sort_by: SortField;
  sort_direction: SortDirection;
  show_hidden: boolean;
  filter?: string | null;
}

export interface PagedResult<T> {
  items: T[];
  total_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface OperationProgress {
  job_id: string;
  operation_type: string;
  current_item: string;
  items_completed: number;
  total_items: number;
  bytes_processed: number;
  total_bytes: number;
  speed_bps: number;
  eta_seconds?: number | null;
}

export interface ProviderQuota {
  total_bytes: number;
  used_bytes: number;
  trash_bytes?: number | null;
}

export interface SyncStatusInfo {
  account_id: string;
  sync_status: string;
  is_offline: boolean;
  pending_uploads_count: number;
  quota_total?: number | null;
  quota_used?: number | null;
}

export interface HydrationProgressEvent {
  entry_id: string;
  bytes_downloaded: number;
  total_bytes: number;
  speed_bps: number;
  state: FileState;
}

export interface FileVersion {
  id: string;
  version_id: string;
  size: number;
  modified_time: number;
  author?: string | null;
  download_url?: string | null;
}

export interface DiagnosticsInfo {
  total_indexed_entries: number;
  wal_mode_enabled: boolean;
  active_providers_count: number;
  download_limit_bps: number;
  upload_limit_bps: number;
  total_cache_bytes: number;
  unresponsive_mounts: string[];
}

export interface BandwidthLimits {
  download_bps: number;
  upload_bps: number;
}
