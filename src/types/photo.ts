// Shared photo types used by paginated server actions, hooks, and UI.
// Kept small — reuse existing column names from the `photos` table so the
// shape maps directly onto the RPC return value.

export type PhotoType = 'original' | 'edited';
export type PhotoFilter = 'all' | 'liked' | 'selected' | 'commented';
export type PhotoSort = 'sort_order' | 'created_at' | 'filename';
export type PhotoSortDir = 'asc' | 'desc';

export interface Photo {
  id: string;
  album_id: string;
  studio_id: string;
  original_filename: string;
  normalized_filename: string;
  storage_path: string | null;
  thumbnail_path: string | null;
  drive_file_id: string | null;
  drive_thumbnail_link: string | null;
  drive_web_link: string | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
  mime_type: string | null;
  sort_order: number;
  selection_count: number;
  comment_count: number;
  like_count: number;
  photo_type: PhotoType;
  group_id: string | null;
  created_at: string;
}

// What UI actually renders — Photo + resolved URLs (signed for Supabase
// Storage, or direct Drive thumbnail/download links).
export interface PhotoWithUrls extends Photo {
  url: string;          // full-size
  thumbnailUrl: string; // thumbnail
}

export interface PaginatedPhotosResult {
  data: PhotoWithUrls[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

export interface PaginationParams {
  photoType: PhotoType;
  filter: PhotoFilter;
  search?: string;
  sort: PhotoSort;
  sortDir: PhotoSortDir;
  page: number;
  pageSize: number;
  groupId?: string | null;
}
