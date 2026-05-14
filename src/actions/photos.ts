'use server';

import { createServerSupabase } from '@/lib/supabase/server';
import { resolvePhotoUrls } from '@/lib/utils/photo-urls';
import type {
  PaginationParams,
  PaginatedPhotosResult,
  Photo,
} from '@/types/photo';

export async function registerPhoto(albumId: string, metadata: {
  originalFilename: string;
  storagePath: string;
  thumbnailPath?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập' };

  const normalized = metadata.originalFilename.toLowerCase().trim();

  const { data, error } = await supabase
    .from('photos')
    .insert({
      album_id: albumId,
      studio_id: user.id,
      original_filename: metadata.originalFilename,
      normalized_filename: normalized,
      storage_path: metadata.storagePath,
      thumbnail_path: metadata.thumbnailPath || null,
      width: metadata.width || null,
      height: metadata.height || null,
      file_size: metadata.fileSize || null,
      mime_type: metadata.mimeType || null,
    })
    .select('id, original_filename, storage_path')
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function getPhotos(albumId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập', data: [] };

  const { data, error } = await supabase
    .from('photos')
    .select('id, original_filename, storage_path, thumbnail_path, width, height, file_size, mime_type, sort_order, selection_count, comment_count, created_at')
    .eq('album_id', albumId)
    .eq('studio_id', user.id)
    .order('sort_order')
    .order('created_at');

  if (error) return { error: error.message, data: [] };
  return { data: data || [] };
}

export async function deletePhoto(photoId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập' };

  // Get photo to delete from storage
  const { data: photo } = await supabase
    .from('photos')
    .select('storage_path, thumbnail_path')
    .eq('id', photoId)
    .eq('studio_id', user.id)
    .single();

  if (!photo) return { error: 'Ảnh không tồn tại' };

  // Delete from storage
  if (photo.storage_path) {
    await supabase.storage.from('album-photos').remove([photo.storage_path]);
  }
  if (photo.thumbnail_path) {
    await supabase.storage.from('album-thumbnails').remove([photo.thumbnail_path]);
  }

  // Delete record
  const { error } = await supabase
    .from('photos')
    .delete()
    .eq('id', photoId)
    .eq('studio_id', user.id);

  if (error) return { error: error.message };
  return { success: true };
}

// Server-paginated + filtered photo list for the admin album page.
// Calls RPC `get_album_photos_page` (migration 009) and resolves URLs
// only for the ~100 rows on the current page.
export async function getAlbumPhotosPage(
  albumId: string,
  params: PaginationParams
): Promise<
  | { error: string; data?: undefined }
  | { error?: undefined; data: PaginatedPhotosResult }
> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập' };

  // Enforce ownership — RPC runs with SECURITY INVOKER so RLS would also
  // block, but failing fast here gives a cleaner error to the client.
  const { data: album } = await supabase
    .from('albums')
    .select('id')
    .eq('id', albumId)
    .eq('studio_id', user.id)
    .is('deleted_at', null)
    .single();
  if (!album) return { error: 'Album không tồn tại' };

  const { data: rows, error } = await supabase.rpc('get_album_photos_page', {
    p_album_id: albumId,
    p_photo_type: params.photoType,
    p_filter: params.filter,
    p_search: params.search ?? null,
    p_sort: params.sort,
    p_sort_dir: params.sortDir,
    p_page: params.page,
    p_page_size: params.pageSize,
    p_group_id: params.groupId ?? null,
  });

  if (error) return { error: error.message };

  const totalCount = Number(rows?.[0]?.total_count ?? 0);
  const photos = (rows ?? []).map((r: { photo: Photo }) => r.photo);
  const withUrls = await resolvePhotoUrls(supabase, photos);

  return {
    data: {
      data: withUrls,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / params.pageSize)),
      page: params.page,
      pageSize: params.pageSize,
    },
  };
}

