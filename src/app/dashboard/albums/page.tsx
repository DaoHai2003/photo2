'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSnackbar } from '@/components/providers/SnackbarProvider';
import ShareDialog from '@/components/album/ShareDialog';
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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

type TabFilter = 'all' | 'new' | 'selected' | 'edited';

const PRIMARY = '#1565C0';
const BG = '#FAFAFA';
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
      return data as Album[];
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
        <Typography variant="h5" fontWeight={700} sx={{ color: '#212121' }}>
          Danh sách Album
        </Typography>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<GiftIcon />}
            sx={{
              borderColor: PRIMARY,
              color: PRIMARY,
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              '&:hover': { borderColor: PRIMARY, bgcolor: 'rgba(21,101,192,0.04)' },
            }}
          >
            Nhận thưởng
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/dashboard/albums/new')}
            sx={{
              bgcolor: PRIMARY,
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              boxShadow: 'none',
              '&:hover': { bgcolor: '#0D47A1', boxShadow: 'none' },
            }}
          >
            + Tạo Album
          </Button>
        </Stack>
      </Stack>

      {/* ===== STATS ROW ===== */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
        {/* Album count card */}
        <Card
          sx={{
            flex: 1,
            borderRadius: 3,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            border: '1px solid #E0E0E0',
          }}
        >
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: '#E3F2FD',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FolderIcon sx={{ color: PRIMARY, fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                Album
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                {albums.length} / {MAX_ALBUMS}
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* Storage card */}
        <Card
          sx={{
            flex: 1,
            borderRadius: 3,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            border: '1px solid #E0E0E0',
          }}
        >
          <CardContent sx={{ py: 2.5 }}>
            <Stack direction="row" alignItems="center" spacing={2} mb={1}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: '#FFF3E0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CloudIcon sx={{ color: '#EF6C00', fontSize: 28 }} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" color="text.secondary" fontWeight={500}>
                  Dung lượng Drive
                </Typography>
                <Typography variant="h6" fontWeight={700}>
                  {USED_STORAGE_GB} GB / {MAX_STORAGE_GB} GB
                </Typography>
              </Box>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={parseFloat(STORAGE_PERCENT)}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: '#FFF3E0',
                mb: 1,
                '& .MuiLinearProgress-bar': {
                  bgcolor: '#EF6C00',
                  borderRadius: 4,
                },
              }}
            />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" color="text.secondary">
                {STORAGE_PERCENT}% đã sử dụng
              </Typography>
              <Button
                size="small"
                sx={{
                  textTransform: 'none',
                  fontSize: 12,
                  color: PRIMARY,
                  fontWeight: 600,
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
          p: 2,
          mb: 2,
          borderRadius: 3,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          border: '1px solid #E0E0E0',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ md: 'center' }}
        >
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              displayEmpty
              sx={{ borderRadius: 2, bgcolor: 'background.paper' }}
            >
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
                    <SearchIcon sx={{ color: '#9E9E9E' }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              minWidth: 220,
              flex: 1,
              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.paper' },
            }}
          />

          <TextField
            type="date"
            size="small"
            placeholder="Chọn ngày"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{
              minWidth: 160,
              '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.paper' },
            }}
          />

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              displayEmpty
              sx={{ borderRadius: 2, bgcolor: 'background.paper' }}
            >
              <MenuItem value="all">Tất cả Album</MenuItem>
              <MenuItem value="published">Đã xuất bản</MenuItem>
              <MenuItem value="draft">Bản nháp</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* ===== TAB CHIPS ROW ===== */}
      <Stack direction="row" spacing={1} mb={3} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {TAB_CHIPS.map((tab) => {
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
                      bgcolor: isActive ? '#fff' : '#E0E0E0',
                      color: isActive ? PRIMARY : '#616161',
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
                bgcolor: isActive ? PRIMARY : '#fff',
                color: isActive ? '#fff' : '#424242',
                border: isActive ? 'none' : '1px solid #E0E0E0',
                '&:hover': {
                  bgcolor: isActive ? '#0D47A1' : '#F5F5F5',
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
            <Card key={i} sx={{ borderRadius: 3, overflow: 'hidden' }}>
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
            borderRadius: 3,
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
              borderRadius: 2,
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
          {filteredAlbums.map((album) => (
            <Card
              key={album.id}
              sx={{
                borderRadius: 3,
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                border: '1px solid #E0E0E0',
                overflow: 'hidden',
                transition: 'box-shadow 0.2s',
                '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' },
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
                    bgcolor: '#F5F5F5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    backgroundImage: album.cover_url ? `url(${album.cover_url})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {!album.cover_url && (
                    <ImageIcon sx={{ fontSize: 48, color: '#BDBDBD' }} />
                  )}
                </Box>

                {/* RIGHT: Content */}
                <Box sx={{ flex: 1, p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {/* Row 1: Title + drive chip */}
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: 16 }}>
                      {album.title}
                    </Typography>
                    {album.drive_link && (
                      <Chip
                        size="small"
                        label="Album tạo từ Link Drive"
                        icon={<LinkIcon sx={{ fontSize: 14 }} />}
                        sx={{
                          height: 24,
                          fontSize: 11,
                          fontWeight: 500,
                          bgcolor: '#E3F2FD',
                          color: PRIMARY,
                          '& .MuiChip-icon': { color: PRIMARY },
                        }}
                      />
                    )}
                  </Stack>

                  {/* Row 2: Date/time */}
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
                    {formatDateTime(album.created_at)}
                  </Typography>

                  {/* Row 3: Info chips */}
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.5 }}>
                    <Chip
                      size="small"
                      label={`Ảnh gốc: ${album.photo_count}`}
                      variant="outlined"
                      sx={{
                        height: 26,
                        fontSize: 12,
                        fontWeight: 500,
                        borderColor: '#4CAF50',
                        color: '#2E7D32',
                      }}
                    />
                    <Chip
                      size="small"
                      label={`Ảnh chọn: ${album.total_selections}/${album.max_selections > 0 ? album.max_selections : '∞'}`}
                      variant="outlined"
                      sx={{
                        height: 26,
                        fontSize: 12,
                        fontWeight: 500,
                        borderColor: PRIMARY,
                        color: PRIMARY,
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
                        borderRadius: 2,
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
                        borderRadius: 2,
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
                        borderRadius: 2,
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
                      sx={{
                        textTransform: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 2,
                        bgcolor: PRIMARY,
                        boxShadow: 'none',
                        '&:hover': { bgcolor: '#0D47A1', boxShadow: 'none' },
                      }}
                    >
                      + Thêm Ảnh chỉnh sửa
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
            sx={{ textTransform: 'none', borderRadius: 2, boxShadow: 'none' }}
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
