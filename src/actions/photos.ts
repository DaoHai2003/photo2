'use server';

import { createServerSupabase } from '@/lib/supabase/server';

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
