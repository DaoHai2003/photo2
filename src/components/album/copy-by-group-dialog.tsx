/**
 * CopyByGroupDialog — Modal liệt kê các mục (groups) khi user nhấn
 * "Copy mã chọn / Copy mã thích". User pick 1 mục → copy filename của ảnh
 * thuộc mục đó vào clipboard. "Tất cả mục" copy hết.
 *
 * Dùng pattern fetcher prop để dialog tái dùng được cho cả public album page
 * (client supabase) lẫn dashboard album page (server action).
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, IconButton, List, ListItemButton,
  ListItemText, Typography, Box, CircularProgress, Chip, Divider,
} from '@mui/material';
import {
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  FavoriteBorder as FavoriteBorderIcon,
} from '@mui/icons-material';

export interface CopyPhotoItem {
  filename: string;
  groupId: string | null;
}

export interface CopyDialogGroup {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 'liked' = ảnh có like_count > 0; 'selected' = ảnh có selection_count > 0. null = dialog chưa mở. */
  kind: 'liked' | 'selected' | null;
  /** Danh sách groups của album (để render tên + giữ thứ tự). */
  groups: CopyDialogGroup[];
  /** Fetcher fetch toàn bộ ảnh thoả kind (filename + groupId). Page parent tự lo source. */
  fetchItems: () => Promise<CopyPhotoItem[]>;
  /** Hook báo snackbar cho parent. */
  onSnackbar: (msg: string, severity: 'success' | 'warning' | 'error' | 'info') => void;
}

export default function CopyByGroupDialog({
  open, onClose, kind, groups, fetchItems, onSnackbar,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CopyPhotoItem[]>([]);

  // Reload mỗi lần dialog mở với kind mới
  useEffect(() => {
    if (!open || !kind) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchItems()
      .then((data) => { if (!cancelled) setItems(data); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // fetchItems bị bỏ qua dependency đệ tránh re-fetch khi parent recreate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  // Bucket items theo group_id, giữ thứ tự groups + nhóm "Chưa phân mục" cuối
  const buckets = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const it of items) {
      const key = it.groupId ?? '__none__';
      const arr = map.get(key) ?? [];
      arr.push(it.filename);
      map.set(key, arr);
    }
    const result: Array<{ id: string | null; name: string; filenames: string[] }> = [];
    for (const g of groups) {
      const fs = map.get(g.id);
      if (fs && fs.length) result.push({ id: g.id, name: g.name, filenames: fs });
    }
    const none = map.get('__none__');
    if (none && none.length) result.push({ id: null, name: 'Chưa phân mục', filenames: none });
    return result;
  }, [items, groups]);

  const total = items.length;
  const kindLabel = kind === 'liked' ? 'thích' : 'đã chọn';

  // Copy filename array vào clipboard, snackbar, đóng dialog
  const handleCopy = async (filenames: string[], label: string) => {
    if (filenames.length === 0) {
      onSnackbar(`Mục "${label}" chưa có ảnh nào ${kindLabel}`, 'warning');
      return;
    }
    try {
      await navigator.clipboard.writeText(filenames.join('\n'));
      onSnackbar(`Đã copy ${filenames.length} tên file — ${label}`, 'success');
      onClose();
    } catch {
      onSnackbar('Không copy được, trình duyệt chặn clipboard', 'error');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        {kind === 'liked'
          ? <FavoriteBorderIcon fontSize="small" sx={{ color: '#ef4444' }} />
          : <CopyIcon fontSize="small" />}
        <Typography component="span" sx={{ fontWeight: 700, fontSize: '1rem' }}>
          Copy mã {kindLabel} — chọn mục
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ ml: 'auto' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ py: 5, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : total === 0 ? (
          <Box sx={{ py: 5, textAlign: 'center' }}>
            <Typography color="text.secondary" fontSize="0.9rem">
              Chưa có ảnh nào {kindLabel}
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {/* "Tất cả mục" — copy hết */}
            <ListItemButton onClick={() => handleCopy(items.map((i) => i.filename), 'Tất cả mục')}>
              <ListItemText
                primary={<Typography fontWeight={700}>Tất cả mục</Typography>}
                secondary={`${total} ảnh ${kindLabel}`}
              />
              <Chip label={`Copy ${total}`} color="primary" size="small" />
            </ListItemButton>
            <Divider />

            {/* Từng mục */}
            {buckets.map((b) => (
              <ListItemButton
                key={b.id ?? '__none__'}
                onClick={() => handleCopy(b.filenames, b.name)}
                sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
              >
                <ListItemText
                  primary={b.name}
                  secondary={`${b.filenames.length} ảnh ${kindLabel}`}
                />
                <Chip label={`Copy ${b.filenames.length}`} size="small" />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
