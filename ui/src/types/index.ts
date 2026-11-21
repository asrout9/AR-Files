export type FileState =
  | 'cloud_only'
  | 'hydrating'
  | 'available'
  | 'pinned'
  | 'syncing_up'
  | 'conflict'
  | 'error'
  | 'excluded';

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
