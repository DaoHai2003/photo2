'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSnackbar } from '@/components/providers/SnackbarProvider';
import ShareDialog from '@/components/album/ShareDialog';
import {
  usePhotosPaginated,
  usePhotoPagePrefetcher,
  invalidateAlbumPhotoPages,
  DEFAULT_PAGE_SIZE,
} from '@/hooks/usePhotosPaginated';
import { getAlbumPhotoFilenames } from '@/actions/photos';
import type {
  PhotoWithUrls,
  PhotoFilter,
  PhotoSort,
  PhotoSortDir,
} from '@/types/photo';
import { v4 as uuidv4 } from 'uuid';
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

const ACCENT_BLUE = '#1565C0';

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

  const handleCopyCode = async (type: 'select' | 'like') => {
    // Pull filenames from the server — needs the full album set, not just
    // the current page.
    const result = await getAlbumPhotoFilenames(
      albumId,
      type === 'select' ? 'selected' : 'liked'
    );
    if (result.error) {
      showSnackbar(result.error, 'error');
      return;
    }
    const filenames = result.data;
    if (filenames.length === 0) {
      showSnackbar(type === 'select' ? 'Chưa có ảnh nào được chọn' : 'Chưa có ảnh nào được thích', 'warning');
      return;
    }
    await navigator.clipboard.writeText(filenames.join('\n'));
    showSnackbar(`Đã copy ${filenames.length} tên file ${type === 'select' ? 'đã chọn' : 'đã thích'}`, 'success');
  };

  // Handle adding edited photos from Drive
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
        </Stack>


        {/* Toolbar Row */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ flexWrap: 'wrap', gap: 1 }}
        >
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setUploadDialogOpen(true)}
            sx={{
              bgcolor: ACCENT_BLUE,
              '&:hover': { bgcolor: '#0D47A1' },
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
            }}
          >
            Thêm Ảnh
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<CopyIcon />}
            onClick={() => handleCopyCode('select')}
            sx={{ textTransform: 'none', borderColor: 'divider', color: 'text.secondary', borderRadius: 2 }}
          >
            Copy mã chọn
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<CopyIcon />}
            onClick={() => handleCopyCode('like')}
            sx={{ textTransform: 'none', borderColor: 'divider', color: 'text.secondary', borderRadius: 2 }}
          >
            Copy mã thích
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<SortIcon />}
            onClick={(e) => setSortAnchorEl(e.currentTarget)}
            sx={{ textTransform: 'none', borderColor: 'divider', color: 'text.secondary', borderRadius: 2 }}
          >
            Sắp xếp
          </Button>
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

          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={(e) => setDownloadAnchorEl(e.currentTarget)}
            sx={{ textTransform: 'none', borderColor: 'divider', color: 'text.secondary', borderRadius: 2 }}
          >
            Tải về
          </Button>
          <Menu
            anchorEl={downloadAnchorEl}
            open={Boolean(downloadAnchorEl)}
            onClose={() => setDownloadAnchorEl(null)}
          >
            <MenuItem onClick={() => setDownloadAnchorEl(null)}>
              Tai tat ca anh goc
            </MenuItem>
            <MenuItem onClick={() => setDownloadAnchorEl(null)}>
              Tai anh đã chọn
            </MenuItem>
          </Menu>

          {album.drive_folder_url && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<FolderOpenIcon />}
              onClick={() => window.open(album.drive_folder_url!, '_blank')}
              sx={{ textTransform: 'none', borderColor: 'divider', color: 'text.secondary', borderRadius: 2 }}
            >
              Mở Drive
            </Button>
          )}

          <Button
            variant="outlined"
            size="small"
            startIcon={<ShareIcon />}
            onClick={() => setShareOpen(true)}
            sx={{ textTransform: 'none', borderColor: 'divider', color: 'text.secondary', borderRadius: 2 }}
          >
            Chia sẻ
          </Button>
        </Stack>
      </Box>

      {/* ========== PHOTO TYPE TABS ========== */}
      <Box sx={{ bgcolor: 'background.paper', px: { xs: 2, md: 4 }, pt: 2, pb: 0, borderBottom: '1px solid #E0E0E0' }}>
        <Stack direction="row" spacing={1.5} mb={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Chip
            label={`Ảnh Gốc (${originalCount})`}
            onClick={() => { setPhotoTypeTab(0); setSelectedGroupId(null); }}
            sx={{
              fontWeight: 600,
              fontSize: '0.875rem',
              bgcolor: photoTypeTab === 0 && !selectedGroupId ? ACCENT_BLUE : '#E3F2FD',
              color: photoTypeTab === 0 && !selectedGroupId ? '#fff' : ACCENT_BLUE,
              '&:hover': { bgcolor: photoTypeTab === 0 && !selectedGroupId ? '#0D47A1' : '#BBDEFB' },
              borderRadius: '16px',
              px: 1,
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
                fontWeight: 600,
                fontSize: '0.875rem',
                bgcolor: selectedGroupId === group.id ? '#7B1FA2' : '#F3E5F5',
                color: selectedGroupId === group.id ? '#fff' : '#7B1FA2',
                '&:hover': { bgcolor: selectedGroupId === group.id ? '#6A1B9A' : '#E1BEE7' },
                borderRadius: '16px',
                px: 1,
              }}
            />
          ))}
          <Chip
            label={`Ảnh Chỉnh Sửa (${editedCount})`}
            onClick={() => { setPhotoTypeTab(1); setSelectedGroupId(null); }}
            sx={{
              fontWeight: 600,
              fontSize: '0.875rem',
              bgcolor: photoTypeTab === 1 ? ACCENT_BLUE : '#E3F2FD',
              color: photoTypeTab === 1 ? '#fff' : ACCENT_BLUE,
              '&:hover': { bgcolor: photoTypeTab === 1 ? '#0D47A1' : '#BBDEFB' },
              borderRadius: '16px',
              px: 1,
            }}
          />
        </Stack>

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
                    <SearchIcon fontSize="small" sx={{ color: '#aaa' }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              width: 220,
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                bgcolor: '#F5F5F5',
                '& fieldset': { borderColor: '#E0E0E0' },
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
        ) : photos.length === 0 ? (
          <Paper
            sx={{
              p: 8,
              textAlign: 'center',
              bgcolor: 'background.paper',
              borderRadius: 3,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
          >
            <InsertPhotoIcon sx={{ fontSize: 72, color: '#ccc', mb: 2 }} />
            <Typography variant="h6" fontWeight={700} color="text.secondary" sx={{ letterSpacing: 1 }}>
              ALBUM NÀY CHƯĐ CÓ ẢNH NÀO
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
              Nhan &quot;+ Thêm Ảnh&quot; de bat dau tai anh len
            </Typography>
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {photos.map((photo) => (
              <Grid size={{ xs: 6, sm: 4, md: 3, lg: 2 }} key={photo.id}>
                <Paper
                  sx={{
                    borderRadius: 2,
                    overflow: 'hidden',
                    bgcolor: 'background.paper',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    '&:hover': {
                      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      transform: 'translateY(-2px)',
                    },
                    position: 'relative',
                    cursor: 'pointer',
                    contentVisibility: 'auto',
                    containIntrinsicSize: '200px',
                  }}
                >
                  {/* Photo */}
                  <Box sx={{ position: 'relative', paddingTop: '75%', bgcolor: '#f0f0f0' }}>
                    {photo.thumbnailUrl ? (
                      <Box
                        component="img"
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
            ))}
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
                    <Box sx={{ flex: 1 }}>
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
          sx: { borderRadius: 3, minHeight: '60vh' },
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
              borderRadius: 3,
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
              <LinearProgress variant="determinate" value={uploadProgress} sx={{ borderRadius: 2, height: 6 }} />
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
              borderRadius: 2,
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
    </Box>
  );
}
