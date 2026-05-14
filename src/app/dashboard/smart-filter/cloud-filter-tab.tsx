/**
 * Cloud Filter Tab — lọc + tải ảnh từ cloud (Drive / Supabase Storage)
 * KHÔNG cần file trong máy.
 *
 * Flow:
 *  1. User chọn album từ dropdown
 *  2. Paste danh sách tên file
 *  3. Server action getPhotosByFilenames trả URLs (proxy /api/drive/download
 *     hoặc Supabase signed URL)
 *  4. Client fetch song song (max 6 connection) + push vào JSZip
 *  5. JSZip generate blob → trigger browser download "{album-slug}-N-anh.zip"
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Stack, TextField,
  LinearProgress, Alert, MenuItem, Chip, List, ListItem,
  ListItemIcon, ListItemText, Divider, CircularProgress,
} from '@mui/material';
import {
  CheckCircle as CheckIcon, Error as ErrorIcon,
  CloudDownload as CloudDownloadIcon, PlayArrow as PlayIcon,
  Album as AlbumIcon, Edit as EditIcon,
} from '@mui/icons-material';
import { getAlbums } from '@/actions/albums';
import { getPhotosByFilenames } from '@/actions/photos';
import JSZip from 'jszip';

interface AlbumOption {
  id: string;
  title: string;
  slug: string;
  photo_count: number;
}

interface DownloadResult {
  filename: string;
  status: 'pending' | 'downloading' | 'done' | 'failed' | 'not_found';
  error?: string;
}

const MAX_PARALLEL = 6;

export default function CloudFilterTab() {
  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [filenamesText, setFilenamesText] = useState('');
  const [zipName, setZipName] = useState(''); // optional custom name
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<DownloadResult[]>([]);
  const [zipping, setZipping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load danh sách albums của studio để dropdown
  useEffect(() => {
    let cancelled = false;
    getAlbums().then((res) => {
      if (cancelled) return;
      setLoadingAlbums(false);
      if (res.error) {
        setErrorMsg(res.error);
        return;
      }
      setAlbums((res.data ?? []).map((a: any) => ({
        id: a.id, title: a.title, slug: a.slug, photo_count: a.photo_count,
      })));
    });
    return () => { cancelled = true; };
  }, []);

  // Parse filenames input → unique non-empty list. Hỗ trợ separator
  // newline / comma / tab / semicolon (paste từ Excel cũng OK).
  const parsedFilenames = filenamesText
    .split(/[\r\n,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const uniqueFilenames = Array.from(new Set(parsedFilenames));

  // Sanitize ZIP name: bỏ ký tự không hợp lệ filesystem, ép .zip extension
  const sanitizeZipName = (raw: string, fallback: string): string => {
    const cleaned = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim();
    if (!cleaned) return `${fallback}.zip`;
    return cleaned.toLowerCase().endsWith('.zip') ? cleaned : `${cleaned}.zip`;
  };

  const selectedAlbum = albums.find((a) => a.id === selectedAlbumId);

  const handleStart = useCallback(async () => {
    if (!selectedAlbumId || uniqueFilenames.length === 0) return;
    setRunning(true);
    setZipping(false);
    setErrorMsg(null);
    setResults(uniqueFilenames.map((f) => ({ filename: f, status: 'pending' })));
    setProgress({ done: 0, total: uniqueFilenames.length });

    // Step 1: lookup URLs từ server
    const lookup = await getPhotosByFilenames(selectedAlbumId, uniqueFilenames);
    if (lookup.error) {
      setErrorMsg(lookup.error);
      setRunning(false);
      return;
    }

    // Update results: mark not_found cho file không tìm thấy
    const lookupMap = new Map(lookup.data.map((d) => [d.filename, d]));
    setResults(uniqueFilenames.map((f) => {
      const r = lookupMap.get(f);
      return r?.matched
        ? { filename: f, status: 'pending' as const }
        : { filename: f, status: 'not_found' as const };
    }));

    // Step 2: tải song song MAX_PARALLEL connection, push vào JSZip
    const zip = new JSZip();
    const matched = lookup.data.filter((d) => d.matched && d.downloadUrl);
    let doneCount = uniqueFilenames.length - matched.length; // not_found = đã "done"
    setProgress({ done: doneCount, total: uniqueFilenames.length });

    // Worker queue: pull task khi có slot trống
    let nextIdx = 0;
    const downloadOne = async (): Promise<void> => {
      while (nextIdx < matched.length) {
        const idx = nextIdx++;
        const item = matched[idx];
        // Mark downloading
        setResults((prev) => prev.map((r) =>
          r.filename === item.filename ? { ...r, status: 'downloading' } : r
        ));
        try {
          const res = await fetch(item.downloadUrl!);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          zip.file(item.filename, blob);
          setResults((prev) => prev.map((r) =>
            r.filename === item.filename ? { ...r, status: 'done' } : r
          ));
        } catch (err: any) {
          setResults((prev) => prev.map((r) =>
            r.filename === item.filename
              ? { ...r, status: 'failed', error: err?.message ?? 'fetch error' }
              : r
          ));
        } finally {
          doneCount++;
          setProgress({ done: doneCount, total: uniqueFilenames.length });
        }
      }
    };

    // Spawn N workers
    const workers = Array.from({ length: Math.min(MAX_PARALLEL, matched.length) }, () => downloadOne());
    await Promise.all(workers);

    // Step 3: nếu có ít nhất 1 file ok → zip + trigger download
    const successCount = matched.length - results.filter((r) => r.status === 'failed').length;
    if (successCount > 0) {
      setZipping(true);
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE', // Ảnh đã nén rồi, đừng zip nén nữa cho nhanh
      });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      const fallback = `${selectedAlbum?.slug || 'album'}-${successCount}-anh`;
      a.download = sanitizeZipName(zipName, fallback);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setZipping(false);
    }
    setRunning(false);
  }, [selectedAlbumId, uniqueFilenames, selectedAlbum, results]);

  const stats = {
    done: results.filter((r) => r.status === 'done').length,
    failed: results.filter((r) => r.status === 'failed').length,
    notFound: results.filter((r) => r.status === 'not_found').length,
  };
  const overallProgress = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <Box>
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography fontWeight={700} mb={2} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlbumIcon fontSize="small" /> Bước 1 — Chọn album
        </Typography>
        <TextField
          select fullWidth size="small"
          value={selectedAlbumId}
          onChange={(e) => setSelectedAlbumId(e.target.value)}
          disabled={loadingAlbums || running}
          label={loadingAlbums ? 'Đang tải albums...' : 'Album'}
        >
          {albums.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.title} <Box component="span" sx={{ color: 'text.disabled', ml: 1, fontSize: '0.85em' }}>
                ({a.photo_count} ảnh)
              </Box>
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      <Paper sx={{ p: 3, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography fontWeight={700}>
            Bước 2 — Danh sách tên file
          </Typography>
          {filenamesText && (
            <Button
              size="small" color="inherit"
              onClick={() => setFilenamesText('')}
              disabled={running}
            >
              Xoá
            </Button>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" mb={2} display="block">
          Dán trực tiếp từ Copy mã chọn / Copy mã thích — mỗi dòng 1 tên file
          (hỗ trợ thêm phân tách bằng dấu phẩy / tab).
        </Typography>
        <TextField
          fullWidth multiline rows={8}
          placeholder={'R5II1647.webp\nR5II1277.webp\nR5II8924.webp\n...'}
          value={filenamesText}
          onChange={(e) => setFilenamesText(e.target.value)}
          disabled={running}
          sx={{ fontFamily: 'monospace' }}
        />
        {uniqueFilenames.length > 0 && (
          <Chip
            label={`${uniqueFilenames.length} file (đã loại trùng)`}
            size="small" sx={{ mt: 1.5 }} color="primary" variant="outlined"
          />
        )}
      </Paper>

      {/* Bước 3 — đặt tên file ZIP (optional) */}
      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography fontWeight={700} mb={1} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EditIcon fontSize="small" /> Bước 3 — Đặt tên file ZIP (tuỳ chọn)
        </Typography>
        <Typography variant="caption" color="text.secondary" mb={1.5} display="block">
          Bỏ trống để dùng tên mặc định: <code>{selectedAlbum?.slug || 'album'}-{uniqueFilenames.length || 'N'}-anh.zip</code>
        </Typography>
        <TextField
          fullWidth size="small"
          placeholder="VD: anh-cuoi-thu-thao-2026"
          value={zipName}
          onChange={(e) => setZipName(e.target.value)}
          disabled={running}
          helperText='Tự động thêm đuôi ".zip". Ký tự không hợp lệ ( < > : " / \ | ? * ) sẽ bị loại bỏ.'
        />
      </Paper>

      <Paper sx={{ p: 3, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography fontWeight={700}>
            Bước 4 — Tải về ZIP
          </Typography>
          <Button
            variant="contained"
            startIcon={running ? <CircularProgress size={16} sx={{ color: 'inherit' }} /> : <CloudDownloadIcon />}
            onClick={handleStart}
            disabled={running || !selectedAlbumId || uniqueFilenames.length === 0}
          >
            {zipping ? 'Đang nén ZIP...' : running ? 'Đang tải...' : 'Tải về ZIP'}
          </Button>
        </Stack>

        {progress.total > 0 && (
          <Box>
            <Stack direction="row" justifyContent="space-between" mb={0.5}>
              <Typography variant="caption" color="text.secondary">
                {progress.done}/{progress.total} file
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {Math.round(overallProgress)}%
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={overallProgress} sx={{ height: 8, borderRadius: 1 }} />
            <Stack direction="row" spacing={1} mt={1.5} sx={{ flexWrap: 'wrap' }}>
              {stats.done > 0 && <Chip size="small" color="success" icon={<CheckIcon />} label={`${stats.done} thành công`} />}
              {stats.failed > 0 && <Chip size="small" color="error" icon={<ErrorIcon />} label={`${stats.failed} lỗi`} />}
              {stats.notFound > 0 && <Chip size="small" color="warning" label={`${stats.notFound} không tìm thấy`} />}
            </Stack>
          </Box>
        )}
      </Paper>

      {/* Detail list — chỉ show file fail / not_found để user biết rõ */}
      {results.some((r) => r.status === 'failed' || r.status === 'not_found') && (
        <Paper sx={{ p: 3 }}>
          <Typography fontWeight={700} mb={1.5}>
            File chưa tải được
          </Typography>
          <List dense>
            {results.filter((r) => r.status === 'failed' || r.status === 'not_found').map((r) => (
              <Box key={r.filename}>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {r.status === 'not_found'
                      ? <ErrorIcon color="warning" fontSize="small" />
                      : <ErrorIcon color="error" fontSize="small" />}
                  </ListItemIcon>
                  <ListItemText
                    primary={r.filename}
                    secondary={r.status === 'not_found' ? 'Không tìm thấy trong album' : (r.error || 'Tải lỗi')}
                    primaryTypographyProps={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  />
                </ListItem>
                <Divider component="li" />
              </Box>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}