// Lookup photos theo filename — dùng cho Smart Filter "Lọc từ Cloud":
// nhận albumId + list filename → trả về URL download (Drive lh3 hoặc
// Supabase signed URL). Match theo normalized_filename (lowercase trimmed)
// để robust với case sensitivity.
export async function getPhotosByFilenames(
  albumId: string,
  filenames: string[]
): Promise<{
  error?: string;
  data: Array<{
    filename: string;
    matched: boolean;
    downloadUrl?: string;
    sourceType?: 'drive' | 'storage';
  }>;
}> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập', data: [] };

  // Verify ownership
  const { data: album } = await supabase
    .from('albums')
    .select('id')
    .eq('id', albumId)
    .eq('studio_id', user.id)
    .is('deleted_at', null)
    .single();
  if (!album) return { error: 'Album không tồn tại', data: [] };

  // Normalize input filenames để match (DB lưu normalized = lowercase trimmed)
  const normalized = filenames.map((f) => f.toLowerCase().trim()).filter(Boolean);
  if (normalized.length === 0) return { data: [] };

  // Query photos — match cả normalized_filename lẫn original_filename (defensive)
  const { data: photos, error } = await supabase
    .from('photos')
    .select('original_filename, normalized_filename, storage_path, drive_file_id')
    .eq('album_id', albumId)
    .eq('studio_id', user.id)
    .in('normalized_filename', normalized);

  if (error) return { error: error.message, data: [] };

  // Build map: normalized → photo row (dedupe nếu duplicate)
  const photoMap = new Map<string, typeof photos[number]>();
  for (const p of photos ?? []) {
    if (p.normalized_filename) photoMap.set(p.normalized_filename, p);
  }

  // Sign URLs cho photos lưu Supabase Storage (batch trong 1 call)
  const storagePaths = (photos ?? [])
    .filter((p) => !p.drive_file_id && p.storage_path)
    .map((p) => p.storage_path as string);

  const signedMap = new Map<string, string>();
  if (storagePaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from('album-photos')
      .createSignedUrls(storagePaths, 3600);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl);
    }
  }

  // Build response giữ thứ tự input filenames
  const result = filenames.map((rawName) => {
    const norm = rawName.toLowerCase().trim();
    const photo = photoMap.get(norm);
    if (!photo) return { filename: rawName, matched: false };
    if (photo.drive_file_id) {
      // Drive: proxy qua /api/drive/download để tránh CORS (lh3 không cho
      // fetch cross-origin) + handle virus scan warning với file > 25MB.
      return {
        filename: rawName,
        matched: true,
        downloadUrl: `/api/drive/download?fileId=${encodeURIComponent(photo.drive_file_id)}`,
        sourceType: 'drive' as const,
      };
    }
    if (photo.storage_path) {
      const url = signedMap.get(photo.storage_path);
      if (url) {
        return {
          filename: rawName,
          matched: true,
          downloadUrl: url,
          sourceType: 'storage' as const,
        };
      }
    }
    return { filename: rawName, matched: false };
  });

  return { data: result };
}

// Xoá bình luận trên ảnh — chỉ studio sở hữu album mới xoá được.
// Hard delete để trigger tr_comment_count tự decrement comment_count
// trên photos. An toàn: KHÔNG xoá ảnh, chỉ 1 row trong photo_comments.
export async function deletePhotoComment(commentId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập' };

  // Verify ownership: comment phải thuộc album của studio này
  const { data: comment } = await supabase
    .from('photo_comments')
    .select('id, album_id, albums!inner(studio_id)')
    .eq('id', commentId)
    .single();

  if (!comment) return { error: 'Bình luận không tồn tại' };
  // @ts-expect-error supabase join trả nested type
  const albumStudioId = Array.isArray(comment.albums) ? comment.albums[0]?.studio_id : comment.albums?.studio_id;
  if (albumStudioId !== user.id) return { error: 'Không có quyền xoá bình luận này' };

  const { error } = await supabase
    .from('photo_comments')
    .delete()
    .eq('id', commentId);

  if (error) return { error: error.message };
  return { success: true };
}

// Filenames + group_id — used by "Copy mã chọn / Copy mã thích" với picker
// theo từng mục. Fast: no joins, no URLs.
export async function getAlbumPhotoFilenames(
  albumId: string,
  filter: 'liked' | 'selected'
): Promise<{ error?: string; data: Array<{ filename: string; groupId: string | null }> }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập', data: [] };

  const column = filter === 'liked' ? 'like_count' : 'selection_count';

  const { data, error } = await supabase
    .from('photos')
    .select('original_filename, group_id')
    .eq('album_id', albumId)
    .eq('studio_id', user.id)
    .gt(column, 0)
    .order('sort_order');

  if (error) return { error: error.message, data: [] };
  return {
    data: (data ?? []).map((r: { original_filename: string; group_id: string | null }) => ({
      filename: r.original_filename,
      groupId: r.group_id,
    })),
  };
}

export async function getSignedUrls(albumId: string, photoIds: string[]) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập' };

  const { data: photos } = await supabase
    .from('photos')
    .select('id, storage_path, thumbnail_path')
    .in('id', photoIds)
    .eq('album_id', albumId);

  if (!photos) return { error: 'Không tìm thấy ảnh' };

  const urls: Record<string, { original: string; thumbnail: string }> = {};
  for (const photo of photos) {
    const { data: origUrl } = await supabase.storage
      .from('album-photos')
      .createSignedUrl(photo.storage_path, 3600);
    const thumbPath = photo.thumbnail_path || photo.storage_path;
    const { data: thumbUrl } = await supabase.storage
      .from(photo.thumbnail_path ? 'album-thumbnails' : 'album-photos')
      .createSignedUrl(thumbPath, 3600);

    urls[photo.id] = {
      original: origUrl?.signedUrl || '',
      thumbnail: thumbUrl?.signedUrl || '',
    };
  }

  return { data: urls };
}
