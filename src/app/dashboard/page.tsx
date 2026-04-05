'use client';

import {
  Box,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Skeleton,
  Typography,
} from '@mui/material';
import { FolderOutlined, CloudOutlined } from '@mui/icons-material';
import { useAuthStore } from '@/stores/authStore';
import { useStudioStats } from '@/hooks/useAlbums';

export default function DashboardPage() {
  const { studio } = useAuthStore();
  const { data: stats, isLoading } = useStudioStats();

  const studioName = studio?.name || 'Studio';

  const formatAlbumLimit = (max: number) => {
    return max === -1 ? '∞' : max;
  };

  const usedMB = stats ? Math.round((stats.storageUsedBytes || 0) / 1024 / 1024) : 0;
  const maxMB = stats?.maxStorageMb ?? 500;
  const storagePercent = maxMB > 0 ? Math.min((usedMB / maxMB) * 100, 100) : 0;

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} mb={3}>
        Xin chào, {studioName}!
      </Typography>

      <Grid container spacing={3}>
        {/* Albums card */}
        <Grid size={{"xs":12,"sm":6}}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: 'primary.light',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FolderOutlined sx={{ color: 'primary.main', fontSize: 28 }} />
                </Box>
                <Typography variant="subtitle1" color="text.secondary">
                  Albums
                </Typography>
              </Box>
              {isLoading ? (
                <Skeleton variant="text" width={120} height={40} />
              ) : (
                <Typography variant="h4" fontWeight={700}>
                  {stats?.albumCount ?? 0}{' '}
                  <Typography component="span" variant="h6" color="text.secondary">
                    / {formatAlbumLimit(stats?.maxAlbums ?? 0)}
                  </Typography>
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Storage card */}
        <Grid size={{"xs":12,"sm":6}}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    bgcolor: 'success.light',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloudOutlined sx={{ color: 'success.main', fontSize: 28 }} />
                </Box>
                <Typography variant="subtitle1" color="text.secondary">
                  Dung lượng
                </Typography>
              </Box>
              {isLoading ? (
                <>
                  <Skeleton variant="text" width={120} height={40} />
                  <Skeleton variant="rectangular" height={8} sx={{ borderRadius: 1, mt: 1 }} />
                </>
              ) : (
                <>
                  <Typography variant="h4" fontWeight={700}>
                    {usedMB} MB{' '}
                    <Typography component="span" variant="h6" color="text.secondary">
                      / {maxMB} MB
                    </Typography>
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={storagePercent}
                    sx={{
                      mt: 1.5,
                      height: 8,
                      borderRadius: 1,
                      bgcolor: 'grey.200',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 1,
                      },
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
