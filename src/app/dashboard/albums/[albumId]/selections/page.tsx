'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSnackbar } from '@/components/providers/SnackbarProvider';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Stack,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Skeleton,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  PhotoLibrary as PhotoIcon,
  People as PeopleIcon,
  ContentCopy as CopyIcon,
  FileDownload as ExportIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';

interface SelectionRow {
  id: string;
  photo_id: string;
  guest_name: string;
  guest_email: string | null;
  created_at: string;
  photos: {
    id: string;
    original_filename: string;
    normalized_filename: string;
    storage_path: string;
    selection_count: number;
  };
}

type ViewMode = 'by_photo' | 'by_guest';

export default function SelectionsPage() {
  const params = useParams();
  const router = useRouter();
  const albumId = params.albumId as string;
  const supabase = createClient();
  const { user } = useAuthStore();
  const { showSnackbar } = useSnackbar();

  const [viewMode, setViewMode] = useState<ViewMode>('by_photo');

  const { data: selections = [], isLoading } = useQuery({
    queryKey: ['selections', albumId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('photo_selections')
        .select(`
          id,
          photo_id,
          guest_name,
          guest_email,
          created_at,
          photos (
            id,
            original_filename,
            normalized_filename,
            storage_path,
            selection_count
          )
        `)
        .eq('photos.album_id', albumId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as SelectionRow[];
    },
    enabled: !!albumId,
  });

  // Group by photo
  const byPhoto = useMemo(() => {
    const map = new Map<string, { filename: string; normalized: string; guests: string[]; count: number }>();
    selections.forEach((s) => {
      if (!s.photos) return;
      const key = s.photo_id;
      if (!map.has(key)) {
        map.set(key, {
          filename: s.photos.original_filename,
          normalized: s.photos.normalized_filename,
          guests: [],
          count: 0,
        });
      }
      const entry = map.get(key)!;
      entry.guests.push(s.guest_name);
      entry.count++;
    });
    return Array.from(map.entries()).map(([photoId, data]) => ({ photoId, ...data }));
  }, [selections]);

  // Group by guest
  const byGuest = useMemo(() => {
    const map = new Map<string, { email: string | null; photos: string[]; count: number }>();
    selections.forEach((s) => {
      if (!s.photos) return;
      const key = s.guest_name;
      if (!map.has(key)) {
        map.set(key, { email: s.guest_email, photos: [], count: 0 });
      }
      const entry = map.get(key)!;
      entry.photos.push(s.photos.original_filename);
      entry.count++;
    });
    return Array.from(map.entries()).map(([name, data]) => ({ name, ...data }));
  }, [selections]);

  const uniqueGuests = useMemo(() => {
    const names = new Set(selections.map((s) => s.guest_name));
    return names.size;
  }, [selections]);

  const uniquePhotos = useMemo(() => {
    const ids = new Set(selections.map((s) => s.photo_id));
    return ids.size;
  }, [selections]);

  const handleExport = () => {
    const filenames = byPhoto.map((p) => p.filename);
    const blob = new Blob([filenames.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selections_${albumId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showSnackbar('Đã xuất danh sách tên file', 'success');
  };

  const handleCopy = () => {
    const filenames = byPhoto.map((p) => p.filename);
    navigator.clipboard.writeText(filenames.join('\n'));
    showSnackbar('Đã sao chép danh sách vào clipboard', 'success');
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} mb={3}>
        <IconButton onClick={() => router.push(`/dashboard/albums/${albumId}`)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" fontWeight={700}>
          Ảnh được chọn
        </Typography>
      </Stack>

      {/* Summary */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={4} alignItems="center">
          <Stack direction="row" alignItems="center" spacing={1}>
            <CheckCircleIcon color="success" />
            <Typography variant="h6">
              {uniquePhotos} ảnh được chọn bởi {uniqueGuests} khách
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      {/* Controls */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, val) => val && setViewMode(val)}
          size="small"
        >
          <ToggleButton value="by_photo">
            <PhotoIcon sx={{ mr: 0.5 }} fontSize="small" />
            Theo ảnh
          </ToggleButton>
          <ToggleButton value="by_guest">
            <PeopleIcon sx={{ mr: 0.5 }} fontSize="small" />
            Theo khách
          </ToggleButton>
        </ToggleButtonGroup>

        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<ExportIcon />} onClick={handleExport}>
            Xuất danh sách
          </Button>
          <Button variant="outlined" startIcon={<CopyIcon />} onClick={handleCopy}>
            Sao chép
          </Button>
        </Stack>
      </Stack>

      {/* Content */}
      {isLoading ? (
        <Stack spacing={2}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height={60} sx={{ borderRadius: 1 }} />
          ))}
        </Stack>
      ) : selections.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            Chưa có lượt chọn nào
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Khi khách hàng chọn ảnh, danh sách sẽ hiển thị ở đây
          </Typography>
        </Paper>
      ) : viewMode === 'by_photo' ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Tên file</TableCell>
                <TableCell align="center">Số lượt chọn</TableCell>
                <TableCell>Người chọn</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {byPhoto.map((row) => (
                <TableRow key={row.photoId}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {row.filename}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={row.count} size="small" color="primary" />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                      {row.guests.map((g, i) => (
                        <Chip key={i} label={g} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Paper>
          <List>
            {byGuest.map((guest, idx) => (
              <Box key={guest.name}>
                {idx > 0 && <Divider />}
                <ListItem alignItems="flex-start">
                  <ListItemAvatar>
                    <Avatar>{guest.name.charAt(0).toUpperCase()}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography fontWeight={600}>{guest.name}</Typography>
                        <Chip label={`${guest.count} ảnh`} size="small" color="primary" />
                      </Stack>
                    }
                    secondary={
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5} mt={1}>
                        {guest.photos.map((p, i) => (
                          <Chip key={i} label={p} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    }
                  />
                </ListItem>
              </Box>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
