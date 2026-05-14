'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSnackbar } from '@/components/providers/SnackbarProvider';
import ShareDialog from '@/components/album/ShareDialog';
import CopyByGroupDialog from '@/components/album/copy-by-group-dialog';
import {
  usePhotosPaginated,
  usePhotoPagePrefetcher,
  invalidateAlbumPhotoPages,
  DEFAULT_PAGE_SIZE,
} from '@/hooks/usePhotosPaginated';
import { getAlbumPhotoFilenames, deletePhotoComment } from '@/actions/photos';
import { updateAlbum, recomputeAlbumCounters } from '@/actions/albums';
import type {
  PhotoWithUrls,
  PhotoFilter,
  PhotoSort,
  PhotoSortDir,
} from '@/types/photo';
import { v4 as uuidv4 } from 'uuid';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Stack,
  Paper,
  Grid,
  TextField,
  CircularProgress,
  Skeleton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  Tabs,
  Tab,
  InputAdornment,
  Menu,
  MenuItem,
  LinearProgress,
  Divider,
  Alert,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  CloudUpload as UploadIcon,
  Share as ShareIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  PhotoLibrary as PhotoLibraryIcon,
  InsertPhoto as InsertPhotoIcon,
  ContentCopy as CopyIcon,
  Sort as SortIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  FolderOpen as FolderOpenIcon,
  ThumbUp as ThumbUpIcon,
  ChatBubbleOutline as ChatBubbleOutlineIcon,
  Cached as CachedIcon,
} from '@mui/icons-material';
import Pagination from '@mui/material/Pagination';

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
  created_at: string;
  updated_at: string;
  cover_photo_id: string | null;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
}

// Photo type comes from `@/types/photo` as `PhotoWithUrls` — includes
// server-resolved `url` / `thumbnailUrl` so the UI doesn't need to build
// Drive / Supabase Storage URLs itself.
type Photo = PhotoWithUrls;

interface UploadFileItem {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
}

interface DeletedInteractionRow {
  id: string;
}

function normalizeFilename(filename: string): string {
  return filename.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
}

// Dark theme accents — warm gold đồng bộ với dashboard tokens (Kitchor tone).
const ACCENT_BLUE = '#C9A96E';
const ACCENT_GLOW_LOCAL = 'rgba(201,169,110,0.18)';

// Toolbar button style — brighter contrast trên dark bg, không bị chìm.
const TOOLBAR_BTN_SX = {
  textTransform: 'none' as const,
  borderColor: 'rgba(255,255,255,0.12)',
  color: '#E2E8F0',  // brighter than text.secondary
  bgcolor: 'rgba(255,255,255,0.03)',
  borderRadius: 1,
  minWidth: 0,
  px: { xs: 1, md: 1.25 },
  fontSize: '0.78rem',
  fontWeight: 500,
  transition: 'all 0.18s ease',
  '&:hover': {
    borderColor: ACCENT_BLUE,
    bgcolor: ACCENT_GLOW_LOCAL,
    color: ACCENT_BLUE,
  },
};

