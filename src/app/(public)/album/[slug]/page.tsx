'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Pagination from '@mui/material/Pagination';
import {
  usePublicPhotosPaginated,
  usePhotoPagePrefetcher,
  invalidateAlbumPhotoPages,
  DEFAULT_PAGE_SIZE,
} from '@/hooks/usePhotosPaginated';
import type { PhotoWithUrls, PhotoFilter } from '@/types/photo';
// infinite scroll removed — CSS columns + dynamic items causes scroll jumping
// contentVisibility: 'auto' on each card handles off-screen performance
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  IconButton,
  Drawer,
  Paper,
  CircularProgress,
  Snackbar,
  Alert,
  Chip,
  Divider,
  Fade,
  useMediaQuery,
  useTheme,
  InputAdornment,
  Avatar,
  Stack,
  Tabs,
  Tab,
} from '@mui/material';
import {
  LockOutlined as LockOutlinedIcon,
  ThumbUp as ThumbUpIcon,
  ThumbUpOutlined as ThumbUpOutlinedIcon,
  ChatBubbleOutline as ChatBubbleOutlineIcon,
  Close as CloseIcon,
  Send as SendIcon,
  PhotoLibrary as PhotoLibraryIcon,
  CheckCircle as CheckCircleIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
  Check as CheckIcon,
  ContentCopy as CopyIcon,
  FavoriteBorder as FavoriteBorderIcon,
  Share as ShareIcon,
  Sort as SortIcon,
} from '@mui/icons-material';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@/lib/supabase/client';
import { getDriveDownloadUrl } from '@/lib/utils/drive';
import { useParams } from 'next/navigation';

// ----- Types -----

interface Album {
  id: string;
  studio_id: string;
  title: string;
  slug: string;
  description: string | null;
  password_hash: string | null;
  max_selections: number | null;
  allow_download: boolean;
  allow_comments: boolean;
  is_published: boolean;
  photo_count: number;
  total_selections: number;
  created_at: string;
  cover_photo_id: string | null;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  studios?: {
    name: string;
    slug: string;
    phone: string | null;
    address: string | null;
  };
}

// Photo rows now come from the paginated RPC with resolved URLs — the
// PhotoWithUrls type carries everything needed to render the card +
// denormalized counts (like_count / selection_count / comment_count).
type Photo = PhotoWithUrls;

interface Comment {
  id: string;
  photo_id: string;
  album_id: string;
  author_type: 'studio' | 'visitor';
  visitor_token: string | null;
  author_name: string;
  content: string;
  created_at: string;
  deleted_at: string | null;
}

// ----- Colors -----
const PRIMARY = '#1565C0';
const ACCENT = '#C9A96E';
const LIKE_COLOR = '#F59E0B';
const ACTION_GREEN = '#059669';
const BG_DARK = '#1A1A2E';
const BG_DARKER = '#0F0F1A';

// ----- CSS Animations -----
const cssAnimations = `
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(60px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
@keyframes slideInUp {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes overlineReveal {
  from { width: 0; opacity: 0; }
  to { width: 60px; opacity: 1; }
}
`;

// ----- Component -----

