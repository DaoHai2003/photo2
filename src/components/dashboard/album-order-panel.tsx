/**
 * Album Order Panel — UI sắp xếp + bật/tắt album hiển thị trên website.
 * Render trong tab "Sắp xếp album" của /dashboard/website.
 *
 * Features:
 *  - 3 sort modes: Mới nhất / Cũ nhất / Tự sắp xếp (drag-drop)
 *  - Toggle is_visible từng album
 *  - Auto-save sort_order vào website_albums
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Stack, Switch, CircularProgress, Alert, Chip,
} from '@mui/material';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSnackbar } from '@/components/providers/SnackbarProvider';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import AlbumSortControls, { type SortMode } from '@/components/public/album-sort-controls';
import SortableAlbumCard, { type AlbumCardData } from '@/components/public/sortable-album-card';

interface AlbumRow extends AlbumCardData {
  is_visible: boolean;
  photo_count: number;
}

export default function AlbumOrderPanel() {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuthStore();
  const { showSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [albums, setAlbums] = useState<AlbumRow[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('manual');
  const [savingSort, setSavingSort] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['website-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('website_profiles').select('id').eq('studio_id', user.id).maybeSingle();
      return data as { id: string } | null;
    },
    enabled: !!user?.id,
  });

  const { data: rows = [], isLoading: loadingRows } = useQuery({
    queryKey: ['album-order-rows', user?.id, profile?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: albumsData } = await supabase
        .from('albums')
        .select('id, title, slug, description, cover_photo_id, created_at, photo_count')
        .eq('studio_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      const all = (albumsData ?? []) as any[];
      if (all.length === 0) return [];

      const waMap = new Map<string, { sort_order: number; is_visible: boolean }>();
      if (profile?.id) {
        const { data: waData } = await supabase
          .from('website_albums')
          .select('album_id, sort_order, is_visible')
          .eq('website_id', profile.id);
        for (const wa of (waData ?? []) as any[]) {
          waMap.set(wa.album_id, { sort_order: wa.sort_order, is_visible: wa.is_visible });
        }
      }

      // Cover photo URLs (batch)
      const coverIds = all.map((a) => a.cover_photo_id).filter(Boolean) as string[];
      const coverByAlbum = new Map<string, { storage_path: string | null; drive_file_id: string | null }>();
      if (coverIds.length > 0) {
        const { data: covers } = await supabase
          .from('photos').select('id, album_id, storage_path, drive_file_id').in('id', coverIds);
        for (const p of (covers ?? []) as any[]) {
          coverByAlbum.set(p.album_id, { storage_path: p.storage_path, drive_file_id: p.drive_file_id });
        }
      }
      const noCover = all.filter((a) => !coverByAlbum.has(a.id)).map((a) => a.id);
      if (noCover.length > 0) {
        const { data: firstPhotos } = await supabase
          .from('photos')
          .select('album_id, storage_path, drive_file_id, sort_order')
          .in('album_id', noCover).eq('photo_type', 'original')
          .order('sort_order', { ascending: true });
        for (const p of (firstPhotos ?? []) as any[]) {
          if (!coverByAlbum.has(p.album_id)) {
            coverByAlbum.set(p.album_id, { storage_path: p.storage_path, drive_file_id: p.drive_file_id });
          }
        }
      }
      const paths: string[] = [];
      for (const c of coverByAlbum.values()) {
        if (!c.drive_file_id && c.storage_path) paths.push(c.storage_path);
      }
      const signedMap = new Map<string, string>();
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage.from('album-photos').createSignedUrls(paths, 3600);
        for (const s of (signed ?? [])) {
          if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl);
        }
      }

      const { getDriveImageUrl } = await import('@/lib/utils/drive');
      const built: AlbumRow[] = all.map((a) => {
        const cover = coverByAlbum.get(a.id);
        let cover_url: string | null = null;
        if (cover) {
          if (cover.drive_file_id) cover_url = getDriveImageUrl(cover.drive_file_id, 800);
          else if (cover.storage_path) cover_url = signedMap.get(cover.storage_path) ?? null;
        }
        const wa = waMap.get(a.id);
        return {
          id: a.id, title: a.title, slug: a.slug,
          description: a.description, created_at: a.created_at,
          cover_url,
          is_visible: wa?.is_visible ?? false,
          photo_count: a.photo_count ?? 0,
        };
      }).sort((x, y) => {
        const ox = waMap.get(x.id)?.sort_order ?? 9999;
        const oy = waMap.get(y.id)?.sort_order ?? 9999;
        return ox - oy;
      });
      return built;
    },
    enabled: !!user?.id,
  });

  useEffect(() => { setAlbums(rows); }, [rows]);

  const persistSortOrder = async (ordered: AlbumRow[]) => {
    if (!profile?.id) return;
    setSavingSort(true);
    try {
      await Promise.all(
        ordered.map((a, idx) =>
          supabase.from('website_albums')
            .update({ sort_order: idx })
            .eq('website_id', profile.id).eq('album_id', a.id)
        )
      );
    } finally { setSavingSort(false); }
  };

  const handleSortModeChange = async (mode: SortMode) => {
    setSortMode(mode);
    if (mode === 'manual') return;
    const sorted = [...albums].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return mode === 'date-desc' ? tb - ta : ta - tb;
    });
    setAlbums(sorted);
    await persistSortOrder(sorted);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = albums.findIndex((a) => a.id === active.id);
    const newIdx = albums.findIndex((a) => a.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(albums, oldIdx, newIdx);
    setAlbums(reordered);
    await persistSortOrder(reordered);
  };

  const toggleVisible = async (album: AlbumRow) => {
    if (!profile?.id) {
      showSnackbar('Cần lưu thông tin website trước (qua tab "Xây dựng" → Lưu)', 'warning');
      return;
    }
    const next = !album.is_visible;
    setAlbums((prev) => prev.map((a) => a.id === album.id ? { ...a, is_visible: next } : a));
    if (next) {
      const { data: existing } = await supabase
        .from('website_albums').select('id')
        .eq('website_id', profile.id).eq('album_id', album.id).maybeSingle();
      if (existing) {
        await supabase.from('website_albums').update({ is_visible: true }).eq('id', existing.id);
      } else {
        const maxOrder = Math.max(0, ...albums.filter((a) => a.is_visible).map((_, i) => i));
        await supabase.from('website_albums').insert({
          website_id: profile.id, album_id: album.id,
          sort_order: maxOrder + 1, is_visible: true,
        });
      }
    } else {
      await supabase.from('website_albums').update({ is_visible: false })
        .eq('website_id', profile.id).eq('album_id', album.id);
    }
    queryClient.invalidateQueries({ queryKey: ['album-order-rows'] });
  };

  const visibleAlbums = albums.filter((a) => a.is_visible);

  if (loadingProfile || loadingRows) {
    return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      {!profile && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Bạn cần lưu website trước (qua tab <strong>Xây dựng</strong> → <strong>Lưu thay đổi</strong>) thì mới sắp xếp được.
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
          <Box>
            <Typography variant="h6">Album hiển thị trên website</Typography>
            <Typography variant="caption" color="text.secondary">
              {visibleAlbums.length} album đang hiển thị · Tự sắp xếp = kéo thả tự do
            </Typography>
          </Box>
          {visibleAlbums.length > 0 && (
            <AlbumSortControls
              mode={sortMode}
              onChange={handleSortModeChange}
              saving={savingSort}
              textColor="inherit"
              accentColor="#C9A96E"
            />
          )}
        </Stack>

        {visibleAlbums.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
            <Typography>Chưa có album nào hiển thị. Bật switch ở danh sách bên dưới.</Typography>
          </Box>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleAlbums.map((a) => a.id)} strategy={rectSortingStrategy}>
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                gap: 2,
              }}>
                {visibleAlbums.map((album, idx) => (
                  <SortableAlbumCard
                    key={album.id}
                    album={album}
                    draggable={sortMode === 'manual'}
                    isDark
                    cardBg="#1A1A2E"
                    textColor="#E8E6E3"
                    subtextColor="rgba(255,255,255,0.55)"
                    idx={idx}
                  />
                ))}
              </Box>
            </SortableContext>
          </DndContext>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" mb={2}>Tất cả album ({albums.length})</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Bật switch để album xuất hiện trên website public.
        </Typography>
        <Stack divider={<Box sx={{ borderBottom: '1px dashed rgba(255,255,255,0.06)' }} />} spacing={0}>
          {albums.map((a) => (
            <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', py: 1.2, gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontWeight={600} fontSize="0.9rem" noWrap>{a.title}</Typography>
                <Typography fontSize="0.7rem" color="text.secondary">
                  {a.photo_count} ảnh · /{a.slug}
                </Typography>
              </Box>
              {a.is_visible && (
                <Chip label="Hiển thị" size="small" color="success" sx={{ fontSize: '0.65rem', height: 20 }} />
              )}
              <Switch
                checked={a.is_visible}
                onChange={() => toggleVisible(a)}
                disabled={!profile}
              />
            </Box>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}
