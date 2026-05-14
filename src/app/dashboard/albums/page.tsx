'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSnackbar } from '@/components/providers/SnackbarProvider';
import ShareDialog from '@/components/album/ShareDialog';
import {
  DARK_BG, DARK_CARD, DARK_HOVER, DARK_BORDER, DARK_BORDER_STRONG,
  ACCENT_CYAN, ACCENT_GLOW, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
} from '@/theme/dashboard-dark-tokens';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  TextField,
  InputAdornment,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Stack,
  Skeleton,
  Paper,
  MenuItem,
  Select,
  FormControl,
  LinearProgress,
  Menu,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  PhotoLibrary as PhotoLibraryIcon,
  Edit as EditIcon,
  Share as ShareIcon,
  FolderCopy as FolderIcon,
  CloudQueue as CloudIcon,
  Visibility as ViewIcon,
  CardGiftcard as GiftIcon,
  Link as LinkIcon,
  Image as ImageIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';

interface Album {
  id: string;
  studio_id: string;
  title: string;
  slug: string;
  description: string | null;
  password_hash: string | null;
  max_selections: number;
  allow_download: boolean;
  allow_comments: boolean;
  is_published: boolean;
  photo_count: number;
  total_selections: number;
  drive_link?: string | null;
  cover_url?: string | null;
  cover_thumb?: string | null;
  cover_photo_id?: string | null;
  original_count?: number;
  edited_count?: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type TabFilter = 'all' | 'new' | 'selected' | 'edited';

// Dark theme tokens — tông đen-xanh đồng bộ với public album page.
const PRIMARY = ACCENT_CYAN;
const BG = DARK_BG;
// Card surface — dùng đi dùng lại cho mọi Paper / Card dashboard
const CARD_SX = {
  borderRadius: 1,
  bgcolor: DARK_CARD,
  border: `1px solid ${DARK_BORDER}`,
  boxShadow: 'none',
  color: TEXT_PRIMARY,
  transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
  '&:hover': {
    borderColor: DARK_BORDER_STRONG,
    boxShadow: `0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px ${DARK_BORDER_STRONG} inset`,
  },
};
const MAX_ALBUMS = 50;
const MAX_STORAGE_GB = 15;
const USED_STORAGE_GB = 11.53;
const STORAGE_PERCENT = ((USED_STORAGE_GB / MAX_STORAGE_GB) * 100).toFixed(1);

const TAB_CHIPS: { label: string; value: TabFilter }[] = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Mới tạo', value: 'new' },
  { label: 'Đã chọn', value: 'selected' },
  { label: 'Đã chỉnh sửa', value: 'edited' },
];