export default function AlbumDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const albumId = params.albumId as string;
  const supabase = createClient();
  const { user } = useAuthStore();
  const { showSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadDialogFileInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dialogDragOver, setDialogDragOver] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; photo: Photo | null }>({
    open: false,
    photo: null,
  });

  // Tabs & filters
  const [photoTypeTab, setPhotoTypeTab] = useState(0); // 0 = Ảnh Gốc, 1 = Ảnh Chỉnh Sửa
  const [subTab, setSubTab] = useState(0); // 0 = Tat ca, 1 = Da thich, 2 = Da chon, 3 = Binh luan
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Pagination state — reset to 1 whenever tab/filter/search/sort changes.
  const [currentPage, setCurrentPage] = useState(1);
  const gridTopRef = useRef<HTMLDivElement | null>(null);

  // Sort menu
  const [sortAnchorEl, setSortAnchorEl] = useState<null | HTMLElement>(null);
  const [sortBy, setSortBy] = useState<'sort_order' | 'filename' | 'created_at'>('sort_order');

  // Map UI state to server-side pagination params (memo avoids refetch churn).
  const photoType: 'original' | 'edited' = photoTypeTab === 0 ? 'original' : 'edited';
  const filter: PhotoFilter =
    subTab === 1 ? 'liked' : subTab === 2 ? 'selected' : subTab === 3 ? 'commented' : 'all';
  const sort: PhotoSort = sortBy;
  const sortDir: PhotoSortDir = sortBy === 'created_at' ? 'desc' : 'asc';

  // Download menu
  const [downloadAnchorEl, setDownloadAnchorEl] = useState<null | HTMLElement>(null);

  // Edited photos dialog state
  const [editedDialogOpen, setEditedDialogOpen] = useState(false);
  const [editedDriveUrl, setEditedDriveUrl] = useState('');
  const [editedGroupName, setEditedGroupName] = useState('Mặc định');
  const [editedScanning, setEditedScanning] = useState(false);
  const [editedFiles, setEditedFiles] = useState<any[]>([]);
  const [editedUploading, setEditedUploading] = useState(false);
  const [editedProgress, setEditedProgress] = useState(0);
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Auto-open edited dialog from URL param
  useEffect(() => {
    if (searchParams.get('addEdited') === 'true') {
      setEditedDialogOpen(true);
    }
  }, [searchParams]);

  // Fetch album
  const { data: album, isLoading: albumLoading } = useQuery({
    queryKey: ['album', albumId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('albums')
        .select('*')
        .eq('id', albumId)
        .single();
      if (error) throw error;
      return data as Album;
    },
    enabled: !!albumId,
  });

  // Fetch accurate counts via RPC
  const { data: albumCounts } = useQuery({
    queryKey: ['album-counts', albumId],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_album_counts', { p_album_id: albumId });
      return data;
    },
    enabled: !!albumId,
    refetchInterval: 10000,
  });

  // Fetch photo groups with photo counts
  const { data: groups = [] } = useQuery({
    queryKey: ['photo-groups', albumId],
    queryFn: async () => {
      const { data } = await supabase.from('photo_groups').select('*').eq('album_id', albumId).order('sort_order');
      if (!data || data.length === 0) return [];

      // Fetch per-group photo counts
      const groupIds = data.map((g: any) => g.id);
      const { data: countRows } = await supabase
        .from('photos')
        .select('group_id')
        .eq('album_id', albumId)
        .in('group_id', groupIds);

      const countMap = new Map<string, number>();
      for (const row of (countRows || [])) {
        if (row.group_id) {
          countMap.set(row.group_id, (countMap.get(row.group_id) || 0) + 1);
        }
      }

      return data.map((g: any) => ({ ...g, photoCount: countMap.get(g.id) || 0 }));
    },
    enabled: !!albumId,
  });

  // Reset to page 1 whenever the query shape changes so we never land on
  // an empty page (e.g. filter 'liked' with only 3 results but page=5).
  useEffect(() => {
    setCurrentPage(1);
  }, [photoType, filter, sortBy, searchQuery, selectedGroupId]);

  // Paginated fetch — server returns this page only + total count, and
  // photo rows already carry denormalized like_count / selection_count /
  // comment_count so no secondary queries are needed for badges.
  const {
    data: pageResult,
    isLoading: photosLoading,
    isFetching: photosFetching,
  } = usePhotosPaginated(albumId, {
    photoType,
    filter,
    search: searchQuery.trim() || undefined,
    sort,
    sortDir,
    page: currentPage,
    pageSize: DEFAULT_PAGE_SIZE,
    groupId: selectedGroupId,
  });

  const photos: Photo[] = pageResult?.data ?? [];
  const totalPages = pageResult?.totalPages ?? 1;
  const totalCount = pageResult?.totalCount ?? 0;

  // Prefetch the next page in the background so the next click feels instant.
  const prefetchPage = usePhotoPagePrefetcher('admin', albumId);

  // Comments panel — join with photo so each row has its own thumbnail URL.
  // Drive-hosted comments only need drive_file_id; Storage-hosted fall
  // back to the photo row included via the relation.
  const { data: allComments = [] } = useQuery({
    queryKey: ['album-all-comments', albumId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('photo_comments')
        .select(
          `id, photo_id, author_name, content, author_type, created_at,
           photos(id, original_filename, drive_file_id, drive_thumbnail_link)`
        )
        .eq('album_id', albumId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!albumId,
    refetchInterval: 10000,
  });

  // Realtime subscription — invalidate the pagination query for this
  // album so badge counts + tab filters reflect visitor activity without
  // requiring the studio to reload or scroll.
  useEffect(() => {
    if (!albumId) return;
    const invalidatePages = () => invalidateAlbumPhotoPages(queryClient, 'admin', albumId);
    const channel = supabase
      .channel('album-changes-' + albumId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_likes', filter: `album_id=eq.${albumId}` }, () => {
        invalidatePages();
        queryClient.invalidateQueries({ queryKey: ['album-counts', albumId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_selections', filter: `album_id=eq.${albumId}` }, () => {
        invalidatePages();
        queryClient.invalidateQueries({ queryKey: ['album-counts', albumId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_comments', filter: `album_id=eq.${albumId}` }, () => {
        invalidatePages();
        queryClient.invalidateQueries({ queryKey: ['album-all-comments', albumId] });
        queryClient.invalidateQueries({ queryKey: ['album-counts', albumId] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [albumId, supabase, queryClient]);

  // Photo type counts from RPC (always up-to-date via refetchInterval).
  const originalCount = albumCounts?.original_count || 0;
  const editedCount = albumCounts?.edited_count || 0;

  // Counts for sub-tabs from RPC — badge totals independent of the
  // currently loaded page, so the user always sees the true count.
  const totalCountForType = photoTypeTab === 0 ? originalCount : editedCount;
  const likedCount = albumCounts?.liked_photos || 0;
  const selectedCount = albumCounts?.selected_photos || 0;
  const commentCount = albumCounts?.commented_photos || 0;

  // Change page handler — smooth-scrolls grid top so the user doesn't
  // have to manually scroll after clicking a pagination button.
  const handlePageChange = useCallback((_: unknown, next: number) => {
    setCurrentPage(next);
    gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Background-prefetch next page so clicking "next" feels instant.
  useEffect(() => {
    if (!albumId || currentPage >= totalPages) return;
    prefetchPage({
      photoType,
      filter,
      search: searchQuery.trim() || undefined,
      sort,
      sortDir,
      page: currentPage + 1,
      pageSize: DEFAULT_PAGE_SIZE,
      groupId: selectedGroupId,
    });
  }, [albumId, currentPage, totalPages, photoType, filter, sort, sortDir, searchQuery, selectedGroupId, prefetchPage]);

  const clearPhotoLikesMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const { data, error } = await supabase
        .from('photo_likes')
        .delete()
        .eq('album_id', albumId)
        .eq('photo_id', photoId)
        .select('id');
      if (error) throw error;
      return (data || []) as DeletedInteractionRow[];
    },
    onSuccess: (deletedRows) => {
      queryClient.invalidateQueries({ queryKey: ['album', albumId] });
      invalidateAlbumPhotoPages(queryClient, 'admin', albumId);
      queryClient.invalidateQueries({ queryKey: ['album-counts', albumId] });
      const removed = deletedRows.length;
      showSnackbar(
        removed > 0 ? `Da bo ${removed} luot thich cua khach` : 'Anh nay khong co luot thich de bo',
        removed > 0 ? 'success' : 'info'
      );
    },
    onError: () => {
      showSnackbar('Khong the bo luot thich cua khach', 'error');
    },
  });

  const clearPhotoSelectionsMutation = useMutation({
    mutationFn: async (photoId: string) => {
      const { data, error } = await supabase
        .from('photo_selections')
        .delete()
        .eq('album_id', albumId)
        .eq('photo_id', photoId)
        .select('id');
      if (error) throw error;

      const { count: remainingSelections, error: countError } = await supabase
        .from('photo_selections')
        .select('id', { count: 'exact', head: true })
        .eq('album_id', albumId);
      if (countError) throw countError;

      const { error: syncAlbumError } = await supabase
        .from('albums')
        .update({ total_selections: remainingSelections || 0 })
        .eq('id', albumId);
      if (syncAlbumError) throw syncAlbumError;

      const { error: syncPhotoError } = await supabase
        .from('photos')
        .update({ selection_count: 0 })
        .eq('id', photoId);
      if (syncPhotoError) throw syncPhotoError;

      return (data || []) as DeletedInteractionRow[];
    },
    onSuccess: (deletedRows) => {
      queryClient.invalidateQueries({ queryKey: ['album', albumId] });
      invalidateAlbumPhotoPages(queryClient, 'admin', albumId);
      queryClient.invalidateQueries({ queryKey: ['album-counts', albumId] });
      const removed = deletedRows.length;
      showSnackbar(
        removed > 0 ? `Da bo ${removed} luot chon cua khach` : 'Anh nay khong co luot chon de bo',
        removed > 0 ? 'success' : 'info'
      );
    },
    onError: () => {
      showSnackbar('Khong the bo luot chon cua khach', 'error');
    },
  });

  // Update title mutation
  const updateTitleMutation = useMutation({
    mutationFn: async (newTitle: string) => {
      const { error } = await supabase
        .from('albums')
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq('id', albumId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['album', albumId] });
      showSnackbar('Da cap nhat tieu de', 'success');
    },
    onError: () => {
      showSnackbar('Không thể cap nhat tieu de', 'error');
    },
  });

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: async (photo: Photo) => {
      // Remove from Supabase Storage only if old photo with storage_path
      if (photo.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('album-photos')
          .remove([photo.storage_path]);
        if (storageError) throw storageError;
      }

      const { error: dbError } = await supabase.from('photos').delete().eq('id', photo.id);
      if (dbError) throw dbError;

      await supabase
        .from('albums')
        .update({
          photo_count: Math.max(0, (album?.photo_count || 1) - 1),
          updated_at: new Date().toISOString(),
        })
        .eq('id', albumId);
    },
    onSuccess: () => {
      invalidateAlbumPhotoPages(queryClient, 'admin', albumId);
      queryClient.invalidateQueries({ queryKey: ['album', albumId] });
      queryClient.invalidateQueries({ queryKey: ['album-counts', albumId] });
      showSnackbar('Da xoa anh thành công', 'success');
      setDeleteDialog({ open: false, photo: null });
    },
    onError: () => {
      showSnackbar('Không thể xoa anh', 'error');
    },
  });

  // Image dimensions helper
  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = URL.createObjectURL(file);
    });
  };

  // Upload handler
  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!user?.id || !albumId) return;

      setUploading(true);
      setUploadProgress(0);
      const fileArray = Array.from(files);
      let uploaded = 0;

      // Update upload file items status
      setUploadFiles((prev) =>
        prev.map((f) => ({ ...f, status: 'uploading' as const }))
      );

      try {
        for (const file of fileArray) {
          const photoId = uuidv4();
          const normalized = normalizeFilename(file.name);

          let width = 0;
          let height = 0;
          if (file.type.startsWith('image/')) {
            const dims = await getImageDimensions(file);
            width = dims.width;
            height = dims.height;
          }

          // Upload to Google Drive
          const fd = new FormData();
          fd.append('file', file);
          if (album?.drive_folder_id) {
            fd.append('folderId', album.drive_folder_id);
          }
          fd.append('albumTitle', album?.title || 'Album');

          const driveRes = await fetch('/api/drive/upload', { method: 'POST', body: fd });
          if (!driveRes.ok) throw new Error('Drive upload failed');
          const driveData = await driveRes.json();

          const { error: insertError } = await supabase.from('photos').insert({
            id: photoId,
            album_id: albumId,
            studio_id: user.id,
            original_filename: file.name,
            normalized_filename: normalized,
            storage_path: null,
            thumbnail_path: null,
            width,
            height,
            file_size: file.size,
            mime_type: file.type,
            sort_order: (album?.photo_count || 0) + uploaded,
            selection_count: 0,
            comment_count: 0,
            drive_file_id: driveData.driveFileId,
            drive_thumbnail_link: driveData.driveThumbnail || null,
            drive_web_link: driveData.driveContentLink || null,
          });

          if (insertError) throw insertError;

          // Update album drive_folder_id if not yet set
          if (!album?.drive_folder_id && driveData.folderId) {
            await supabase
              .from('albums')
              .update({ drive_folder_id: driveData.folderId })
              .eq('id', albumId);
          }

          uploaded++;
          setUploadProgress(Math.round((uploaded / fileArray.length) * 100));

          // Update individual file progress
          setUploadFiles((prev) =>
            prev.map((f) =>
              f.file === file ? { ...f, progress: 100, status: 'done' as const } : f
            )
          );
        }

        await supabase
          .from('albums')
          .update({
            photo_count: (album?.photo_count || 0) + uploaded,
            updated_at: new Date().toISOString(),
          })
          .eq('id', albumId);

        invalidateAlbumPhotoPages(queryClient, 'admin', albumId);
        queryClient.invalidateQueries({ queryKey: ['album', albumId] });
        queryClient.invalidateQueries({ queryKey: ['album-counts', albumId] });
        showSnackbar(`Đã tải lên ${uploaded} anh thành công!`, 'success');
        setUploadDialogOpen(false);
        setUploadFiles([]);
      } catch (err) {
        showSnackbar('Lỗi khi tai anh len. Vui long thu lai.', 'error');
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [user, albumId, album, supabase, queryClient, showSnackbar]
  );

  // Dialog drag & drop handlers
  const handleDialogDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDialogDragOver(true);
  };

  const handleDialogDragLeave = () => {
    setDialogDragOver(false);
  };

  const handleDialogDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDialogDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      const newFiles: UploadFileItem[] = Array.from(e.dataTransfer.files).map((file) => ({
        file,
        id: uuidv4(),
        progress: 0,
        status: 'pending' as const,
      }));
      setUploadFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleDialogFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles: UploadFileItem[] = Array.from(e.target.files).map((file) => ({
        file,
        id: uuidv4(),
        progress: 0,
        status: 'pending' as const,
      }));
      setUploadFiles((prev) => [...prev, ...newFiles]);
      e.target.value = '';
    }
  };

  const handleUploadDialogSubmit = () => {
    if (uploadFiles.length === 0) return;
    const files = uploadFiles.map((f) => f.file);
    handleUpload(files);
  };

  const removeUploadFile = (id: string) => {
    setUploadFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Dialog state cho "Copy mã chọn / Copy mã thích" theo mục
  const [copyDialog, setCopyDialog] = useState<{ open: boolean; kind: 'liked' | 'selected' | null }>({
    open: false, kind: null,
  });

  // Dialog "Sửa thông tin album" — title + description
  const [editAlbumDialog, setEditAlbumDialog] = useState<{
    open: boolean; title: string; description: string; saving: boolean;
  }>({ open: false, title: '', description: '', saving: false });

  // Mở dialog với data hiện tại
  const openEditAlbum = () => {
    if (!album) return;
    setEditAlbumDialog({
      open: true,
      title: album.title || '',
      description: album.description || '',
      saving: false,
    });
  };

  // Lightbox state — click ảnh trong dashboard để xem bự
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Dialog confirm xoá bình luận
  const [deleteCommentDialog, setDeleteCommentDialog] = useState<{
    open: boolean; commentId: string | null; preview: string;
  }>({ open: false, commentId: null, preview: '' });

  const handleConfirmDeleteComment = async () => {
    if (!deleteCommentDialog.commentId) return;
    const result = await deletePhotoComment(deleteCommentDialog.commentId);
    setDeleteCommentDialog({ open: false, commentId: null, preview: '' });
    if (result.error) {
      showSnackbar(result.error, 'error');
      return;
    }
    showSnackbar('Đã xoá bình luận', 'success');
    queryClient.invalidateQueries({ queryKey: ['album-all-comments', albumId] });
    queryClient.invalidateQueries({ queryKey: ['album-counts', albumId] });
    invalidateAlbumPhotoPages(queryClient, 'admin', albumId);
  };

  // Self-heal: gọi RPC recompute_album_counters để fix counter drift
  // (badge count != tab count). User trigger từ menu "Đồng bộ count".
  const [resyncing, setResyncing] = useState(false);
  const handleResyncCounters = async () => {
    setResyncing(true);
    const result = await recomputeAlbumCounters(albumId);
    setResyncing(false);
    if (result.error) {
      showSnackbar(result.error, 'error');
      return;
    }
    const orphans = (result.data?.orphan_selections_deleted ?? 0)
      + (result.data?.orphan_likes_deleted ?? 0);
    showSnackbar(
      orphans > 0
        ? `Đã đồng bộ counter & xoá ${orphans} dữ liệu rác`
        : 'Đã đồng bộ counter',
      'success'
    );
    queryClient.invalidateQueries({ queryKey: ['album-counts', albumId] });
    invalidateAlbumPhotoPages(queryClient, 'admin', albumId);
  };

  // Save: update title + description rồi invalidate query
  const handleSaveAlbumInfo = async () => {
    const title = editAlbumDialog.title.trim();
    if (!title) {
      showSnackbar('Tên album không được để trống', 'warning');
      return;
    }
    setEditAlbumDialog((s) => ({ ...s, saving: true }));
    const result = await updateAlbum(albumId, {
      title,
      description: editAlbumDialog.description.trim() || null,
    });
    if (result.error) {
      showSnackbar(result.error, 'error');
      setEditAlbumDialog((s) => ({ ...s, saving: false }));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['album', albumId] });
    showSnackbar('Đã cập nhật thông tin album', 'success');
    setEditAlbumDialog({ open: false, title: '', description: '', saving: false });
  };

  // Fetcher cho dialog — gọi server action, trả filename + groupId
  const fetchCopyItems = useCallback(async () => {
    const kind = copyDialog.kind ?? 'liked';
    const result = await getAlbumPhotoFilenames(albumId, kind);
    if (result.error) {
      showSnackbar(result.error, 'error');
      return [];
    }
    return result.data;
  }, [albumId, copyDialog.kind, showSnackbar]);

  // Handle adding edited photos from Drive
  // Quét lại Drive folder của album → tự thêm ảnh mới (drive_file_id chưa
  // có trong DB) vào album. Ảnh đã có giữ nguyên. KHÔNG xoá ảnh nào.
  const [rescanning, setRescanning] = useState(false);
  const handleRescanDrive = async () => {
    if (!album?.drive_folder_id) {
      showSnackbar('Album chưa liên kết Drive folder', 'warning');
      return;
    }
    setRescanning(true);
    try {
      // 1. List ảnh trong Drive folder
      const res = await fetch('/api/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: album.drive_folder_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi quét Drive');
      // folderId + folderName = Drive parent của ảnh. ID stable, name có thể đổi.
      const driveFiles = (data.files || []) as Array<{
        id: string; name: string; mimeType: string;
        size?: string; thumbnailLink?: string;
        folderName?: string | null; folderId?: string | null;
      }>;

      if (driveFiles.length === 0) {
        showSnackbar('Drive folder rỗng hoặc không truy cập được', 'warning');
        return;
      }

      // 2. Sync photo_groups với Drive folders (match qua drive_folder_id, ID stable)
      // Build map folderId → folderName từ Drive scan.
      const driveFolderMap = new Map<string, string>();
      for (const f of driveFiles) {
        if (f.folderId && f.folderName) driveFolderMap.set(f.folderId, f.folderName);
      }

      // Lấy existing photo_groups (có drive_folder_id để match)
      const { data: dbGroups } = await supabase
        .from('photo_groups')
        .select('id, name, drive_folder_id')
        .eq('album_id', albumId);

      const groupByDriveId = new Map<string, { id: string; name: string }>();
      const groupByName = new Map<string, string>(); // fallback cho group cũ chưa có drive_folder_id
      for (const g of (dbGroups ?? [])) {
        if (g.drive_folder_id) groupByDriveId.set(g.drive_folder_id, { id: g.id, name: g.name });
        if (g.name) groupByName.set(g.name, g.id);
      }

      // Map driveFolderId → group_id (final). Tạo / update / link group cho từng folder Drive.
      const folderIdToGroupId = new Map<string, string>();
      let groupsCreated = 0;
      let groupsRenamed = 0;
      let groupsLinked = 0;

      for (const [driveFolderId, folderName] of driveFolderMap.entries()) {
        const existingByDriveId = groupByDriveId.get(driveFolderId);
        if (existingByDriveId) {
          // Đã link bằng drive_folder_id. Check rename.
          if (existingByDriveId.name !== folderName) {
            const { error } = await supabase.from('photo_groups')
              .update({ name: folderName })
              .eq('id', existingByDriveId.id);
            if (!error) groupsRenamed++;
          }
          folderIdToGroupId.set(driveFolderId, existingByDriveId.id);
          continue;
        }

        // Chưa link bằng ID. Thử match theo name (group cũ chưa có drive_folder_id)
        const existingByName = groupByName.get(folderName);
        if (existingByName) {
          // Link group cũ với drive_folder_id
          const { error } = await supabase.from('photo_groups')
            .update({ drive_folder_id: driveFolderId })
            .eq('id', existingByName);
          if (!error) groupsLinked++;
          folderIdToGroupId.set(driveFolderId, existingByName);
          continue;
        }

        // Tạo group mới
        const { data: newGroup, error } = await supabase.from('photo_groups')
          .insert({ album_id: albumId, name: folderName, drive_folder_id: driveFolderId })
          .select('id').single();
        if (error) throw error;
        if (newGroup?.id) {
          folderIdToGroupId.set(driveFolderId, newGroup.id);
          groupsCreated++;
        }
      }

      // 3. Lấy existing photos (drive_file_id + group_id hiện tại)
      const { data: existingPhotos } = await supabase
        .from('photos')
        .select('id, drive_file_id, group_id')
        .eq('album_id', albumId)
        .not('drive_file_id', 'is', null);
      const existingMap = new Map<string, { id: string; group_id: string | null }>();
      for (const p of (existingPhotos ?? [])) {
        if (p.drive_file_id) existingMap.set(p.drive_file_id as string, { id: p.id, group_id: p.group_id });
      }

      // 4. Tính sort_order base
      const { data: maxRow } = await supabase
        .from('photos')
        .select('sort_order')
        .eq('album_id', albumId)
        .order('sort_order', { ascending: false })
        .limit(1).maybeSingle();
      let nextOrder = (maxRow?.sort_order || 0) + 1;

      // 5. Loop qua tất cả ảnh Drive — UPDATE group_id nếu khác, INSERT nếu mới
      const newPhotoRows: any[] = [];
      let photosReassigned = 0;

      for (const file of driveFiles) {
        const targetGroupId = file.folderId ? (folderIdToGroupId.get(file.folderId) || null) : null;
        const existing = existingMap.get(file.id);
        if (existing) {
          // Update group_id nếu khác (folder Drive thay đổi)
          if (existing.group_id !== targetGroupId) {
            await supabase.from('photos').update({ group_id: targetGroupId }).eq('id', existing.id);
            photosReassigned++;
          }
        } else {
          // Photo mới — gom batch insert
          newPhotoRows.push({
            album_id: albumId,
            studio_id: user?.id,
            original_filename: file.name,
            normalized_filename: file.name.toLowerCase().trim(),
            drive_file_id: file.id,
            drive_thumbnail_link: file.thumbnailLink || null,
            file_size: parseInt(file.size || '0') || 0,
            mime_type: file.mimeType,
            photo_type: 'original',
            sort_order: nextOrder++,
            group_id: targetGroupId,
          });
        }
      }

      // 6. Batch INSERT photos mới
      if (newPhotoRows.length > 0) {
        const { error: insertErr } = await supabase.from('photos').insert(newPhotoRows);
        if (insertErr) throw insertErr;
      }

      // Refresh queries
      invalidateAlbumPhotoPages(queryClient, 'admin', albumId);
      queryClient.invalidateQueries({ queryKey: ['album-counts', albumId] });
      queryClient.invalidateQueries({ queryKey: ['photo-groups', albumId] });

      // Build summary message
      const parts: string[] = [];
      if (newPhotoRows.length > 0) parts.push(`${newPhotoRows.length} ảnh mới`);
      if (photosReassigned > 0) parts.push(`${photosReassigned} ảnh đổi mục`);
      if (groupsCreated > 0) parts.push(`${groupsCreated} mục mới`);
      if (groupsRenamed > 0) parts.push(`${groupsRenamed} mục đổi tên`);
      if (groupsLinked > 0) parts.push(`${groupsLinked} mục cũ liên kết Drive`);
      showSnackbar(
        parts.length > 0
          ? `✓ Đồng bộ Drive: ${parts.join(', ')} (tổng ${driveFiles.length} ảnh)`
          : `Drive đã đồng bộ — không có thay đổi (${driveFiles.length} ảnh)`,
        'success'
      );
    } catch (err: any) {
      showSnackbar(err.message || 'Lỗi quét Drive', 'error');
    } finally {
      setRescanning(false);
    }
  };

  const handleAddEditedPhotos = async () => {
    if (!editedDriveUrl.trim()) return;

    // Extract folder ID
    const match = editedDriveUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!match) { showSnackbar('Link không hợp lệ', 'error'); return; }
    const folderId = match[1];

    setEditedScanning(true);
    const res = await fetch('/api/drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    const data = await res.json();
    setEditedScanning(false);

    if (!res.ok || !data.files?.length) {
      showSnackbar('Không tìm thấy ảnh trong thư mục', 'warning');
      return;
    }

    setEditedFiles(data.files);
    setEditedUploading(true);
    setEditedProgress(0);

    // Find or create group
    let groupId = null;
    const existingGroup = groups.find((g: any) => g.name === editedGroupName);
    if (existingGroup) {
      groupId = existingGroup.id;
    } else {
      const { data: newGroup } = await supabase.from('photo_groups').insert({ album_id: albumId, name: editedGroupName }).select('id').single();
      groupId = newGroup?.id;
    }

    let count = 0;
    for (const file of data.files) {
      await supabase.from('photos').insert({
        album_id: albumId,
        studio_id: user?.id,
        original_filename: file.name,
        normalized_filename: file.name.toLowerCase().trim(),
        drive_file_id: file.id,
        drive_thumbnail_link: file.thumbnailLink || null,
        file_size: parseInt(file.size || '0') || 0,
        mime_type: file.mimeType,
        photo_type: 'edited',
        group_id: groupId,
      });
      count++;
      setEditedProgress(Math.round((count / data.files.length) * 100));
    }

    invalidateAlbumPhotoPages(queryClient, 'admin', albumId);
    queryClient.invalidateQueries({ queryKey: ['photo-groups', albumId] });
    queryClient.invalidateQueries({ queryKey: ['album-counts', albumId] });
    showSnackbar(`Đã thêm ${count} ảnh chỉnh sửa`, 'success');
    setEditedDialogOpen(false);
    setEditedFiles([]);
    setEditedDriveUrl('');
    setEditedUploading(false);
  };

  // Loading state
  if (albumLoading) {
    return (
      <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', p: 3 }}>
        <Skeleton variant="text" width={300} height={48} />
        <Skeleton variant="text" width={150} height={24} sx={{ mt: 1 }} />
        <Skeleton variant="rectangular" height={48} sx={{ mt: 2, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={400} sx={{ mt: 2, borderRadius: 2 }} />
      </Box>
    );
  }

  if (!album) {
    return (
      <Box sx={{ p: 3, textAlign: 'center', bgcolor: 'background.default', minHeight: '100vh' }}>
        <Typography variant="h6" color="text.secondary">
          Khong tim thay album
        </Typography>
        <Button sx={{ mt: 2 }} onClick={() => router.push('/dashboard/albums')}>
          Quay lại danh sach
        </Button>
      </Box>
    );
  }


  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* ========== TOP HEADER ========== */}
      <Box sx={{ bgcolor: 'background.paper', borderBottom: '1px solid #E0E0E0', px: { xs: 2, md: 4 }, pt: 3, pb: 2 }}>
        {/* Album Title Row */}
        <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
          <IconButton onClick={() => router.push('/dashboard/albums')} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" fontWeight={800} sx={{ color: 'primary.main' }}>
            {album.title}
          </Typography>
          <Tooltip title="Sửa tên album">
            <IconButton onClick={openEditAlbum} size="small" sx={{ color: 'text.secondary' }}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Đồng bộ lại số đếm (chạy nếu badge và tab không khớp)">
            <span>
              <IconButton
                onClick={handleResyncCounters}
                size="small"
                disabled={resyncing}
                sx={{ color: 'text.secondary' }}
              >
                <CachedIcon
                  fontSize="small"
                  sx={resyncing ? { animation: 'spin 1s linear infinite', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } } : undefined}
                />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>


        {/* Toolbar Row — Compact: 1 nút chính (Thêm Ảnh) + icons với tooltip,
            text hiện chỉ trên md+ để mobile gọn gàng. */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          sx={{ flexWrap: 'wrap', gap: 0.75 }}
        >
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setUploadDialogOpen(true)}
            sx={{
              color: '#1A1A2E',
              background: `linear-gradient(135deg, ${ACCENT_BLUE} 0%, #B8964F 100%)`,
              '&:hover': { background: `linear-gradient(135deg, #DCC189 0%, ${ACCENT_BLUE} 100%)` },
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.82rem',
              borderRadius: 1,
              py: 0.5,
              px: 1.5,
              boxShadow: `0 4px 12px ${ACCENT_GLOW_LOCAL}`,
            }}
          >
            Thêm Ảnh
          </Button>

          {/* Toolbar buttons — compact với tooltip, text ẩn mobile */}
          {[
            { label: 'Copy mã chọn', icon: <CopyIcon fontSize="small" />, onClick: () => setCopyDialog({ open: true, kind: 'selected' }) },
            { label: 'Copy mã thích', icon: <CopyIcon fontSize="small" />, onClick: () => setCopyDialog({ open: true, kind: 'liked' }) },
          ].map((btn, i) => (
            <Tooltip key={i} title={btn.label}>
              <Button
                variant="outlined"
                size="small"
                onClick={btn.onClick}
                sx={TOOLBAR_BTN_SX}
              >
                {btn.icon}
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, ml: 0.5 }}>
                  {btn.label}
                </Box>
              </Button>
            </Tooltip>
          ))}

          <Tooltip title="Sắp xếp">
            <Button
              variant="outlined"
              size="small"
              onClick={(e) => setSortAnchorEl(e.currentTarget)}
              sx={TOOLBAR_BTN_SX}
            >
              <SortIcon fontSize="small" />
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, ml: 0.5 }}>
                Sắp xếp
              </Box>
            </Button>
          </Tooltip>
          <Menu
            anchorEl={sortAnchorEl}
            open={Boolean(sortAnchorEl)}
            onClose={() => setSortAnchorEl(null)}
          >
            <MenuItem
              selected={sortBy === 'sort_order'}
              onClick={() => { setSortBy('sort_order'); setSortAnchorEl(null); }}
            >
              Thu tu mac dinh
            </MenuItem>
            <MenuItem
              selected={sortBy === 'filename'}
              onClick={() => { setSortBy('filename'); setSortAnchorEl(null); }}
            >
              Ten file (A-Z)
            </MenuItem>
            <MenuItem
              selected={sortBy === 'created_at'}
              onClick={() => { setSortBy('created_at'); setSortAnchorEl(null); }}
            >
              Ngay tải lên
            </MenuItem>
          </Menu>

          <Tooltip title="Tải về">
            <Button
              variant="outlined" size="small"
              onClick={(e) => setDownloadAnchorEl(e.currentTarget)}
              sx={TOOLBAR_BTN_SX}
            >
              <DownloadIcon fontSize="small" />
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, ml: 0.5 }}>Tải về</Box>
            </Button>
          </Tooltip>
          <Menu
            anchorEl={downloadAnchorEl}
            open={Boolean(downloadAnchorEl)}
            onClose={() => setDownloadAnchorEl(null)}
          >
            <MenuItem onClick={() => setDownloadAnchorEl(null)}>Tải tất cả ảnh gốc</MenuItem>
            <MenuItem onClick={() => setDownloadAnchorEl(null)}>Tải ảnh đã chọn</MenuItem>
          </Menu>

          {album.drive_folder_url && (
            <Tooltip title="Mở Drive folder">
              <Button
                variant="outlined" size="small"
                onClick={() => window.open(album.drive_folder_url!, '_blank')}
                sx={TOOLBAR_BTN_SX}
              >
                <FolderOpenIcon fontSize="small" />
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, ml: 0.5 }}>Mở Drive</Box>
              </Button>
            </Tooltip>
          )}

          {album.drive_folder_id && (
            <Tooltip title={rescanning ? 'Đang quét Drive...' : 'Quét lại Drive — sync mục/ảnh từ Drive'}>
              <span>
                <Button
                  variant="outlined" size="small"
                  onClick={handleRescanDrive}
                  disabled={rescanning}
                  sx={{
                    textTransform: 'none', borderColor: 'divider', color: 'text.secondary',
                    borderRadius: 1, minWidth: 0, px: { xs: 1, md: 1.25 },
                    fontSize: '0.78rem', fontWeight: 500,
                  }}
                >
                  <CachedIcon fontSize="small" sx={rescanning ? { animation: 'spin 1s linear infinite', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } } : undefined} />
                  <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, ml: 0.5 }}>
                    {rescanning ? 'Đang quét...' : 'Quét Drive'}
                  </Box>
                </Button>
              </span>
            </Tooltip>
          )}

          <Tooltip title="Chia sẻ album">
            <Button
              variant="outlined" size="small"
              onClick={() => setShareOpen(true)}
              sx={TOOLBAR_BTN_SX}
            >
              <ShareIcon fontSize="small" />
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, ml: 0.5 }}>Chia sẻ</Box>
            </Button>
          </Tooltip>
        </Stack>
      </Box>

      {/* ========== PHOTO TYPE TABS ========== */}
      <Box sx={{ bgcolor: 'background.paper', px: { xs: 2, md: 4 }, pt: 2, pb: 0, borderBottom: '1px solid #E0E0E0' }}>
        {/* Row 1: 2 main type tabs — Ảnh Gốc / Ảnh Chỉnh Sửa.
            Style: black bg + gold accent khi active, sang trọng pro. */}
        <Stack direction="row" spacing={1.25} mb={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {[
            { label: 'Ảnh Gốc', count: originalCount, idx: 0 },
            { label: 'Ảnh Chỉnh Sửa', count: editedCount, idx: 1 },
          ].map((tab) => {
            const active = photoTypeTab === tab.idx;
            return (
              <Box
                key={tab.idx}
                onClick={() => { setPhotoTypeTab(tab.idx); setSelectedGroupId(null); }}
                sx={{
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'baseline', gap: 0.75,
                  px: 2.25, py: 1,
                  borderRadius: 1,
                  bgcolor: active ? ACCENT_GLOW_LOCAL : 'rgba(255,255,255,0.03)',
                  color: active ? ACCENT_BLUE : '#CBD5E1',
                  border: '1.5px solid',
                  borderColor: active ? ACCENT_BLUE : 'rgba(255,255,255,0.10)',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  letterSpacing: 0.2,
                  boxShadow: active ? `0 4px 14px ${ACCENT_GLOW_LOCAL}` : 'none',
                  transition: 'all 0.18s',
                  '&:hover': {
                    borderColor: ACCENT_BLUE,
                    bgcolor: ACCENT_GLOW_LOCAL,
                    color: ACCENT_BLUE,
                  },
                }}
              >
                {tab.label}
                <Box component="span" sx={{
                  fontSize: '0.78rem', fontWeight: 500,
                  color: active ? ACCENT_BLUE : '#94A3B8',
                  opacity: active ? 1 : 0.85,
                }}>
                  {tab.count}
                </Box>
              </Box>
            );
          })}
        </Stack>

        {/* Row 2: Group folders — chỉ hiển thị khi đang xem Ảnh Gốc.
            Style folder icon + name + count, hover gold subtle, active black bg + gold border. */}
        {photoTypeTab === 0 && (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mb: 1.75 }}>
            {/* "Tất cả" — clear group filter */}
            <Box
              onClick={() => setSelectedGroupId(null)}
              sx={{
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 0.75,
                px: 1.25, py: 0.6,
                borderRadius: 1,
                bgcolor: !selectedGroupId ? ACCENT_GLOW_LOCAL : 'transparent',
                color: !selectedGroupId ? ACCENT_BLUE : '#94A3B8',
                border: '1px solid',
                borderColor: !selectedGroupId ? ACCENT_BLUE : 'transparent',
                transition: 'all 0.15s',
                '&:hover': {
                  bgcolor: ACCENT_GLOW_LOCAL,
                  color: ACCENT_BLUE,
                },
              }}
            >
              <FolderOpenIcon sx={{ fontSize: 17, color: !selectedGroupId ? ACCENT_BLUE : '#64748B' }} />
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2 }}>
                Tất cả
                <Box component="span" sx={{ opacity: 0.6, fontWeight: 400, ml: 0.5 }}>
                  ({originalCount})
                </Box>
              </Typography>
            </Box>

            {/* Folder cho từng group có ảnh */}
            {groups.filter((g: any) => g.photoCount > 0).map((group: any) => {
              const active = selectedGroupId === group.id;
              return (
                <Box
                  key={group.id}
                  onClick={() => {
                    setPhotoTypeTab(0);
                    setSelectedGroupId(group.id);
                    setSubTab(0);
                  }}
                  sx={{
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 0.75,
                    px: 1.25, py: 0.6,
                    borderRadius: 1,
                    bgcolor: active ? ACCENT_GLOW_LOCAL : 'transparent',
                    color: active ? ACCENT_BLUE : '#94A3B8',
                    border: '1px solid',
                    borderColor: active ? ACCENT_BLUE : 'transparent',
                    transition: 'all 0.15s',
                    '&:hover': {
                      bgcolor: ACCENT_GLOW_LOCAL,
                      color: ACCENT_BLUE,
                    },
                  }}
                >
                  <FolderOpenIcon sx={{ fontSize: 17, color: active ? ACCENT_BLUE : '#64748B' }} />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, lineHeight: 1.2 }}>
                    {group.name}
                    <Box component="span" sx={{ opacity: 0.6, fontWeight: 400, ml: 0.5 }}>
                      ({group.photoCount})
                    </Box>
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        )}

        {/* Sub-tabs Row */}
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Tabs
            value={subTab}
            onChange={(_, v) => setSubTab(v)}
            textColor="inherit"
            sx={{
              minHeight: 40,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                minHeight: 40,
                color: '#888',
                '&.Mui-selected': { color: ACCENT_BLUE },
              },
              '& .MuiTabs-indicator': { bgcolor: ACCENT_BLUE },
            }}
          >
            <Tab label={`TẤT CẢ (${totalCountForType})`} />
            <Tab label={`ĐÃ THÍCH (${likedCount})`} />
            <Tab label={`ĐÃ CHỌN (${selectedCount})`} />
            <Tab label={`BÌNH LUẬN (${commentCount})`} />
          </Tabs>

          <TextField
            placeholder="Tìm tên ảnh..."
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: 'rgba(232,230,227,0.55)' }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              width: 220,
              '& .MuiOutlinedInput-root': {
                borderRadius: '7px',
                bgcolor: 'rgba(255,255,255,0.04)',
                color: '#E8E6E3',
                fontSize: '0.85rem',
                transition: 'border-color 0.2s, background-color 0.2s',
                '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
                '&:hover fieldset': { borderColor: 'rgba(201,169,110,0.4)' },
                '&.Mui-focused fieldset': { borderColor: '#C9A96E', borderWidth: 1 },
                '&.Mui-focused': { bgcolor: 'rgba(201,169,110,0.06)' },
              },
              '& .MuiOutlinedInput-input::placeholder': {
                color: 'rgba(232,230,227,0.4)',
                opacity: 1,
              },
            }}
          />
        </Stack>
      </Box>

      {/* ========== PHOTO GRID ========== */}
      <Box ref={gridTopRef} sx={{ px: { xs: 2, md: 4 }, py: 3 }}>
        {photosLoading ? (
          <Grid container spacing={2}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={i}>
                <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
                <Skeleton variant="text" width="60%" sx={{ mt: 0.5 }} />
              </Grid>
            ))}
          </Grid>
        ) : photos.length === 0 ? (() => {
          // Empty state context-aware: phân biệt album thật sự trống vs
          // tab filter (Đã thích / Đã chọn / Bình luận) không có ảnh.
          const albumTrulyEmpty = originalCount === 0 && editedCount === 0;
          const typeLabel = photoTypeTab === 1 ? 'ảnh chỉnh sửa' : 'ảnh gốc';
          const msg = albumTrulyEmpty
            ? { title: 'Album này chưa có ảnh nào', sub: 'Nhấn "+ Thêm Ảnh" để bắt đầu tải ảnh lên' }
            : filter === 'liked'
              ? { title: `Chưa có ${typeLabel} nào được thích`, sub: 'Khách thả tim ảnh sẽ xuất hiện tại đây' }
            : filter === 'selected'
              ? { title: `Chưa có ${typeLabel} nào được chọn`, sub: 'Ảnh được khách đánh dấu sẽ xuất hiện tại đây' }
            : filter === 'commented'
              ? { title: `Chưa có ${typeLabel} nào có bình luận`, sub: 'Bình luận của khách trên ảnh sẽ xuất hiện tại đây' }
              : { title: `Chưa có ${typeLabel} nào trong mục này`, sub: 'Thử chọn mục khác hoặc xoá filter để xem toàn bộ' };
          return (
            <Paper
              sx={{
                p: 8,
                textAlign: 'center',
                bgcolor: 'background.paper',
                borderRadius: 1,
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}
            >
              <InsertPhotoIcon sx={{ fontSize: 72, color: '#ccc', mb: 2 }} />
              <Typography variant="h6" fontWeight={700} color="text.secondary" sx={{ letterSpacing: 0.5 }}>
                {msg.title}
              </Typography>
              <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
                {msg.sub}
              </Typography>
            </Paper>
          );
        })() : (
          <Grid container spacing={2}>
            {photos.map((photo, idx) => {
              // Tên folder/mục mà ảnh thuộc về — hiển thị badge nhỏ khi hover
              const photoGroupName = photo.group_id
                ? (groups.find((g: any) => g.id === photo.group_id)?.name || null)
                : null;
              return (
              <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={photo.id}>
                <Paper
                  onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}
                  sx={{
                    borderRadius: 1,
                    overflow: 'hidden',
                    bgcolor: 'background.paper',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    transition: 'box-shadow 0.3s cubic-bezier(0.16,1,0.3,1), transform 0.3s cubic-bezier(0.16,1,0.3,1)',
                    '&:hover': {
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      transform: 'translateY(-3px)',
                    },
                    '&:hover .photo-img': { transform: 'scale(1.05)' },
                    position: 'relative',
                    cursor: 'zoom-in',
                    // Fade-in stagger animation
                    animation: `dashFadeIn 0.5s ease-out ${Math.min(idx * 30, 600)}ms backwards`,
                    '@keyframes dashFadeIn': {
                      from: { opacity: 0, transform: 'translateY(12px)' },
                      to: { opacity: 1, transform: 'translateY(0)' },
                    },
                  }}
                >
                  {/* Photo */}
                  <Box sx={{ position: 'relative', paddingTop: '75%', bgcolor: '#f0f0f0', overflow: 'hidden' }}>
                    {photo.thumbnailUrl ? (
                      <Box
                        component="img"
                        className="photo-img"
                        src={photo.thumbnailUrl}
                        alt={photo.original_filename}
                        loading="lazy"
                        decoding="async"
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)',
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <PhotoLibraryIcon sx={{ color: '#ccc', fontSize: 40 }} />
                      </Box>
                    )}

                    {/* Hover overlay with stats + actions */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        '.MuiPaper-root:hover &': { opacity: 1 },
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      {/* Top row: like badge + delete */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 0.5 }}>
                        {photo.like_count > 0 && (
                          <Tooltip title="Bo luot thich cua khach tren anh nay">
                            <Chip
                              icon={<ThumbUpIcon sx={{ fontSize: 14, color: '#fff !important' }} />}
                              label={photo.like_count}
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                clearPhotoLikesMutation.mutate(photo.id);
                              }}
                              sx={{
                                bgcolor: '#F59E0B',
                                color: '#fff',
                                fontWeight: 600,
                                height: 24,
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            />
                          </Tooltip>
                        )}
                        <Box sx={{ flex: 1 }} />
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {/* Set as cover */}
                          <Tooltip title={album?.cover_photo_id === photo.id ? 'Ảnh bìa hiện tại' : 'Đặt làm ảnh bìa'}>
                            <IconButton
                              size="small"
                              onClick={async (e) => {
                                e.stopPropagation();
                                await supabase.from('albums').update({ cover_photo_id: photo.id }).eq('id', albumId);
                                queryClient.invalidateQueries({ queryKey: ['album', albumId] });
                                showSnackbar('Đã đặt ảnh bìa', 'success');
                              }}
                              sx={{
                                bgcolor: album?.cover_photo_id === photo.id ? '#C9A96E' : 'rgba(0,0,0,0.5)',
                                color: '#fff',
                                '&:hover': { bgcolor: '#C9A96E' },
                              }}
                            >
                              <PhotoLibraryIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {/* Delete */}
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteDialog({ open: true, photo });
                            }}
                            sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: '#fff', '&:hover': { bgcolor: 'rgba(220,0,0,0.8)' } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>

                      {/* Bottom row: stats badges */}
                      <Box sx={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)', p: 1, pt: 3 }}>
                        {photoGroupName && (
                          <Typography
                            sx={{
                              display: 'inline-block',
                              backgroundColor: 'rgba(0,0,0,0.55)',
                              backdropFilter: 'blur(6px)',
                              color: 'rgba(255,255,255,0.95)',
                              fontSize: '0.68rem',
                              fontWeight: 500,
                              px: 0.9,
                              py: 0.25,
                              borderRadius: '7px',
                              mb: 0.5,
                              maxWidth: '100%',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              letterSpacing: 0.2,
                            }}
                          >
                            {photoGroupName}
                          </Typography>
                        )}
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {photo.selection_count > 0 && (
                            <Tooltip title="Bo luot chon cua khach tren anh nay">
                            <Chip
                              icon={<CheckCircleIcon sx={{ fontSize: 14, color: '#fff !important' }} />}
                              label={`${photo.selection_count} chọn`}
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                clearPhotoSelectionsMutation.mutate(photo.id);
                              }}
                              sx={{ bgcolor: '#059669', color: '#fff', fontWeight: 600, height: 22, fontSize: '0.7rem', cursor: 'pointer' }}
                            />
                            </Tooltip>
                          )}
                          {photo.comment_count > 0 && (
                            <Chip
                              icon={<ChatBubbleOutlineIcon sx={{ fontSize: 14, color: '#fff !important' }} />}
                              label={`${photo.comment_count}`}
                              size="small"
                              sx={{ bgcolor: '#1565C0', color: '#fff', fontWeight: 600, height: 22, fontSize: '0.7rem' }}
                            />
                          )}
                        </Box>
                      </Box>
                    </Box>
                  </Box>

                  {/* Filename */}
                  <Box sx={{ px: 1.5, py: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '0.75rem',
                      }}
                    >
                      {photo.original_filename}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
              );
            })}
          </Grid>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Hiển thị {(currentPage - 1) * DEFAULT_PAGE_SIZE + 1}-
              {Math.min(currentPage * DEFAULT_PAGE_SIZE, totalCount)} / {totalCount} ảnh
              {photosFetching && !photosLoading ? ' — đang tải...' : ''}
            </Typography>
            <Pagination
              count={totalPages}
              page={currentPage}
              onChange={handlePageChange}
              color="primary"
              shape="rounded"
              showFirstButton
              showLastButton
              siblingCount={1}
              boundaryCount={1}
            />
          </Stack>
        )}
      </Box>

      {/* ========== COMMENTS PANEL (when BÌNH LUẬN tab active) ========== */}
      {subTab === 3 && allComments.length > 0 && (
        <Paper sx={{ mx: 3, mb: 3, p: 3, borderRadius: 3 }}>
          <Typography variant="h6" fontWeight={700} mb={2}>
            Bình luận ({allComments.length})
          </Typography>
          <Stack spacing={2} divider={<Box sx={{ borderBottom: '1px solid #eee' }} />}>
            {allComments.map((comment: any) => {
              const joinedPhoto = Array.isArray(comment.photos) ? comment.photos[0] : comment.photos;
              const driveThumb = joinedPhoto?.drive_file_id
                ? (joinedPhoto.drive_thumbnail_link || `https://lh3.googleusercontent.com/d/${joinedPhoto.drive_file_id}=w350`)
                : null;
              return (
                <Box key={comment.id}>
                  <Stack direction="row" spacing={2} alignItems="flex-start">
                    {driveThumb && (
                      <Box
                        component="img"
                        src={driveThumb}
                        sx={{ width: 60, height: 60, borderRadius: 1, objectFit: 'cover', flexShrink: 0 }}
                      />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {comment.author_name || 'Khách'}
                        </Typography>
                        <Chip
                          label={comment.author_type === 'studio' ? 'Studio' : 'Khách'}
                          size="small"
                          color={comment.author_type === 'studio' ? 'primary' : 'default'}
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {new Date(comment.created_at).toLocaleString('vi-VN')}
                        </Typography>
                      </Stack>
                      <Typography variant="body2">{comment.content}</Typography>
                      {joinedPhoto?.original_filename && (
                        <Typography variant="caption" color="text.secondary">
                          Ảnh: {joinedPhoto.original_filename}
                        </Typography>
                      )}
                    </Box>
                    {/* Delete icon — admin xoá bình luận */}
                    <Tooltip title="Xoá bình luận">
                      <IconButton
                        size="small"
                        onClick={() => setDeleteCommentDialog({
                          open: true,
                          commentId: comment.id,
                          preview: (comment.content || '').slice(0, 80),
                        })}
                        sx={{ color: 'text.disabled', '&:hover': { color: '#ef4444' } }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* ========== FOOTER ========== */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: '#fff',
          py: 4,
          px: { xs: 2, md: 4 },
          mt: 4,
          textAlign: 'center',
        }}
      >
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          San San.vn - Nen tang quan ly & chia se anh chuyen nghiep
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.5, mt: 0.5, display: 'block' }}>
          Lien he: support@sansan.vn
        </Typography>
      </Box>

      {/* ========== UPLOAD DIALOG ========== */}
      <Dialog
        open={uploadDialogOpen}
        onClose={() => {
          if (!uploading) {
            setUploadDialogOpen(false);
            setUploadFiles([]);
          }
        }}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 1, minHeight: '60vh' },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pb: 1,
            borderBottom: '1px solid #eee',
          }}
        >
          <Box component="span" sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'primary.main' }}>
            Thêm ảnh gốc vào: {album.title}
          </Box>
          <IconButton
            onClick={() => {
              if (!uploading) {
                setUploadDialogOpen(false);
                setUploadFiles([]);
              }
            }}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {/* Group label */}
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Nhóm: <strong>Anh goc</strong>
            </Typography>
            <IconButton size="small">
              <EditIcon fontSize="small" />
            </IconButton>
            <Button
              size="small"
              startIcon={<AddIcon />}
              sx={{ textTransform: 'none', color: ACCENT_BLUE }}
            >
              Tạo nhóm mới
            </Button>
          </Stack>

          {/* Dropzone */}
          <Box
            onDragOver={handleDialogDragOver}
            onDragLeave={handleDialogDragLeave}
            onDrop={handleDialogDrop}
            onClick={() => uploadDialogFileInputRef.current?.click()}
            sx={{
              flex: 1,
              minHeight: 250,
              border: '2px dashed',
              borderColor: dialogDragOver ? ACCENT_BLUE : '#ccc',
              borderRadius: 1,
              bgcolor: dialogDragOver ? '#E3F2FD' : '#FAFAFA',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              '&:hover': { borderColor: ACCENT_BLUE, bgcolor: '#F5F9FF' },
            }}
          >
            <UploadIcon sx={{ fontSize: 56, color: dialogDragOver ? ACCENT_BLUE : '#bbb', mb: 1 }} />
            <Typography variant="body1" fontWeight={600} color="text.secondary">
              Kéo thả ảnh/video hoac thu muc, hoặc click để chọn
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5 }}>
              Kéo thư mục vào để tự động tạo nhóm. Hỗ trợ: JPG, PNG, MP4, MOV, WebM.
            </Typography>
          </Box>

          <input
            ref={uploadDialogFileInputRef}
            type="file"
            multiple
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleDialogFileSelect}
          />

          {/* File list */}
          {uploadFiles.length > 0 && (
            <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1, color: 'text.secondary' }}>
                {uploadFiles.length} tep đã chọn
              </Typography>
              {uploadFiles.map((item) => (
                <Stack
                  key={item.id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{
                    py: 0.75,
                    px: 1.5,
                    mb: 0.5,
                    bgcolor: '#F9F9F9',
                    borderRadius: 1,
                  }}
                >
                  <InsertPhotoIcon fontSize="small" sx={{ color: '#aaa' }} />
                  <Typography
                    variant="caption"
                    sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {item.file.name}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {(item.file.size / 1024 / 1024).toFixed(1)} MB
                  </Typography>
                  {item.status === 'done' && (
                    <CheckCircleIcon fontSize="small" sx={{ color: 'green' }} />
                  )}
                  {item.status === 'uploading' && (
                    <CircularProgress size={16} />
                  )}
                  {item.status === 'pending' && (
                    <IconButton size="small" onClick={() => removeUploadFile(item.id)}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
              ))}
            </Box>
          )}

          {/* Upload progress bar */}
          {uploading && (
            <Box sx={{ width: '100%' }}>
              <LinearProgress variant="determinate" value={uploadProgress} sx={{ borderRadius: 1, height: 6 }} />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'center' }}>
                Đang tải len... {uploadProgress}%
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #eee' }}>
          <Button
            onClick={() => {
              if (!uploading) {
                setUploadDialogOpen(false);
                setUploadFiles([]);
              }
            }}
            disabled={uploading}
            sx={{ textTransform: 'none', color: '#777' }}
          >
            Hủy
          </Button>
          <Button
            variant="contained"
            onClick={handleUploadDialogSubmit}
            disabled={uploading || uploadFiles.length === 0}
            sx={{
              textTransform: 'none',
              bgcolor: ACCENT_BLUE,
              '&:hover': { bgcolor: '#0D47A1' },
              fontWeight: 600,
              borderRadius: 1,
              px: 4,
            }}
          >
            {uploading ? 'Đang tải...' : 'Upload'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== SHARE DIALOG ========== */}
      {album && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          album={album}
        />
      )}

      {/* ========== DELETE PHOTO CONFIRMATION ========== */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, photo: null })}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle>Xóa ảnh</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Ban co chac chan muon xoa anh &quot;{deleteDialog.photo?.original_filename}&quot;?
            Hanh dong nay khong the hoan tac.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, photo: null })} sx={{ textTransform: 'none' }}>
            Hủy
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteDialog.photo && deletePhotoMutation.mutate(deleteDialog.photo)}
            disabled={deletePhotoMutation.isPending}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {deletePhotoMutation.isPending ? 'Dang xoa...' : 'Xóa'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========== EDITED PHOTOS DIALOG ========== */}
      <Dialog open={editedDialogOpen} onClose={() => setEditedDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: '#1A1A2E', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box component="span" sx={{ fontWeight: 700 }}>Thêm ảnh chỉnh sửa</Box>
          <IconButton onClick={() => setEditedDialogOpen(false)} sx={{ color: '#fff' }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {/* Group selector */}
          <Stack direction="row" alignItems="center" spacing={1} mb={2} sx={{ mt: 2 }}>
            <FolderOpenIcon color="action" />
            <Typography fontWeight={600}>Nhóm: {editedGroupName}</Typography>
            <IconButton size="small" onClick={() => setShowNewGroupInput(true)}><EditIcon fontSize="small" /></IconButton>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setShowNewGroupInput(true)}>Tạo nhóm mới</Button>
          </Stack>

          {showNewGroupInput && (
            <Stack direction="row" spacing={1} mb={2}>
              <TextField size="small" fullWidth placeholder="Tên nhóm mới" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
              <Button variant="contained" onClick={async () => {
                if (!newGroupName.trim()) return;
                await supabase.from('photo_groups').insert({ album_id: albumId, name: newGroupName.trim() });
                queryClient.invalidateQueries({ queryKey: ['photo-groups', albumId] });
                setEditedGroupName(newGroupName.trim());
                setNewGroupName('');
                setShowNewGroupInput(false);
              }}>Lưu</Button>
            </Stack>
          )}

          {/* Group chips - select existing group */}
          {groups.length > 0 && (
            <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
              {groups.map((g: any) => (
                <Chip key={g.id} label={g.name} onClick={() => setEditedGroupName(g.name)}
                  color={editedGroupName === g.name ? 'primary' : 'default'} size="small" />
              ))}
            </Stack>
          )}

          {/* Drive link input */}
          <Button variant="contained" fullWidth sx={{ mb: 2, bgcolor: '#1565C0' }}>Link Google Drive</Button>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Nhập link Google Drive chứa ảnh đã chỉnh sửa. Hệ thống sẽ tự động tải ảnh về album.
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="https://drive.google.com/drive/folders/..."
            value={editedDriveUrl}
            onChange={e => setEditedDriveUrl(e.target.value)}
            sx={{ mb: 2 }}
          />

          {/* Scan result */}
          {editedFiles.length > 0 && (
            <Alert severity="success" sx={{ mb: 2 }}>Tìm thấy {editedFiles.length} ảnh</Alert>
          )}

          {editedUploading && (
            <Box mb={2}>
              <Typography variant="body2" mb={1}>Đang thêm ảnh... {editedProgress}%</Typography>
              <LinearProgress variant="determinate" value={editedProgress} />
            </Box>
          )}

          {editedScanning && (
            <Box mb={2} sx={{ textAlign: 'center' }}>
              <CircularProgress size={24} />
              <Typography variant="body2" sx={{ mt: 1 }}>Đang quét thư mục...</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditedDialogOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleAddEditedPhotos} disabled={editedUploading || editedScanning}>Xác nhận</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog "Copy mã chọn / Copy mã thích" với picker theo mục */}
      <CopyByGroupDialog
        open={copyDialog.open}
        onClose={() => setCopyDialog({ open: false, kind: null })}
        kind={copyDialog.kind}
        groups={groups.map((g: any) => ({ id: g.id, name: g.name }))}
        fetchItems={fetchCopyItems}
        onSnackbar={showSnackbar}
      />

      {/* Dialog confirm xoá bình luận */}
      <Dialog
        open={deleteCommentDialog.open}
        onClose={() => setDeleteCommentDialog({ open: false, commentId: null, preview: '' })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Xoá bình luận?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1.5 }}>
            Bình luận sẽ bị xoá vĩnh viễn, không thể khôi phục.
          </DialogContentText>
          {deleteCommentDialog.preview && (
            <Box sx={{
              p: 1.5, bgcolor: 'action.hover', borderRadius: 1,
              borderLeft: '3px solid', borderColor: 'error.light',
            }}>
              <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                &ldquo;{deleteCommentDialog.preview}{deleteCommentDialog.preview.length >= 80 ? '...' : ''}&rdquo;
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteCommentDialog({ open: false, commentId: null, preview: '' })}>
            Hủy
          </Button>
          <Button color="error" variant="contained" onClick={handleConfirmDeleteComment}>
            Xoá
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog "Sửa thông tin album" — đổi tên + mô tả */}
      <Dialog
        open={editAlbumDialog.open}
        onClose={() => !editAlbumDialog.saving && setEditAlbumDialog((s) => ({ ...s, open: false }))}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Sửa thông tin album</DialogTitle>
        <DialogContent dividers>
          <TextField
            label="Tên album"
            fullWidth
            autoFocus
            value={editAlbumDialog.title}
            onChange={(e) => setEditAlbumDialog((s) => ({ ...s, title: e.target.value }))}
            disabled={editAlbumDialog.saving}
            sx={{ mb: 2, mt: 0.5 }}
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            label="Mô tả (tuỳ chọn)"
            fullWidth
            multiline
            rows={3}
            value={editAlbumDialog.description}
            onChange={(e) => setEditAlbumDialog((s) => ({ ...s, description: e.target.value }))}
            disabled={editAlbumDialog.saving}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setEditAlbumDialog((s) => ({ ...s, open: false }))}
            disabled={editAlbumDialog.saving}
          >
            Hủy
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveAlbumInfo}
            disabled={editAlbumDialog.saving || !editAlbumDialog.title.trim()}
          >
            {editAlbumDialog.saving ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Lightbox — click ảnh trong dashboard để xem bự, vuốt qua lại, zoom */}
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        slides={photos.map((p) => ({
          src: p.url || p.thumbnailUrl || '',
          alt: p.original_filename,
          width: p.width || undefined,
          height: p.height || undefined,
        }))}
        plugins={[Zoom]}
        on={{ view: ({ index }) => setLightboxIndex(index) }}
        styles={{
          container: { backgroundColor: 'rgba(0, 0, 0, 0.92)', backdropFilter: 'blur(8px)' },
        }}
        animation={{ swipe: 350, fade: 250 }}
      />
    </Box>
  );
}
