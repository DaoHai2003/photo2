import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getAlbumPhotosPage } from '@/actions/photos';
import { getPublicAlbumPhotosPage } from '@/actions/public';
import type { PaginationParams, PaginatedPhotosResult } from '@/types/photo';

// Default page size — giảm từ 100 → 75 để giảm tải khi grid load ảnh độ nét cao
// (s2400 ~1-2MB/ảnh × 75 = ~100-150MB/page, mobile chấp nhận được).
export const DEFAULT_PAGE_SIZE = 75;

type Kind = 'admin' | 'public';

function queryKey(kind: Kind, albumId: string, params: PaginationParams) {
  return [
    'photos-page',
    kind,
    albumId,
    params.photoType,
    params.filter,
    params.sort,
    params.sortDir,
    params.search ?? '',
    params.groupId ?? '',
    params.page,
    params.pageSize,
  ] as const;
}

async function fetchPage(
  kind: Kind,
  albumId: string,
  params: PaginationParams
): Promise<PaginatedPhotosResult> {
  const action = kind === 'admin' ? getAlbumPhotosPage : getPublicAlbumPhotosPage;
  const res = await action(albumId, params);
  if (res.error) throw new Error(res.error);
  return res.data!;
}

// Admin album page — paginated + filtered photos.
// keepPreviousData: true prevents UI flash when the user flips pages.
export function usePhotosPaginated(albumId: string, params: PaginationParams) {
  return useQuery({
    queryKey: queryKey('admin', albumId, params),
    queryFn: () => fetchPage('admin', albumId, params),
    enabled: !!albumId,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

// Public album page — same contract, different action (no auth required).
export function usePublicPhotosPaginated(albumId: string, params: PaginationParams) {
  return useQuery({
    queryKey: queryKey('public', albumId, params),
    queryFn: () => fetchPage('public', albumId, params),
    enabled: !!albumId,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

// Prefetch the next page so pagination clicks feel instant. Safe to call
// from hover handlers — TanStack Query dedupes in-flight requests.
export function usePhotoPagePrefetcher(kind: Kind, albumId: string) {
  const queryClient = useQueryClient();
  return (params: PaginationParams) => {
    if (!albumId) return;
    queryClient.prefetchQuery({
      queryKey: queryKey(kind, albumId, params),
      queryFn: () => fetchPage(kind, albumId, params),
      staleTime: 30 * 1000,
    });
  };
}

// Invalidate all paginated queries for a given album — used by realtime
// listeners when likes / selections / comments change.
export function invalidateAlbumPhotoPages(
  queryClient: ReturnType<typeof useQueryClient>,
  kind: Kind,
  albumId: string
) {
  queryClient.invalidateQueries({
    queryKey: ['photos-page', kind, albumId],
    exact: false,
  });
}
