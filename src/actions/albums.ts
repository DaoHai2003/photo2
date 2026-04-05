'use server';

import { createServerSupabase } from '@/lib/supabase/server';

function generateSlug(title: string): string {
  let slug = title.toLowerCase().trim();
  slug = slug
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
  slug = slug.replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
  return slug || 'album';
}

export async function createAlbum(formData: {
  title: string;
  description?: string;
  password?: string;
  maxSelections: number;
  allowDownload: boolean;
  allowComments: boolean;
  driveFolderId?: string;
  driveFolderUrl?: string;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập' };

  // Quota check disabled — unlimited for all users

  // Generate unique slug (check ALL albums including soft-deleted)
  let baseSlug = generateSlug(formData.title);
  if (!baseSlug) baseSlug = 'album';
  let slug = baseSlug + '-' + Date.now().toString(36).slice(-4);
  let counter = 0;
  while (true) {
    const { data: existing } = await supabase
      .from('albums')
      .select('id')
      .eq('studio_id', user.id)
      .eq('slug', slug)
      .limit(1);
    if (!existing || existing.length === 0) break;
    counter++;
    slug = `${baseSlug}-${counter}-${Date.now().toString(36).slice(-4)}`;
  }

  // Hash password if provided
  let passwordHash = null;
  if (formData.password && formData.password.trim()) {
    const bcrypt = await import('bcryptjs');
    passwordHash = await bcrypt.hash(formData.password, 10);
  }

  const { data, error } = await supabase
    .from('albums')
    .insert({
      studio_id: user.id,
      title: formData.title,
      slug,
      description: formData.description || null,
      password_hash: passwordHash,
      max_selections: formData.maxSelections === 0 ? null : formData.maxSelections,
      allow_download: formData.allowDownload,
      allow_comments: formData.allowComments,
      is_published: true,
      drive_folder_id: formData.driveFolderId || null,
      drive_folder_url: formData.driveFolderUrl || null,
    })
    .select('id, slug')
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function getAlbums() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập', data: [] };

  const { data, error } = await supabase
    .from('albums')
    .select('id, title, slug, description, photo_count, total_selections, is_published, allow_download, allow_comments, password_hash, max_selections, created_at, updated_at, cover_photo_id')
    .eq('studio_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message, data: [] };
  return { data: data || [] };
}

export async function getAlbumById(albumId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập' };

  const { data, error } = await supabase
    .from('albums')
    .select('*')
    .eq('id', albumId)
    .eq('studio_id', user.id)
    .is('deleted_at', null)
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function updateAlbum(albumId: string, updates: Record<string, unknown>) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập' };

  const { error } = await supabase
    .from('albums')
    .update(updates)
    .eq('id', albumId)
    .eq('studio_id', user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteAlbum(albumId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Chưa đăng nhập' };

  // Soft delete
  const { error } = await supabase
    .from('albums')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', albumId)
    .eq('studio_id', user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getStudioStats() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: studio } = await supabase
    .from('studios')
    .select('total_storage_used_bytes')
    .eq('id', user.id)
    .single();

  const { data: albums } = await supabase
    .from('albums')
    .select('id')
    .eq('studio_id', user.id)
    .is('deleted_at', null);

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_id, plans(max_albums, max_storage_mb, max_photos_per_album)')
    .eq('studio_id', user.id)
    .eq('status', 'active')
    .single();

  const plan = (sub as any)?.plans;
  return {
    albumCount: albums?.length || 0,
    maxAlbums: plan?.max_albums ?? 3,
    maxPhotosPerAlbum: plan?.max_photos_per_album ?? 50,
    storageUsedBytes: studio?.total_storage_used_bytes || 0,
    maxStorageMb: plan?.max_storage_mb ?? 500,
  };
}