export default function AlbumsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuthStore();
  const { showSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('mine');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; album: Album | null }>({
    open: false,
    album: null,
  });
  const [shareDialog, setShareDialog] = useState<{ open: boolean; album: Album | null }>({
    open: false,
    album: null,
  });
  const [shareAnchor, setShareAnchor] = useState<{ el: HTMLElement | null; albumId: string | null }>({
    el: null,
    albumId: null,
  });
  const [driveAnchor, setDriveAnchor] = useState<{ el: HTMLElement | null; albumId: string | null }>({
    el: null,
    albumId: null,
  });

  // ---- Data fetching (preserved) ----
  const { data: albums = [], isLoading } = useQuery({
    queryKey: ['albums', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('albums')
        .select('*')
        .eq('studio_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch cover photo for each album
      const albumsWithCovers = await Promise.all(
        (data || []).map(async (album: any) => {
          if (album.cover_photo_id) {
            const { data: photo } = await supabase
              .from('photos')
              .select('drive_file_id, storage_path')
              .eq('id', album.cover_photo_id)
              .single();
            if (photo?.drive_file_id) {
              album.cover_thumb = `https://lh3.googleusercontent.com/d/${photo.drive_file_id}=w300`;
            }
          }
          // Fallback: use first photo if no cover set
          if (!album.cover_thumb) {
            const { data: firstPhoto } = await supabase
              .from('photos')
              .select('drive_file_id')
              .eq('album_id', album.id)
              .order('sort_order')
              .limit(1);
            if (firstPhoto?.[0]?.drive_file_id) {
              album.cover_thumb = `https://lh3.googleusercontent.com/d/${firstPhoto[0].drive_file_id}=w300`;
            }
          }

          // Count original vs edited photos — dùng count exact để KHÔNG bị
          // limit 1000 rows mặc định của Supabase. Trước đây fetch toàn bộ
          // photo_type rồi count → album > 1000 ảnh bị cap = 1000.
          const [{ count: oCount }, { count: eCount }] = await Promise.all([
            supabase.from('photos').select('*', { count: 'exact', head: true })
              .eq('album_id', album.id)
              .or('photo_type.is.null,photo_type.eq.original'),
            supabase.from('photos').select('*', { count: 'exact', head: true })
              .eq('album_id', album.id)
              .eq('photo_type', 'edited'),
          ]);
          album.original_count = oCount || 0;
          album.edited_count = eCount || 0;

          return album;
        })
      );
      return albumsWithCovers as Album[];
    },
    enabled: !!user?.id,
  });

  // ---- Delete mutation (preserved) ----
  const deleteMutation = useMutation({
    mutationFn: async (albumId: string) => {
      if (!user?.id) throw new Error('Chưa đăng nhập');
      const { error } = await supabase
        .from('albums')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', albumId)
        .eq('studio_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      showSnackbar('Album đã được xoá thành công', 'success');
      setDeleteDialog({ open: false, album: null });
    },
    onError: (err: any) => {
      console.error('Delete album error:', err);
      showSnackbar('Không thể xoá album: ' + (err?.message || 'Vui lòng thử lại'), 'error');
    },
  });

  // ---- Filtering logic (preserved + extended) ----
  const filteredAlbums = useMemo(() => {
    let result = albums;

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter((a) => a.title.toLowerCase().includes(lower));
    }

    if (dateFilter) {
      result = result.filter((a) => a.created_at.startsWith(dateFilter));
    }

    if (statusFilter === 'published') {
      result = result.filter((a) => a.is_published);
    } else if (statusFilter === 'draft') {
      result = result.filter((a) => !a.is_published);
    }

    if (activeTab === 'new') {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      result = result.filter((a) => a.created_at > weekAgo);
    } else if (activeTab === 'selected') {
      result = result.filter((a) => a.total_selections > 0);
    } else if (activeTab === 'edited') {
      result = result.filter((a) => a.updated_at !== a.created_at);
    }

    return result;
  }, [albums, search, dateFilter, statusFilter, activeTab]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    return {
      all: albums.length,
      new: albums.filter((a) => a.created_at > weekAgo).length,
      selected: albums.filter((a) => a.total_selections > 0).length,
      edited: albums.filter((a) => a.updated_at !== a.created_at).length,
    };
  }, [albums]);

  const handleDelete = (album: Album) => {
    setDeleteDialog({ open: true, album });
  };

  const confirmDelete = () => {
    if (deleteDialog.album) {
      deleteMutation.mutate(deleteDialog.album.id);
    }
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('vi-VN');
    return `${time} ${date}`;
  };

  return (
    <Box sx={{ bgcolor: BG, minHeight: '100vh', p: { xs: 2, md: 3 } }}>
      {/* ===== TOP SECTION ===== */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        mb={3}
      >
        <Box sx={{ animation: 'fadeIn 0.5s ease-out', '@keyframes fadeIn': { from: { opacity: 0, transform: 'translateY(-6px)' }, to: { opacity: 1, transform: 'translateY(0)' } } }}>
          <Typography sx={{ color: TEXT_MUTED, fontSize: '0.7rem', letterSpacing: 1.5, fontWeight: 600, textTransform: 'uppercase' }}>
            Dashboard
          </Typography>
          <Typography variant="h5" fontWeight={700} sx={{ color: TEXT_PRIMARY, letterSpacing: '-0.02em' }}>
            Danh sách Album
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/dashboard/albums/new')}
            sx={{
              color: '#1A1A2E',
              background: `linear-gradient(135deg, ${ACCENT_CYAN} 0%, #B8964F 100%)`,
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 1,
              px: 2.5,
              boxShadow: `0 6px 18px ${ACCENT_GLOW}`,
              transition: 'all 0.22s ease',
              '&:hover': {
                background: `linear-gradient(135deg, #DCC189 0%, ${ACCENT_CYAN} 100%)`,
                transform: 'translateY(-2px)',
                boxShadow: `0 10px 26px ${ACCENT_GLOW}`,
              },
            }}
          >
            Tạo Album
          </Button>
        </Stack>
      </Stack>

      {/* ===== STATS ROW ===== */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
        {/* Album count card */}
        <Card sx={{ ...CARD_SX, flex: 1, animation: 'cardIn 0.5s ease-out 0.05s backwards', '@keyframes cardIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } } }}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5 }}>
            <Box
              sx={{
                width: 46, height: 46, borderRadius: 1,
                background: `linear-gradient(135deg, ${ACCENT_GLOW}, rgba(201,169,110,0.04))`,
                border: `1px solid rgba(201,169,110,0.2)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <FolderIcon sx={{ color: ACCENT_CYAN, fontSize: 26 }} />
            </Box>
            <Box>
              <Typography sx={{ color: TEXT_SECONDARY, fontSize: '0.78rem', fontWeight: 600 }}>
                Album
              </Typography>
              <Typography variant="h5" fontWeight={800} sx={{ color: TEXT_PRIMARY, letterSpacing: '-0.02em' }}>
                {albums.length} <Typography component="span" sx={{ color: TEXT_MUTED, fontSize: '0.9rem', fontWeight: 500 }}>/ {MAX_ALBUMS}</Typography>
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* Storage card */}
        <Card sx={{ ...CARD_SX, flex: 1, animation: 'cardIn 0.5s ease-out 0.12s backwards' }}>
          <CardContent sx={{ py: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={2} mb={1.5}>
              <Box
                sx={{
                  width: 46, height: 46, borderRadius: 1,
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.04))',
                  border: '1px solid rgba(245,158,11,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <CloudIcon sx={{ color: '#F59E0B', fontSize: 26 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ color: TEXT_SECONDARY, fontSize: '0.78rem', fontWeight: 600 }}>
                  Dung lượng Drive
                </Typography>
                <Typography variant="h6" fontWeight={800} sx={{ color: TEXT_PRIMARY }}>
                  {USED_STORAGE_GB} GB <Typography component="span" sx={{ color: TEXT_MUTED, fontSize: '0.85rem', fontWeight: 500 }}>/ {MAX_STORAGE_GB} GB</Typography>
                </Typography>
              </Box>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={parseFloat(STORAGE_PERCENT)}
              sx={{
                height: 6,
                borderRadius: 4,
                bgcolor: 'rgba(245,158,11,0.12)',
                mb: 1,
                '& .MuiLinearProgress-bar': {
                  background: 'linear-gradient(90deg, #F59E0B, #FB923C)',
                  borderRadius: 4,
                },
              }}
            />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography sx={{ fontSize: '0.72rem', color: TEXT_MUTED }}>
                {STORAGE_PERCENT}% đã sử dụng
              </Typography>
              <Button
                size="small"
                sx={{
                  textTransform: 'none',
                  fontSize: 12,
                  color: ACCENT_CYAN,
                  fontWeight: 600,
                  '&:hover': { backgroundColor: ACCENT_GLOW },
                }}
              >
                Cài đặt tối ưu
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      {/* ===== FILTER ROW ===== */}
      <Paper
        sx={{
          ...CARD_SX, p: 2, mb: 2,
          animation: 'cardIn 0.5s ease-out 0.18s backwards',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ md: 'center' }}
          sx={{
            // Style chung cho mọi input bên trong filter — dark
            '& .MuiOutlinedInput-root': {
              borderRadius: 1,
              bgcolor: DARK_HOVER,
              color: TEXT_PRIMARY,
              '& fieldset': { borderColor: DARK_BORDER },
              '&:hover fieldset': { borderColor: DARK_BORDER_STRONG },
              '&.Mui-focused fieldset': { borderColor: ACCENT_CYAN },
            },
            '& .MuiInputBase-input': { color: TEXT_PRIMARY, fontSize: '0.85rem' },
            '& .MuiSvgIcon-root': { color: TEXT_SECONDARY },
            '& .MuiSelect-select': { color: TEXT_PRIMARY },
          }}
        >
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} displayEmpty>
              <MenuItem value="mine">Của tôi</MenuItem>
              <MenuItem value="shared">Được chia sẻ</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            placeholder="Tìm kiếm album..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: TEXT_MUTED }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ minWidth: 220, flex: 1 }}
          />

          <TextField
            type="date"
            size="small"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 160 }}
          />

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} displayEmpty>
              <MenuItem value="all">Tất cả Album</MenuItem>
              <MenuItem value="published">Đã xuất bản</MenuItem>
              <MenuItem value="draft">Bản nháp</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* ===== TAB CHIPS ROW ===== */}
      <Stack direction="row" spacing={1} mb={3} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {TAB_CHIPS.map((tab, idx) => {
          const isActive = activeTab === tab.value;
          const count = tabCounts[tab.value];
          return (
            <Chip
              key={tab.value}
              label={
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <span>{tab.label}</span>
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 20,
                      height: 20,
                      borderRadius: 10,
                      bgcolor: isActive ? '#1A1A2E' : DARK_HOVER,
                      color: isActive ? ACCENT_CYAN : TEXT_SECONDARY,
                      fontSize: 11,
                      fontWeight: 700,
                      px: 0.5,
                    }}
                  >
                    {count}
                  </Box>
                </Stack>
              }
              onClick={() => setActiveTab(tab.value)}
              sx={{
                borderRadius: 20,
                fontWeight: 600,
                fontSize: 13,
                px: 1,
                bgcolor: isActive ? ACCENT_CYAN : DARK_CARD,
                color: isActive ? '#1A1A2E' : TEXT_SECONDARY,
                border: isActive ? 'none' : `1px solid ${DARK_BORDER}`,
                transition: 'all 0.22s ease',
                animation: `tabIn 0.4s ease-out ${0.25 + idx * 0.05}s backwards`,
                '@keyframes tabIn': {
                  from: { opacity: 0, transform: 'translateY(4px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
                '&:hover': {
                  bgcolor: isActive ? '#DCC189' : DARK_HOVER,
                  color: isActive ? '#1A1A2E' : TEXT_PRIMARY,
                  transform: 'translateY(-1px)',
                },
                '& .MuiChip-label': { px: 1 },
              }}
            />
          );
        })}
      </Stack>

      {/* ===== ALBUM LIST ===== */}
      {isLoading ? (
        <Stack spacing={2}>
          {[1, 2, 3].map((i) => (
            <Card key={i} sx={{ borderRadius: 1, overflow: 'hidden' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }}>
                <Skeleton variant="rectangular" sx={{ width: { xs: '100%', sm: 140 }, height: { xs: 180, sm: 140 } }} />
                <Box sx={{ flex: 1, p: 2 }}>
                  <Skeleton variant="text" width="40%" height={28} />
                  <Skeleton variant="text" width="25%" />
                  <Skeleton variant="text" width="60%" />
                  <Skeleton variant="text" width="80%" />
                </Box>
              </Stack>
            </Card>
          ))}
        </Stack>
      ) : filteredAlbums.length === 0 ? (
        /* ===== EMPTY STATE ===== */
        <Paper
          sx={{
            p: 8,
            textAlign: 'center',
            borderRadius: 1,
            border: '1px solid #E0E0E0',
            boxShadow: 'none',
          }}
        >
          <PhotoLibraryIcon sx={{ fontSize: 72, color: '#BDBDBD', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" fontWeight={600} mb={1}>
            Chưa có album nào
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/dashboard/albums/new')}
            sx={{
              mt: 1,
              bgcolor: PRIMARY,
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1,
              boxShadow: 'none',
              '&:hover': { bgcolor: '#0D47A1' },
            }}
          >
            Tạo album đầu tiên
          </Button>
        </Paper>
      ) : (
        /* ===== HORIZONTAL ALBUM CARDS ===== */
        <Stack spacing={2}>
          {filteredAlbums.map((album, idx) => (
            <Card
              key={album.id}
              sx={{
                ...CARD_SX,
                overflow: 'hidden',
                animation: `albumIn 0.5s ease-out ${0.3 + idx * 0.04}s backwards`,
                '@keyframes albumIn': {
                  from: { opacity: 0, transform: 'translateY(10px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
                '&:hover': {
                  ...CARD_SX['&:hover'],
                  transform: 'translateY(-2px)',
                },
              }}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }}>
                {/* LEFT: Thumbnail */}
                <Box
                  onClick={() => router.push(`/dashboard/albums/${album.id}`)}
                  sx={{
                    width: { xs: '100%', sm: 140 },
                    height: { xs: 200, sm: 'auto' },
                    minHeight: { sm: 160 },
                    bgcolor: DARK_HOVER,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    backgroundImage: album.cover_thumb ? `url(${album.cover_thumb})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    transition: 'transform 0.4s cubic-bezier(0.16,1,0.3,1)',
                    '.MuiCard-root:hover &': { transform: 'scale(1.02)' },
                  }}
                >
                  {!album.cover_thumb && (
                    <ImageIcon sx={{ fontSize: 48, color: TEXT_MUTED }} />
                  )}
                </Box>

                {/* RIGHT: Content */}
                <Box sx={{ flex: 1, p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {/* Row 1: Title + drive chip */}
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: 16, color: TEXT_PRIMARY }}>
                      {album.title}
                    </Typography>
                    {album.drive_link && (
                      <Chip
                        size="small"
                        label="Album tạo từ Link Drive"
                        icon={<LinkIcon sx={{ fontSize: 14 }} />}
                        sx={{
                          height: 22,
                          fontSize: 10.5,
                          fontWeight: 600,
                          bgcolor: ACCENT_GLOW,
                          color: ACCENT_CYAN,
                          border: `1px solid rgba(201,169,110,0.25)`,
                          '& .MuiChip-icon': { color: ACCENT_CYAN },
                        }}
                      />
                    )}
                  </Stack>

                  {/* Row 2: Date/time */}
                  <Typography sx={{ fontSize: 13, color: TEXT_MUTED }}>
                    {formatDateTime(album.created_at)}
                  </Typography>

                  {/* Row 3: Info chips */}
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
                    <Chip
                      size="small"
                      label={`Ảnh gốc: ${album.original_count || 0}`}
                      variant="outlined"
                      sx={{
                        height: 24, fontSize: 11.5, fontWeight: 600,
                        borderColor: 'rgba(34,197,94,0.4)',
                        color: '#4ADE80',
                        bgcolor: 'rgba(34,197,94,0.08)',
                      }}
                    />
                    {(album.edited_count || 0) > 0 && (
                      <Chip
                        size="small"
                        label={`Chỉnh sửa: ${album.edited_count}`}
                        variant="outlined"
                        sx={{
                          height: 24, fontSize: 11.5, fontWeight: 600,
                          borderColor: 'rgba(99,102,241,0.4)',
                          color: '#A5B4FC',
                          bgcolor: 'rgba(99,102,241,0.08)',
                        }}
                      />
                    )}
                    <Chip
                      size="small"
                      label={`Ảnh chọn: ${album.total_selections}/${album.max_selections > 0 ? album.max_selections : '∞'}`}
                      variant="outlined"
                      sx={{
                        height: 24, fontSize: 11.5, fontWeight: 600,
                        borderColor: 'rgba(201,169,110,0.4)',
                        color: ACCENT_CYAN,
                        bgcolor: ACCENT_GLOW,
                      }}
                    />
                    {album.drive_link && (
                      <>
                        <Chip
                          size="small"
                          label="Link Drive"
                          icon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
                          onClick={(e) =>
                            setDriveAnchor({ el: e.currentTarget, albumId: album.id })
                          }
                          sx={{
                            height: 26,
                            fontSize: 12,
                            fontWeight: 500,
                            bgcolor: '#F5F5F5',
                            cursor: 'pointer',
                            '& .MuiChip-icon': { order: 1, ml: 0, mr: -0.5 },
                          }}
                        />
                        <Menu
                          anchorEl={
                            driveAnchor.albumId === album.id ? driveAnchor.el : null
                          }
                          open={driveAnchor.albumId === album.id && Boolean(driveAnchor.el)}
                          onClose={() => setDriveAnchor({ el: null, albumId: null })}
                        >
                          <MenuItem
                            onClick={() => {
                              if (album.drive_link) window.open(album.drive_link, '_blank');
                              setDriveAnchor({ el: null, albumId: null });
                            }}
                          >
                            Mở Google Drive
                          </MenuItem>
                        </Menu>
                      </>
                    )}
                  </Stack>

                  {/* Row 4: Action buttons */}
                  <Stack
                    direction="row"
                    spacing={1}
                    flexWrap="wrap"
                    sx={{ mt: 0.5, gap: 0.5 }}
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ViewIcon sx={{ fontSize: 16 }} />}
                      onClick={() => router.push(`/dashboard/albums/${album.id}`)}
                      sx={{
                        textTransform: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 1,
                        borderColor: '#E0E0E0',
                        color: '#424242',
                        '&:hover': { borderColor: '#BDBDBD', bgcolor: '#F5F5F5' },
                      }}
                    >
                      Xem ảnh
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditIcon sx={{ fontSize: 16 }} />}
                      onClick={() => router.push(`/dashboard/albums/${album.id}`)}
                      sx={{
                        textTransform: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 1,
                        borderColor: '#E0E0E0',
                        color: '#424242',
                        '&:hover': { borderColor: '#BDBDBD', bgcolor: '#F5F5F5' },
                      }}
                    >
                      Sửa Album
                    </Button>

                    {/* Share dropdown */}
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ShareIcon sx={{ fontSize: 16 }} />}
                      endIcon={<ExpandMoreIcon sx={{ fontSize: 14 }} />}
                      onClick={(e) =>
                        setShareAnchor({ el: e.currentTarget, albumId: album.id })
                      }
                      sx={{
                        textTransform: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 1,
                        borderColor: '#E0E0E0',
                        color: '#424242',
                        '&:hover': { borderColor: '#BDBDBD', bgcolor: '#F5F5F5' },
                      }}
                    >
                      Chia sẻ
                    </Button>
                    <Menu
                      anchorEl={
                        shareAnchor.albumId === album.id ? shareAnchor.el : null
                      }
                      open={shareAnchor.albumId === album.id && Boolean(shareAnchor.el)}
                      onClose={() => setShareAnchor({ el: null, albumId: null })}
                    >
                      <MenuItem
                        onClick={() => {
                          setShareAnchor({ el: null, albumId: null });
                          setShareDialog({ open: true, album });
                        }}
                      >
                        Chia sẻ album
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${window.location.origin}/albums/${album.slug}`
                          );
                          showSnackbar('Đã sao chép liên kết!', 'success');
                          setShareAnchor({ el: null, albumId: null });
                        }}
                      >
                        Sao chép liên kết
                      </MenuItem>
                    </Menu>

                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                      onClick={() => router.push(`/dashboard/albums/${album.id}?addEdited=true`)}
                      sx={{
                        textTransform: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 1,
                        bgcolor: PRIMARY,
                        boxShadow: 'none',
                        '&:hover': { bgcolor: '#0D47A1', boxShadow: 'none' },
                      }}
                    >
                      Thêm Ảnh chỉnh sửa
                    </Button>

                    <Button
                      size="small"
                      onClick={() => handleDelete(album)}
                      sx={{
                        textTransform: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#D32F2F',
                        '&:hover': { bgcolor: '#FFEBEE' },
                      }}
                    >
                      Xoá
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}

      {/* ===== DELETE CONFIRMATION DIALOG ===== */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, album: null })}
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Xác nhận xoá album</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Bạn có chắc chắn muốn xoá album "{deleteDialog.album?.title}"? Hành động này không thể hoàn tác.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteDialog({ open: false, album: null })}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Huỷ
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDelete}
            disabled={deleteMutation.isPending}
            sx={{ textTransform: 'none', borderRadius: 1, boxShadow: 'none' }}
          >
            {deleteMutation.isPending ? 'Đang xoá...' : 'Xoá'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== SHARE DIALOG ===== */}
      {shareDialog.album && (
        <ShareDialog
          open={shareDialog.open}
          onClose={() => setShareDialog({ open: false, album: null })}
          album={shareDialog.album}
        />
      )}
    </Box>
  );
}
