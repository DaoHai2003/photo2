/**
 * Nút "Sync" — gọi server action recompute dung lượng từ DB.
 * Hiện kết quả diff (vd: "+2.3 GB" / "-500 MB" / "Đã đồng bộ") sau click.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { IconButton, Tooltip, CircularProgress, Snackbar, Alert } from '@mui/material';
import { Sync } from '@mui/icons-material';
import { recomputeStudioStorageAction } from '@/actions/admin-actions';

function formatBytesSigned(bytes: number): string {
  if (bytes === 0) return 'Không thay đổi';
  const sign = bytes > 0 ? '+' : '−';
  const abs = Math.abs(bytes);
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = abs;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${sign}${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export interface AdminStorageSyncButtonProps {
  studioId: string;
}

export default function AdminStorageSyncButton({ studioId }: AdminStorageSyncButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const handleSync = () => {
    startTransition(async () => {
      const res = await recomputeStudioStorageAction(studioId);
      if (res.error) {
        setSnack({ msg: 'Lỗi: ' + res.error, severity: 'error' });
        return;
      }
      const diff = Number(res.result?.diff_bytes ?? 0);
      setSnack({
        msg: `Đã sync. Chênh lệch: ${formatBytesSigned(diff)}`,
        severity: 'success',
      });
      router.refresh();
    });
  };

  return (
    <>
      <Tooltip title="Sync dung lượng từ DB (recompute SUM file_size)">
        <IconButton
          size="small"
          onClick={handleSync}
          disabled={pending}
          sx={{ ml: 0.5 }}
        >
          {pending ? <CircularProgress size={14} /> : <Sync sx={{ fontSize: 16 }} />}
        </IconButton>
      </Tooltip>

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {snack ? (
          <Alert severity={snack.severity} onClose={() => setSnack(null)}>
            {snack.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
