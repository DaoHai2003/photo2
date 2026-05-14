/**
 * Upload Progress Chip — floating chip góc dưới-phải hiển thị các job
 * upload đang chạy ngầm (Drive → album).
 *
 * Đọc useUploadJobsStore. Mỗi job render 1 card mini:
 *   • Title album
 *   • Progress bar + counter "47/200"
 *   • Status chip (running / done / error)
 *   • Click chip → navigate vô album đó (deep link)
 *   • Close button khi done/error → remove khỏi UI
 *
 * Mount 1 lần trong dashboard layout. KHÔNG động data.
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Card, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import { CheckCircle, Close as CloseIcon, CloudUpload, ErrorOutline } from '@mui/icons-material';
import { useUploadJobsStore } from '@/stores/upload-jobs-store';

export default function UploadProgressChip() {
  const router = useRouter();
  const jobs = useUploadJobsStore((s) => s.jobs);
  const removeJob = useUploadJobsStore((s) => s.removeJob);

  // Auto-remove DONE jobs sau 8 giây để khỏi đầy màn hình
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const job of jobs) {
      if (job.status === 'done') {
        timers.push(setTimeout(() => removeJob(job.id), 8000));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [jobs, removeJob]);

  if (jobs.length === 0) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: { xs: 12, md: 24 },
        right: { xs: 12, md: 24 },
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        maxWidth: { xs: 'calc(100vw - 24px)', sm: 340 },
      }}
    >
      {jobs.map((job) => {
        const pct = job.total > 0 ? Math.round((job.uploaded / job.total) * 100) : 0;
        const color =
          job.status === 'done' ? 'success.main'
          : job.status === 'error' ? 'error.main'
          : 'primary.main';

        return (
          <Card
            key={job.id}
            elevation={6}
            sx={{
              p: 1.5,
              borderRadius: 2,
              cursor: 'pointer',
              transition: 'transform 0.18s',
              animation: 'slideUpIn 0.35s cubic-bezier(0.16,1,0.3,1)',
              '@keyframes slideUpIn': {
                from: { opacity: 0, transform: 'translateY(20px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
              '&:hover': { transform: 'translateY(-2px)' },
            }}
            onClick={() => router.push(`/dashboard/albums/${job.id}`)}
          >
            <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
              {job.status === 'running' && <CloudUpload sx={{ color, fontSize: 18 }} />}
              {job.status === 'done' && <CheckCircle sx={{ color, fontSize: 18 }} />}
              {job.status === 'error' && <ErrorOutline sx={{ color, fontSize: 18 }} />}
              <Typography fontWeight={700} fontSize="0.85rem" sx={{ flex: 1, minWidth: 0 }} noWrap>
                {job.albumTitle}
              </Typography>
              {(job.status === 'done' || job.status === 'error') && (
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); removeJob(job.id); }}
                  sx={{ ml: 'auto', p: 0.25 }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              )}
            </Stack>

            {job.status === 'running' && (
              <>
                <LinearProgress
                  variant="determinate"
                  value={pct}
                  sx={{ height: 6, borderRadius: 3, mb: 0.5 }}
                />
                <Typography variant="caption" color="text.secondary" fontSize="0.7rem">
                  Đang upload {job.uploaded}/{job.total} ({pct}%)
                </Typography>
              </>
            )}
            {job.status === 'done' && (
              <Typography variant="caption" color="success.main" fontSize="0.75rem" fontWeight={600}>
                ✓ Đã upload xong {job.uploaded} ảnh
              </Typography>
            )}
            {job.status === 'error' && (
              <Typography variant="caption" color="error.main" fontSize="0.7rem">
                {job.errorMsg || 'Upload lỗi — thử lại sau'}
              </Typography>
            )}
          </Card>
        );
      })}
    </Box>
  );
}