export default function PublicAlbumPage() {
  const params = useParams();
  const slug = params.slug as string;
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // State
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Password
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  // Visitor
  const [visitorToken, setVisitorToken] = useState('');

  // Visitor-scoped interactions — track ONLY what this visitor did so the
  // UI can show "my" like/selection state distinct from totals.
  const [selections, setSelections] = useState<Set<string>>(new Set());
  const [likes, setLikes] = useState<Set<string>>(new Set());

  // RPC-based album counts (accurate, from DB) — drives the tab badges.
  const [albumCounts, setAlbumCounts] = useState<any>(null);

  // Tabs + pagination (all reset together when the user changes any of them).
  const [photoTypeTab, setPhotoTypeTab] = useState(0);
  const [subTab, setSubTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Photo groups for this album
  const [groups, setGroups] = useState<any[]>([]);

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Comments
  const [commentDrawerOpen, setCommentDrawerOpen] = useState(false);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  // Hover state for photo cards
  // hoveredPhotoId removed — using pure CSS :hover for performance

  // Scroll state for sticky navbar
  const [scrolled, setScrolled] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'warning' | 'error' | 'info';
  }>({ open: false, message: '', severity: 'info' });

  const showSnackbar = (message: string, severity: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  // ----- Scroll listener -----
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > window.innerHeight * 0.7);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ----- Fetch album meta (photos come from the paginated hook) -----
  useEffect(() => {
    async function fetchAlbum() {
      setLoading(true);
      const { data, error } = await supabase
        .from('albums')
        .select('*, studios(name, slug, phone, address)')
        .eq('slug', slug)
        .eq('is_published', true)
        .is('deleted_at', null)
        .single();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const albumData = data as Album;
      setAlbum(albumData);

      if (albumData.password_hash) {
        const stored = sessionStorage.getItem(`album_auth_${albumData.id}`);
        if (stored === 'true') {
          setAuthenticated(true);
        } else {
          setNeedsPassword(true);
        }
      }
      setLoading(false);
    }

    fetchAlbum();
  }, [slug, supabase]);

  // Fetch album counts via RPC — used for tab badges, independent of the
  // currently rendered page so the UI shows true totals.
  const fetchAlbumCounts = useCallback(async () => {
    if (!album) return;
    const { data } = await supabase.rpc('get_album_counts', { p_album_id: album.id });
    if (data) setAlbumCounts(data);
  }, [album, supabase]);

  // Fetch photo groups with counts for this album.
  const fetchGroups = useCallback(async () => {
    if (!album) return;
    const { data: groupsData } = await supabase
      .from('photo_groups')
      .select('*')
      .eq('album_id', album.id)
      .order('sort_order');
    if (!groupsData || groupsData.length === 0) { setGroups([]); return; }

    const groupIds = groupsData.map((g: any) => g.id);
    const { data: countRows } = await supabase
      .from('photos')
      .select('group_id')
      .eq('album_id', album.id)
      .in('group_id', groupIds);

    const countMap = new Map<string, number>();
    for (const row of (countRows || [])) {
      if (row.group_id) {
        countMap.set(row.group_id, (countMap.get(row.group_id) || 0) + 1);
      }
    }
    setGroups(groupsData.map((g: any) => ({ ...g, photoCount: countMap.get(g.id) || 0 })));
  }, [album, supabase]);

  // Derive pagination query params from UI state.
  const photoType: 'original' | 'edited' = photoTypeTab === 0 ? 'original' : 'edited';
  const filter: PhotoFilter =
    subTab === 1 ? 'liked' : subTab === 2 ? 'selected' : subTab === 3 ? 'commented' : 'all';

  // Reset to page 1 whenever filter/tab/search changes so the user doesn't
  // land on an empty page after switching to a smaller result set.
  useEffect(() => {
    setCurrentPage(1);
  }, [photoType, filter, searchQuery, selectedGroupId]);

  // Paginated photo fetch from server — page data includes signed URLs
  // and denormalized counters used for the card badges/toggles.
  const {
    data: pageResult,
    isLoading: photosLoading,
    isFetching: photosFetching,
  } = usePublicPhotosPaginated(album?.id || '', {
    photoType,
    filter,
    search: searchQuery.trim() || undefined,
    sort: 'sort_order',
    sortDir: 'asc',
    page: currentPage,
    pageSize: DEFAULT_PAGE_SIZE,
    groupId: selectedGroupId,
  });

  const photos: Photo[] = useMemo(
    () => (album && (authenticated || !album.password_hash) ? pageResult?.data ?? [] : []),
    [album, authenticated, pageResult]
  );
  const totalPages = pageResult?.totalPages ?? 1;
  const totalCount = pageResult?.totalCount ?? 0;

  const prefetchPage = usePhotoPagePrefetcher('public', album?.id || '');

  // Prefetch the next page quietly so flipping feels instant.
  useEffect(() => {
    if (!album?.id || currentPage >= totalPages) return;
    prefetchPage({
      photoType,
      filter,
      search: searchQuery.trim() || undefined,
      sort: 'sort_order',
      sortDir: 'asc',
      page: currentPage + 1,
      pageSize: DEFAULT_PAGE_SIZE,
      groupId: selectedGroupId,
    });
  }, [album?.id, currentPage, totalPages, photoType, filter, searchQuery, selectedGroupId, prefetchPage]);

  const handlePageChange = useCallback((_: unknown, next: number) => {
    setCurrentPage(next);
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Pull filenames for "Copy mã chọn/thích" directly from the table —
  // covers the whole album regardless of current page.
  const copyInteractionFilenames = useCallback(
    async (kind: 'liked' | 'selected') => {
      if (!album) return;
      const column = kind === 'liked' ? 'like_count' : 'selection_count';
      const { data } = await supabase
        .from('photos')
        .select('original_filename')
        .eq('album_id', album.id)
        .gt(column, 0)
        .order('sort_order');
      const names = (data ?? []).map((r: { original_filename: string }) => r.original_filename);
      if (names.length === 0) {
        showSnackbar(kind === 'selected' ? 'Chưa có ảnh nào được chọn' : 'Chưa có ảnh nào được thích', 'warning');
        return;
      }
      await navigator.clipboard.writeText(names.join('\n'));
      showSnackbar(`Đã copy ${names.length} tên file ${kind === 'selected' ? 'đã chọn' : 'đã thích'}`, 'success');
    },
    [album, supabase]
  );

  // ----- Visitor token & likes -----
  useEffect(() => {
    if (!album) return;
    const key = `ps_visitor_${album.id}`;
    let token = localStorage.getItem(key);
    if (!token) {
      token = uuidv4();
      localStorage.setItem(key, token);
    }
    setVisitorToken(token);

    // Load author name
    const savedName = localStorage.getItem('ps_visitor_name');
    if (savedName) setCommentAuthor(savedName);

    // Load MY likes (for toggling UI)
    async function loadLikes() {
      const { data } = await supabase
        .from('photo_likes')
        .select('photo_id')
        .eq('album_id', album!.id)
        .eq('visitor_token', token!);
      if (data) {
        setLikes(new Set(data.map((l: { photo_id: string }) => l.photo_id)));
      }
    }
    loadLikes();

    // Load badge counts from DB
    fetchAlbumCounts();
    fetchGroups();

    // Auto-refresh badge counts every 15 seconds.
    const interval = setInterval(() => {
      fetchAlbumCounts();
    }, 15000);
    return () => clearInterval(interval);
  }, [album, supabase, fetchAlbumCounts, fetchGroups]);

  // ----- Load selections -----
  useEffect(() => {
    if (!visitorToken || !album) return;
    loadSelections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitorToken, album]);

  // ----- Realtime subscription — invalidate the paginated photo query
  // so denormalized counts (like_count/selection_count/comment_count)
  // refresh automatically when any visitor interacts. -----
  useEffect(() => {
    if (!album) return;
    const albumId = album.id;
    const invalidatePages = () => invalidateAlbumPhotoPages(queryClient, 'public', albumId);

    const channel = supabase
      .channel('public-album-changes-' + albumId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_likes', filter: `album_id=eq.${albumId}` }, () => {
        invalidatePages();
        fetchAlbumCounts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_selections', filter: `album_id=eq.${albumId}` }, () => {
        invalidatePages();
        fetchAlbumCounts();
        loadSelections();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_comments', filter: `album_id=eq.${albumId}` }, () => {
        invalidatePages();
        fetchAlbumCounts();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album, supabase, queryClient]);

  async function loadSelections() {
    if (!album) return;
    const { data } = await supabase
      .from('photo_selections')
      .select('id, photo_id')
      .eq('album_id', album.id)
      .eq('visitor_token', visitorToken);

    if (data) {
      setSelections(new Set(data.map((s: { photo_id: string }) => s.photo_id)));
    }
  }

  // ----- Password submit -----
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!album) return;

    setVerifyingPassword(true);
    try {
      const { verifyAlbumPassword } = await import('@/actions/public');
      const result = await verifyAlbumPassword(album.slug, passwordInput);

      if (result.success) {
        sessionStorage.setItem(`album_auth_${album.id}`, 'true');
        setAuthenticated(true);
        setNeedsPassword(false);
        // photos hook will kick in automatically once `authenticated` flips
      } else {
        setPasswordError(result.error || 'Mật khẩu không đúng');
      }
    } catch {
      setPasswordError('Có lỗi xảy ra. Vui lòng thử lại.');
    }
    setVerifyingPassword(false);
  }

  // ----- Toggle like (Supabase) -----
  // Reads the denormalized `photo.like_count` to decide whether a delete
  // or insert is needed — avoids a stale-closure ref and a round-trip.
  const toggleLike = useCallback(
    async (photo: Photo) => {
      if (!album || !visitorToken) return;
      const isAnyoneLiked = (photo.like_count || 0) > 0;

      if (isAnyoneLiked) {
        setLikes((prev) => { const next = new Set(prev); next.delete(photo.id); return next; });
        await supabase
          .from('photo_likes')
          .delete()
          .eq('photo_id', photo.id)
          .eq('album_id', album.id);
      } else {
        setLikes((prev) => { const next = new Set(prev); next.add(photo.id); return next; });
        await supabase.from('photo_likes').upsert({
          photo_id: photo.id,
          album_id: album.id,
          visitor_token: visitorToken,
        }, { onConflict: 'photo_id,visitor_token', ignoreDuplicates: true });
      }
      // Realtime subscription will refresh page data — no manual refetch.
    },
    [album, visitorToken, supabase]
  );

  // ----- Toggle selection -----
  const toggleSelection = useCallback(
    async (photo: Photo) => {
      if (!album || !visitorToken) return;
      const isAnyoneSelected = (photo.selection_count || 0) > 0;

      if (isAnyoneSelected) {
        setSelections((prev) => { const next = new Set(prev); next.delete(photo.id); return next; });
        await supabase
          .from('photo_selections')
          .delete()
          .eq('album_id', album.id)
          .eq('photo_id', photo.id);
      } else {
        // Enforce max_selections using the authoritative RPC count.
        const totalSelected = albumCounts?.selected_photos || 0;
        if (album.max_selections && totalSelected >= album.max_selections) {
          showSnackbar(`Đã chọn tối đa ${album.max_selections} ảnh`, 'warning');
          return;
        }
        setSelections((prev) => { const next = new Set(prev); next.add(photo.id); return next; });
        await supabase.from('photo_selections').insert({
          album_id: album.id,
          photo_id: photo.id,
          visitor_token: visitorToken,
        });
      }
    },
    [album, visitorToken, supabase, albumCounts]
  );

  // ----- Comments -----
  async function loadComments(photoId: string) {
    setLoadingComments(true);
    const { data } = await supabase
      .from('photo_comments')
      .select('*')
      .eq('photo_id', photoId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (data) setComments(data);
    setLoadingComments(false);
  }

  function openCommentPanel(photoId: string) {
    setActivePhotoId(photoId);
    setCommentDrawerOpen(true);
    loadComments(photoId);
  }

  async function handleSendComment() {
    if (!activePhotoId || !commentText.trim() || !commentAuthor.trim() || !album) return;

    const authorName = commentAuthor.trim();
    localStorage.setItem('ps_visitor_name', authorName);

    const { data } = await supabase
      .from('photo_comments')
      .insert({
        photo_id: activePhotoId,
        album_id: album.id,
        author_type: 'visitor',
        visitor_token: visitorToken,
        author_name: authorName,
        content: commentText.trim(),
      })
      .select()
      .single();

    if (data) {
      setComments((prev) => [...prev, data]);
      setCommentText('');
      showSnackbar('Đã gửi bình luận', 'success');
    }
  }

  // ----- Download photo -----
  async function handleDownload(photo: Photo) {
    if (!album?.allow_download) {
      showSnackbar('Album không cho phép tải ảnh', 'warning');
      return;
    }

    try {
      if (photo.drive_file_id) {
        // Drive files: open download URL in new tab (avoids CORS)
        window.open(getDriveDownloadUrl(photo.drive_file_id), '_blank');
        showSnackbar('Đang tải ' + photo.original_filename, 'success');
        return;
      }

      // Fallback: signed URL fetch
      const url = photo.url;
      if (!url) return;
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = photo.original_filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch {
      showSnackbar('Không thể tải ảnh', 'error');
    }
  }

  // Photo type counts from RPC.
  const originalCount = albumCounts?.original_count || 0;
  const editedCount = albumCounts?.edited_count || 0;

  // Tab badge counts from RPC (independent of current page).
  const totalCountForType = photoTypeTab === 0 ? originalCount : editedCount;
  const likedCount = albumCounts?.liked_photos || 0;
  const selectedCount = albumCounts?.selected_photos || 0;
  const commentedCount = albumCounts?.commented_photos || 0;

  // ----- Lightbox slides (current page only) -----
  const lightboxSlides = useMemo(
    () => photos.map((p) => ({ src: p.url })),
    [photos]
  );

  // ----- Selection text (authoritative total from RPC) -----
  const totalSelections = albumCounts?.selected_photos || 0;
  const selectionText = album?.max_selections
    ? `${totalSelections}/${album.max_selections} đã chọn`
    : `${totalSelections}/∞ đã chọn`;

  // ----- Hero background image -----
  // Prefers cover photo if it happens to be on the current page; otherwise
  // falls back to the first photo of page 1.
  const heroImage = useMemo(() => {
    if (album?.cover_photo_id) {
      const coverPhoto = photos.find(p => p.id === album.cover_photo_id);
      if (coverPhoto) return coverPhoto.url || coverPhoto.thumbnailUrl || '';
    }
    return photos.length > 0 ? (photos[0].url || photos[0].thumbnailUrl || '') : '';
  }, [album, photos]);

  // ----- Scroll to grid -----
  function scrollToGrid() {
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ----- Render: Loading -----
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          backgroundColor: BG_DARK,
        }}
      >
        <CircularProgress sx={{ color: ACCENT }} />
      </Box>
    );
  }

  // ----- Render: Not found -----
  if (notFound || !album) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          gap: 2,
          px: 3,
          backgroundColor: BG_DARK,
        }}
      >
        <PhotoLibraryIcon sx={{ fontSize: 64, color: 'rgba(255,255,255,0.2)' }} />
        <Typography variant="h4" sx={{ color: '#fff', textAlign: 'center', fontWeight: 700 }}>
          Album không tìm thấy
        </Typography>
        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
          Album này không tồn tại hoặc đã bị xóa.
        </Typography>
      </Box>
    );
  }

  // ----- Render: Password -----
  if (needsPassword && !authenticated) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          px: 3,
          backgroundColor: BG_DARK,
        }}
      >
        <Card
          sx={{
            maxWidth: 420,
            width: '100%',
            textAlign: 'center',
            p: { xs: 3, sm: 4 },
            borderRadius: 3,
            backgroundColor: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          <CardContent>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'rgba(201,169,110,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 3,
              }}
            >
              <LockOutlinedIcon sx={{ fontSize: 32, color: ACCENT }} />
            </Box>
            <Typography variant="h5" sx={{ mb: 1, fontWeight: 700, color: '#fff' }}>
              Album được bảo vệ
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 3 }}>
              Vui lòng nhập mật khẩu để xem album &ldquo;{album.title}&rdquo;
            </Typography>
            <form onSubmit={handlePasswordSubmit}>
              <TextField
                fullWidth
                type="password"
                placeholder="Nhập mật khẩu"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError('');
                }}
                error={!!passwordError}
                helperText={passwordError}
                sx={{
                  mb: 2,
                  '& .MuiOutlinedInput-root': {
                    color: '#fff',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                    '&.Mui-focused fieldset': { borderColor: ACCENT },
                  },
                  '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.3)' },
                }}
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={verifyingPassword}
                sx={{
                  py: 1.5,
                  backgroundColor: ACCENT,
                  color: BG_DARK,
                  '&:hover': { backgroundColor: '#B8964F' },
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '1rem',
                }}
              >
                {verifyingPassword ? <CircularProgress size={24} sx={{ color: BG_DARK }} /> : 'Xem album'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // ----- Render: No photos -----
  if (photos.length === 0 && !loading) {
    return (
      <Box sx={{ minHeight: '100vh', backgroundColor: BG_DARK }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            py: 12,
            gap: 2,
          }}
        >
          <PhotoLibraryIcon sx={{ fontSize: 64, color: 'rgba(255,255,255,0.15)' }} />
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.5)' }}>
            Album này chưa có ảnh nào
          </Typography>
        </Box>
        {renderFooter()}
      </Box>
    );
  }

  // ----- Nav items -----
  const navItems = [
    { label: 'TẤT CẢ', count: totalCountForType, tab: 0 },
    { label: 'ĐÃ THÍCH', count: likedCount, tab: 1 },
    { label: 'ĐÃ CHỌN', count: selectedCount, tab: 2 },
    { label: 'BÌNH LUẬN', count: commentedCount, tab: 3 },
  ];

  // ----- Footer renderer -----
  function renderFooter() {
    const studio = album!.studios;
    return (
      <Box
        sx={{
          backgroundColor: BG_DARKER,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          py: { xs: 5, md: 6 },
          px: { xs: 3, md: 4 },
          textAlign: 'center',
        }}
      >
        {studio && (
          <>
            <Typography
              sx={{
                color: ACCENT,
                fontWeight: 300,
                fontSize: '0.75rem',
                letterSpacing: '3px',
                textTransform: 'uppercase',
                mb: 1.5,
              }}
            >
              Photography Studio
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#fff', mb: 1 }}>
              {studio.name}
            </Typography>
            {studio.phone && (
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 0.5 }}>
                {studio.phone}
              </Typography>
            )}
            {studio.address && (
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 2 }}>
                {studio.address}
              </Typography>
            )}
          </>
        )}
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', my: 3, mx: 'auto', maxWidth: 400 }} />
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem' }}>
          Powered by San San
        </Typography>
      </Box>
    );
  }

  // ----- Photo card renderer -----
  function renderPhotoCard(photo: Photo) {
    const isMySelection = selections.has(photo.id);
    const isAnyoneSelected = photo.selection_count > 0;
    const isSelected = isMySelection || isAnyoneSelected;
    const isMyLike = likes.has(photo.id);
    const isAnyoneLiked = photo.like_count > 0;
    const isLiked = isMyLike || isAnyoneLiked;

    return (
      <Box
        key={photo.id}
        className="photo-card"
        sx={{
          breakInside: 'avoid',
          mb: { xs: 1, sm: 1.5, md: 2 },
          position: 'relative',
          borderRadius: '7px',
          overflow: 'hidden',
          cursor: 'pointer',
          contentVisibility: 'auto',
          containIntrinsicSize: '200px',
          '&:hover .photo-overlay': { opacity: 1 },
          '&:hover .photo-actions': { opacity: 1 },
        }}
      >
        <Box
          component="img"
          src={photo.thumbnailUrl || photo.url}
          alt={photo.original_filename}
          onClick={() => {
            const idx = photos.findIndex((p) => p.id === photo.id);
            setLightboxIndex(idx >= 0 ? idx : 0);
            setLightboxOpen(true);
          }}
          sx={{
            width: '100%',
            display: 'block',
            transition: 'transform 0.3s ease',
          }}
          loading="lazy"
          decoding="async"
        />

        {/* Dark overlay on hover (pure CSS) */}
        <Box
          className="photo-overlay"
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            opacity: 0,
            transition: 'opacity 0.3s ease',
            pointerEvents: 'none',
          }}
        />

        {/* Like button - top left */}
        <Box
          className="photo-actions"
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            opacity: isAnyoneLiked ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        >
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              toggleLike(photo);
            }}
            sx={{
              backgroundColor: isLiked ? '#E53935' : 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(8px)',
              color: '#fff',
              width: 36,
              height: 36,
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: isLiked ? '#C62828' : 'rgba(0,0,0,0.7)',
                transform: 'scale(1.1)',
              },
            }}
          >
            {isLiked ? (
              <FavoriteBorderIcon sx={{ fontSize: 18, color: '#fff' }} />
            ) : (
              <FavoriteBorderIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Box>

        {/* Selected indicator - top right */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            opacity: isSelected ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        >
          <CheckCircleIcon
            sx={{
              color: ACTION_GREEN,
              fontSize: 26,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
            }}
          />
        </Box>

        {/* Bottom overlay with filename + action buttons */}
        <Box
          className="photo-actions"
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
            pt: 5,
            pb: 1.2,
            px: 1.2,
            opacity: 0,
            transition: 'opacity 0.3s ease',
          }}
        >
          {/* Filename */}
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255,255,255,0.8)',
              display: 'block',
              mb: 0.8,
              px: 0.3,
              fontSize: '0.78rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 400,
            }}
          >
            {photo.original_filename}
          </Typography>

          {/* Action buttons row */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); toggleSelection(photo); }}
              sx={{
                backgroundColor: isSelected ? ACCENT : 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(8px)',
                color: '#fff',
                width: 34, height: 34,
                transition: 'all 0.2s ease',
                '&:hover': { backgroundColor: isSelected ? '#B8972F' : 'rgba(255,255,255,0.3)', transform: 'scale(1.1)' },
              }}
              title="Chọn"
            >
              {isSelected ? <CheckIcon sx={{ fontSize: 17 }} /> : <CheckCircleIcon sx={{ fontSize: 17 }} />}
            </IconButton>

            {album!.allow_comments && (
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); openCommentPanel(photo.id); }}
                sx={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(8px)',
                  color: '#fff',
                  width: 34, height: 34,
                  transition: 'all 0.2s ease',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.3)', transform: 'scale(1.1)' },
                }}
                title="Bình luận"
              >
                <ChatBubbleOutlineIcon sx={{ fontSize: 17 }} />
              </IconButton>
            )}

            {album!.allow_download && (
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); handleDownload(photo); }}
                sx={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(8px)',
                  color: '#fff',
                  width: 34, height: 34,
                  transition: 'all 0.2s ease',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.3)', transform: 'scale(1.1)' },
                }}
                title="Tải về"
              >
                <DownloadIcon sx={{ fontSize: 17 }} />
              </IconButton>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  // =============================================
  // MAIN RENDER
  // =============================================
  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: BG_DARK }}>
      {/* Inject CSS animations */}
      <style>{cssAnimations}</style>

      {/* ========== HERO SECTION ========== */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Background image (blurred) */}
        {heroImage && (
          <Box
            component="img"
            src={heroImage}
            alt=""
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(2px) brightness(0.5)',
              transform: 'scale(1.05)',
              animation: 'fadeIn 1.2s ease both',
            }}
          />
        )}

        {/* Dark overlay */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(15,15,26,0.2) 0%, rgba(15,15,26,0.4) 50%, rgba(26,26,46,0.85) 100%)',
          }}
        />

        {/* Hero content */}
        <Box
          sx={{
            position: 'relative',
            zIndex: 2,
            textAlign: 'center',
            px: 3,
            maxWidth: 800,
          }}
        >
          {/* Gold overline */}
          <Typography
            sx={{
              color: ACCENT,
              fontSize: { xs: '0.7rem', md: '0.8rem' },
              fontWeight: 500,
              letterSpacing: '4px',
              textTransform: 'uppercase',
              mb: 2,
              animation: 'fadeInUp 0.8s ease 0.2s both',
            }}
          >
            PHOTOGRAPHY STUDIO
          </Typography>

          {/* Gold line */}
          <Box
            sx={{
              width: 60,
              height: 1,
              backgroundColor: ACCENT,
              mx: 'auto',
              mb: 3,
              animation: 'fadeIn 1s ease 0.4s both',
            }}
          />

          {/* Album title */}
          <Typography
            variant="h1"
            sx={{
              color: '#fff',
              fontWeight: 800,
              fontSize: { xs: '2.5rem', sm: '3.5rem', md: '4.5rem', lg: '5rem' },
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              mb: 2,
              animation: 'fadeInUp 0.8s ease 0.5s both',
            }}
          >
            {album.title}
          </Typography>

          {/* Description */}
          {album.description && (
            <Typography
              sx={{
                color: 'rgba(255,255,255,0.6)',
                fontSize: { xs: '1rem', md: '1.15rem' },
                fontWeight: 300,
                maxWidth: 600,
                mx: 'auto',
                lineHeight: 1.7,
                animation: 'fadeInUp 0.8s ease 0.7s both',
              }}
            >
              {album.description}
            </Typography>
          )}

          {/* Scroll down indicator */}
          <Box
            onClick={scrollToGrid}
            sx={{
              mt: 5,
              cursor: 'pointer',
              animation: 'fadeInUp 0.8s ease 1s both',
              '&:hover': { opacity: 0.8 },
            }}
          >
            <Typography
              sx={{
                color: 'rgba(255,255,255,0.35)',
                fontSize: '0.75rem',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                mb: 1,
              }}
            >
              Xem ảnh
            </Typography>
            <Box
              sx={{
                width: 24,
                height: 40,
                border: '2px solid rgba(255,255,255,0.2)',
                borderRadius: 12,
                mx: 'auto',
                position: 'relative',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  top: 6,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 4,
                  height: 8,
                  backgroundColor: ACCENT,
                  borderRadius: 2,
                  animation: 'slideUp 1.5s ease infinite',
                },
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* ========== STICKY NAVBAR ========== */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          backgroundColor: scrolled ? 'rgba(15,15,26,0.95)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
          transition: 'all 0.4s ease',
          py: scrolled ? 0 : 2,
          pointerEvents: scrolled ? 'auto' : 'none',
          opacity: scrolled ? 1 : 0,
        }}
      >
        <Box
          sx={{
            maxWidth: 1200,
            mx: 'auto',
            px: { xs: 2, md: 4 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            minHeight: 60,
          }}
        >
          {/* Left: Album title + selection count */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '1.15rem' }}>
              {album?.title}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
              {selectionText}
            </Typography>
          </Box>

          {/* Right: Toolbar buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, md: 1.5 }, flexWrap: 'wrap' }}>
            {[
              { icon: <CopyIcon sx={{ fontSize: 19 }} />, label: 'Copy mã chọn', onClick: () => copyInteractionFilenames('selected') },
              { icon: <FavoriteBorderIcon sx={{ fontSize: 19 }} />, label: 'Copy mã thích', onClick: () => copyInteractionFilenames('liked') },
              { icon: <SortIcon sx={{ fontSize: 19 }} />, label: 'Sắp xếp', onClick: () => {} },
              { icon: <DownloadIcon sx={{ fontSize: 19 }} />, label: 'Tải về', onClick: () => {
                showSnackbar('Di chuột vào ảnh → nhấn "Tải về" để tải từng ảnh', 'info');
              }},
              { icon: <ShareIcon sx={{ fontSize: 19 }} />, label: 'Chia sẻ', onClick: () => {
                navigator.clipboard.writeText(window.location.href);
                showSnackbar('Đã copy link album', 'success');
              }},
            ].map((btn, i) => (
              <Box
                key={i}
                onClick={btn.onClick}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
                  color: 'rgba(255,255,255,0.6)', transition: 'color 0.2s',
                  '&:hover': { color: '#fff' },
                  whiteSpace: 'nowrap',
                }}
              >
                {btn.icon}
                <Typography sx={{ fontSize: { xs: '0.8rem', md: '0.92rem' }, fontWeight: 500, display: { xs: 'none', sm: 'block' } }}>
                  {btn.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ========== PHOTO GRID SECTION ========== */}
      <Box
        ref={gridRef}
        sx={{
          px: { xs: 2, sm: 3, md: 4, lg: 5 },
          pt: { xs: 6, md: 8 },
          pb: 4,
          maxWidth: 1600,
          mx: 'auto',
        }}
      >
        {/* Section header */}
        <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
          {/* Gold overline */}
          <Box
            sx={{
              width: 50,
              height: 1,
              backgroundColor: ACCENT,
              mx: 'auto',
              mb: 2,
            }}
          />
          <Typography
            sx={{
              color: ACCENT,
              fontSize: '0.7rem',
              fontWeight: 500,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              mb: 1,
            }}
          >
            Featured Portfolio
          </Typography>
          <Typography
            variant="h3"
            sx={{
              color: '#fff',
              fontWeight: 700,
              fontSize: { xs: '1.8rem', md: '2.5rem' },
              mb: 3,
            }}
          >
            {album.title}
          </Typography>

          {/* Selection chip */}
          <Chip
            label={selectionText}
            sx={{
              backgroundColor: 'rgba(201,169,110,0.12)',
              color: ACCENT,
              fontWeight: 600,
              fontSize: '0.85rem',
              border: `1px solid rgba(201,169,110,0.25)`,
              mb: 3,
            }}
          />
        </Box>

        {/* Photo type tabs */}
        <Box sx={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
          <Chip
            label={`Ảnh Gốc (${originalCount})`}
            onClick={() => { setPhotoTypeTab(0); setSelectedGroupId(null); }}
            sx={{
              backgroundColor: photoTypeTab === 0 && !selectedGroupId ? '#1565C0' : 'rgba(255,255,255,0.08)',
              color: photoTypeTab === 0 && !selectedGroupId ? '#fff' : 'rgba(255,255,255,0.5)',
              fontWeight: 600,
              fontSize: '0.9rem',
              px: 2,
              py: 2.5,
              cursor: 'pointer',
              transition: 'all 0.2s',
              '&:hover': { backgroundColor: photoTypeTab === 0 && !selectedGroupId ? '#1565C0' : 'rgba(255,255,255,0.12)' },
            }}
          />
          {groups.filter((g: any) => g.photoCount > 0).map((group: any) => (
            <Chip
              key={group.id}
              label={`${group.name} (${group.photoCount})`}
              onClick={() => {
                setPhotoTypeTab(0);
                setSelectedGroupId(group.id);
                setSubTab(0);
              }}
              sx={{
                backgroundColor: selectedGroupId === group.id ? ACCENT : 'rgba(255,255,255,0.08)',
                color: selectedGroupId === group.id ? BG_DARK : 'rgba(255,255,255,0.5)',
                fontWeight: 600,
                fontSize: '0.9rem',
                px: 2,
                py: 2.5,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { backgroundColor: selectedGroupId === group.id ? '#B8964F' : 'rgba(255,255,255,0.12)' },
              }}
            />
          ))}
          <Chip
            label={`Ảnh Chỉnh Sửa (${editedCount})`}
            onClick={() => { setPhotoTypeTab(1); setSelectedGroupId(null); }}
            sx={{
              backgroundColor: photoTypeTab === 1 ? '#1565C0' : 'rgba(255,255,255,0.08)',
              color: photoTypeTab === 1 ? '#fff' : 'rgba(255,255,255,0.5)',
              fontWeight: 600,
              fontSize: '0.9rem',
              px: 2,
              py: 2.5,
              cursor: 'pointer',
              transition: 'all 0.2s',
              '&:hover': { backgroundColor: photoTypeTab === 1 ? '#1565C0' : 'rgba(255,255,255,0.12)' },
            }}
          />
        </Box>

        {/* Filter chips */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 1,
            mb: { xs: 3, md: 5 },
          }}
        >
          {navItems.map((item) => (
            <Chip
              key={item.tab}
              label={`${item.label} (${item.count})`}
              onClick={() => setSubTab(item.tab)}
              sx={{
                backgroundColor: subTab === item.tab ? ACCENT : 'rgba(255,255,255,0.05)',
                color: subTab === item.tab ? BG_DARK : 'rgba(255,255,255,0.5)',
                fontWeight: 600,
                fontSize: '0.78rem',
                letterSpacing: '0.5px',
                border: subTab === item.tab ? 'none' : '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                '&:hover': {
                  backgroundColor: subTab === item.tab ? '#B8964F' : 'rgba(255,255,255,0.1)',
                },
              }}
            />
          ))}

          {/* Inline search for mobile when navbar not visible */}
          {!scrolled && (
            <TextField
              size="small"
              placeholder="Tìm tên ảnh..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{
                width: { xs: '100%', sm: 200 },
                mt: { xs: 1, sm: 0 },
                '& .MuiOutlinedInput-root': {
                  borderRadius: '20px',
                  color: '#fff',
                  fontSize: '0.85rem',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                  '&.Mui-focused fieldset': { borderColor: ACCENT },
                },
                '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.25)' },
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.25)' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}
        </Box>

        {/* Masonry grid — current page only, server-paginated */}
        <Box
          sx={{
            columns: { xs: 2, sm: 3, md: 4, lg: 5 },
            columnGap: { xs: '8px', sm: '12px', md: '14px' },
          }}
        >
          {photos.map((photo) => renderPhotoCard(photo))}
        </Box>

        {/* Loading / empty states */}
        {photosLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} sx={{ color: ACCENT }} />
          </Box>
        )}
        {!photosLoading && photos.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <PhotoLibraryIcon sx={{ fontSize: 56, color: 'rgba(255,255,255,0.1)', mb: 2 }} />
            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.35)' }}>
              Không tìm thấy ảnh nào
            </Typography>
          </Box>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
              Trang {currentPage} / {totalPages} — Hiển thị{' '}
              {(currentPage - 1) * DEFAULT_PAGE_SIZE + 1}-
              {Math.min(currentPage * DEFAULT_PAGE_SIZE, totalCount)} / {totalCount} ảnh
              {photosFetching && !photosLoading ? ' — đang tải...' : ''}
            </Typography>
            <Pagination
              count={totalPages}
              page={currentPage}
              onChange={handlePageChange}
              shape="rounded"
              showFirstButton
              showLastButton
              siblingCount={1}
              boundaryCount={1}
              sx={{
                '& .MuiPaginationItem-root': {
                  color: 'rgba(255,255,255,0.7)',
                  borderColor: 'rgba(255,255,255,0.2)',
                  '&.Mui-selected': {
                    backgroundColor: ACCENT,
                    color: BG_DARK,
                    fontWeight: 700,
                    '&:hover': { backgroundColor: '#B8964F' },
                  },
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.08)' },
                },
              }}
            />
          </Stack>
        )}
      </Box>

      {/* ========== LIGHTBOX ========== */}
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        slides={lightboxSlides}
        plugins={[Zoom]}
        on={{
          view: ({ index }) => setLightboxIndex(index),
        }}
        toolbar={{
          buttons: [
            <IconButton
              key="like"
              onClick={() => {
                const photo = photos[lightboxIndex];
                if (photo) toggleLike(photo);
              }}
              sx={{ color: '#fff' }}
            >
              {photos[lightboxIndex] && likes.has(photos[lightboxIndex].id) ? (
                <ThumbUpIcon sx={{ color: LIKE_COLOR }} />
              ) : (
                <ThumbUpOutlinedIcon />
              )}
            </IconButton>,
            <IconButton
              key="select"
              onClick={() => {
                const photo = photos[lightboxIndex];
                if (photo) toggleSelection(photo);
              }}
              sx={{ color: '#fff' }}
            >
              {photos[lightboxIndex] && selections.has(photos[lightboxIndex].id) ? (
                <CheckCircleIcon sx={{ color: ACTION_GREEN }} />
              ) : (
                <CheckCircleIcon sx={{ opacity: 0.5 }} />
              )}
            </IconButton>,
            ...(album.allow_comments
              ? [
                  <IconButton
                    key="comment"
                    onClick={() => {
                      const photo = photos[lightboxIndex];
                      if (photo) openCommentPanel(photo.id);
                    }}
                    sx={{ color: '#fff' }}
                  >
                    <ChatBubbleOutlineIcon />
                  </IconButton>,
                ]
              : []),
            'close',
          ],
        }}
      />

      {/* ========== FLOATING SELECTION BAR ========== */}
      <Fade in={selections.size > 0}>
        <Paper
          elevation={0}
          sx={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            borderRadius: '50px',
            px: 3,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            backgroundColor: 'rgba(201,169,110,0.95)',
            backdropFilter: 'blur(12px)',
            color: BG_DARK,
            zIndex: 1200,
            minWidth: { xs: 'calc(100% - 32px)', sm: 'auto' },
            justifyContent: 'center',
            animation: 'slideInUp 0.4s ease both',
            boxShadow: '0 8px 32px rgba(201,169,110,0.3)',
          }}
        >
          <CheckCircleIcon sx={{ color: BG_DARK, fontSize: 20 }} />
          <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {selectionText}
          </Typography>
        </Paper>
      </Fade>

      {/* ========== COMMENT DRAWER ========== */}
      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={commentDrawerOpen}
        onClose={() => setCommentDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: isMobile ? '100%' : 420,
            maxHeight: isMobile ? '85vh' : '100vh',
            borderTopLeftRadius: isMobile ? 20 : 0,
            borderTopRightRadius: isMobile ? 20 : 0,
            backgroundColor: BG_DARKER,
            borderLeft: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
            color: '#fff',
          },
        }}
      >
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>
                Bình luận
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>
                {comments.length} bình luận
              </Typography>
            </Box>
            <IconButton
              onClick={() => setCommentDrawerOpen(false)}
              sx={{ color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' } }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', mb: 2 }} />

          {/* Comments list */}
          <Box sx={{ flexGrow: 1, overflowY: 'auto', mb: 2 }}>
            {loadingComments ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} sx={{ color: ACCENT }} />
              </Box>
            ) : comments.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <ChatBubbleOutlineIcon sx={{ fontSize: 40, color: 'rgba(255,255,255,0.1)', mb: 1 }} />
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                  Chưa có bình luận nào
                </Typography>
              </Box>
            ) : (
              <Stack spacing={2.5}>
                {comments.map((comment) => (
                  <Box key={comment.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Avatar
                        sx={{
                          width: 30,
                          height: 30,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          bgcolor: comment.author_type === 'studio' ? PRIMARY : ACCENT,
                          color: comment.author_type === 'studio' ? '#fff' : BG_DARK,
                        }}
                      >
                        {comment.author_name.charAt(0).toUpperCase()}
                      </Avatar>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#fff' }}>
                        {comment.author_name}
                      </Typography>
                      {comment.author_type === 'studio' && (
                        <Chip
                          label="Studio"
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            backgroundColor: 'rgba(21,101,192,0.2)',
                            color: '#64B5F6',
                            border: '1px solid rgba(21,101,192,0.3)',
                          }}
                        />
                      )}
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)', ml: 'auto' }}>
                        {new Date(comment.created_at).toLocaleDateString('vi-VN')}
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{ pl: 5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}
                    >
                      {comment.content}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>

          {/* Comment input */}
          <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.06)', pt: 2 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Tên của bạn"
              value={commentAuthor}
              onChange={(e) => setCommentAuthor(e.target.value)}
              sx={{
                mb: 1.5,
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                  '&.Mui-focused fieldset': { borderColor: ACCENT },
                },
                '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.2)' },
              }}
            />
            <TextField
              size="small"
              fullWidth
              multiline
              maxRows={3}
              placeholder="Viết bình luận..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendComment();
                }
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                  '&.Mui-focused fieldset': { borderColor: ACCENT },
                },
                '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.2)' },
              }}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={handleSendComment}
                        disabled={!commentText.trim() || !commentAuthor.trim()}
                        sx={{
                          color: ACCENT,
                          '&.Mui-disabled': { color: 'rgba(255,255,255,0.1)' },
                        }}
                      >
                        <SendIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>
        </Box>
      </Drawer>

      {/* ========== FOOTER ========== */}
      {renderFooter()}

      {/* ========== SNACKBAR ========== */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ borderRadius: 2 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
