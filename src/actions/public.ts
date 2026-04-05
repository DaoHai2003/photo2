'use server';

import { createServerSupabase } from '@/lib/supabase/server';

export async function getPublicAlbum(slug: string) {
  const supabase = await createServerSupabase();

  const { data: album, error } = await supabase
    .from('albums')
    .select(`
      id, title, slug, description, photo_count, max_selections,
      allow_download, allow_comments, is_published, password_hash,
      studio_id,
      studios(name, slug, logo_path)
    `)
    .eq('slug', slug)
    .eq('is_published', true)
    .is('deleted_at', null)
    .single();

  if (error || !album) return { error: 'Album không tồn tại' };

  return {
    data: {
      id: album.id,
      title: album.title,
      slug: album.slug,
      description: album.description,
      photoCount: album.photo_count,
      maxSelections: album.max_selections,
      allowDownload: album.allow_download,
      allowComments: album.allow_comments,
      requiresPassword: !!album.password_hash,
      studioName: (album.studios as any)?.name || '',
      studioSlug: (album.studios as any)?.slug || '',
    },
  };
}

export async function verifyAlbumPassword(slug: string, password: string) {
  const supabase = await createServerSupabase();

  const { data: album } = await supabase
    .from('albums')
    .select('id, password_hash')
    .eq('slug', slug)
    .single();

  if (!album || !album.password_hash) return { error: 'Album không tồn tại' };

  const bcrypt = await import('bcryptjs');
  const valid = await bcrypt.compare(password, album.password_hash);
  if (!valid) return { error: 'Mật khẩu không đúng' };

  return { success: true, albumId: album.id };
}

export async function getPublicAlbumPhotos(albumId: string) {
  const supabase = await createServerSupabase();

  const { data: photos, error } = await supabase
    .from('photos')
    .select('id, original_filename, storage_path, thumbnail_path, width, height, selection_count, comment_count')
    .eq('album_id', albumId)
    .order('sort_order')
    .order('created_at');

  if (error) return { data: [] };

  // Generate signed URLs for all photos
  const photosWithUrls = await Promise.all(
    (photos || []).map(async (photo) => {
      const { data: origUrl } = await supabase.storage
        .from('album-photos')
        .createSignedUrl(photo.storage_path, 3600);

      const thumbPath = photo.thumbnail_path || photo.storage_path;
      const bucket = photo.thumbnail_path ? 'album-thumbnails' : 'album-photos';
      const { data: thumbUrl } = await supabase.storage
        .from(bucket)
        .createSignedUrl(thumbPath, 3600);

      return {
        id: photo.id,
        filename: photo.original_filename,
        url: origUrl?.signedUrl || '',
        thumbnailUrl: thumbUrl?.signedUrl || '',
        width: photo.width,
        height: photo.height,
        selectionCount: photo.selection_count,
        commentCount: photo.comment_count,
      };
    })
  );

  return { data: photosWithUrls };
}

export async function getSelections(albumId: string, visitorToken: string) {
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from('photo_selections')
    .select('photo_id')
    .eq('album_id', albumId)
    .eq('visitor_token', visitorToken);

  return { data: (data || []).map((s: any) => s.photo_id) };
}

export async function getAlbumSelections(albumId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập', data: [] };

  const { data, error } = await supabase
    .from('photo_selections')
    .select(`
      id, photo_id, visitor_token, visitor_name, created_at,
      photos(original_filename, storage_path, thumbnail_path)
    `)
    .eq('album_id', albumId)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message, data: [] };
  return { data: data || [] };
}

export async function getAlbumComments(albumId: string) {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from('photo_comments')
    .select('id, photo_id, author_type, author_name, content, created_at')
    .eq('album_id', albumId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) return { data: [] };
  return { data: data || [] };
}
