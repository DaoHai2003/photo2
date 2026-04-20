// Resolve URLs for a batch of photos — handles both Supabase Storage
// (signed URLs, TTL 3600s) and Google Drive (direct lh3 thumbnail / drive.google download).
// Single batched storage call per page → O(1) round-trips, not O(N).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Photo, PhotoWithUrls } from '@/types/photo';
import { getDriveImageUrl, getDriveThumbnailUrl } from '@/lib/utils/drive';

const SIGNED_URL_TTL_SECONDS = 3600;

type SupaAny = SupabaseClient<any, any, any>;

export async function resolvePhotoUrls(
  supabase: SupaAny,
  photos: Photo[]
): Promise<PhotoWithUrls[]> {
  // Split Drive-hosted vs Storage-hosted so we only hit Supabase Storage
  // for rows that actually need signing.
  const storagePhotoPaths: string[] = [];
  const thumbnailPaths: string[] = [];

  for (const p of photos) {
    if (!p.drive_file_id && p.storage_path) {
      storagePhotoPaths.push(p.storage_path);
      thumbnailPaths.push(p.thumbnail_path || p.storage_path);
    }
  }

  // Batch sign originals + thumbnails in 2 calls (can't mix buckets).
  const [origSigned, thumbSigned] = await Promise.all([
    storagePhotoPaths.length > 0
      ? supabase.storage.from('album-photos').createSignedUrls(storagePhotoPaths, SIGNED_URL_TTL_SECONDS)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    thumbnailPaths.length > 0
      ? signThumbnails(supabase, photos, thumbnailPaths)
      : Promise.resolve(new Map<string, string>()),
  ]);

  const origMap = new Map<string, string>();
  for (const entry of origSigned.data ?? []) {
    if (entry.path && entry.signedUrl) origMap.set(entry.path, entry.signedUrl);
  }
  const thumbMap = thumbSigned instanceof Map ? thumbSigned : new Map<string, string>();

  return photos.map((p) => mergeUrls(p, origMap, thumbMap));
}

// Thumbnails may live in `album-thumbnails` (separate bucket) or in
// `album-photos` when no dedicated thumbnail was generated. Sign from
// the correct bucket and return a path→signedUrl map.
async function signThumbnails(
  supabase: SupaAny,
  photos: Photo[],
  _allThumbPaths: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const thumbBucketPaths: string[] = [];
  const photoBucketPaths: string[] = [];

  for (const p of photos) {
    if (p.drive_file_id) continue;
    if (p.thumbnail_path) thumbBucketPaths.push(p.thumbnail_path);
    else if (p.storage_path) photoBucketPaths.push(p.storage_path);
  }

  const [thumbRes, photoRes] = await Promise.all([
    thumbBucketPaths.length > 0
      ? supabase.storage.from('album-thumbnails').createSignedUrls(thumbBucketPaths, SIGNED_URL_TTL_SECONDS)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    photoBucketPaths.length > 0
      ? supabase.storage.from('album-photos').createSignedUrls(photoBucketPaths, SIGNED_URL_TTL_SECONDS)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
  ]);

  for (const entry of thumbRes.data ?? []) {
    if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl);
  }
  for (const entry of photoRes.data ?? []) {
    if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl);
  }
  return result;
}

function mergeUrls(
  p: Photo,
  origMap: Map<string, string>,
  thumbMap: Map<string, string>
): PhotoWithUrls {
  if (p.drive_file_id) {
    // Always use the stable public lh3 URL — the stored drive_thumbnail_link
    // is the authenticated URL returned by Drive on upload and often 404s
    // from a different browser context.
    return {
      ...p,
      url: getDriveImageUrl(p.drive_file_id),
      thumbnailUrl: getDriveThumbnailUrl(p.drive_file_id),
    };
  }
  const url = p.storage_path ? origMap.get(p.storage_path) ?? '' : '';
  const thumbKey = p.thumbnail_path || p.storage_path || '';
  const thumbnailUrl = thumbMap.get(thumbKey) ?? url;
  return { ...p, url, thumbnailUrl };
}
