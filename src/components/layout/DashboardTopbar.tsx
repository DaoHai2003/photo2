'use client';

import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Button,
  Badge,
  Box,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  MenuOutlined,
  AddOutlined,
  NotificationsOutlined,
} from '@mui/icons-material';
import { usePathname, useRouter } from 'next/navigation';

interface DashboardTopbarProps {
  onMenuToggle: () => void;
}

const pageTitles: Record<string, string> = {
  '/dashboard': 'Albums',
  '/dashboard/smart-filter': 'Lọc Ảnh',
  '/dashboard/website': 'Tạo Website',
  '/dashboard/guide': 'Hướng dẫn',
  '/dashboard/settings': 'Cài đặt Studio',
};

export default function DashboardTopbar({
  onMenuToggle,
}: DashboardTopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const pageTitle = pageTitles[pathname] || 'Dashboard';

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: 'background.paper',
        color: 'text.primary',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Toolbar
        sx={{
          minHeight: { xs: 56, sm: 64 },
          px: { xs: 2, sm: 3 },
        }}
      >
        {/* Left side */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          {isMobile && (
            <IconButton
              edge="start"
              onClick={onMenuToggle}
              sx={{
                mr: 1,
                color: 'text.secondary',
              }}
            >
              <MenuOutlined />
            </IconButton>
          )}
          <Box>
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
            >
              Dashboard
            </Typography>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                fontSize: { xs: '1rem', sm: '1.15rem' },
                lineHeight: 1.3,
              }}
            >
              {pageTitle}
            </Typography>
          </Box>
        </Box>

        {/* Right side */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isMobile ? (
            <IconButton
              color="primary"
              onClick={() => router.push('/dashboard/albums/new')}
              sx={{
                border: '1px solid',
                borderColor: 'primary.main',
                borderRadius: '10px',
              }}
            >
              <AddOutlined />
            </IconButton>
          ) : (
            <Button
              variant="outlined"
              startIcon={<AddOutlined />}
              onClick={() => router.push('/dashboard/albums/new')}
              sx={{
                borderRadius: '10px',
                textTransform: 'none',
                fontWeight: 600,
                px: 2.5,
              }}
            >
              Tạo Album
            </Button>
          )}

          <IconButton
            sx={{
              color: 'text.secondary',
              '&:hover': { backgroundColor: 'action.hover' },
            }}
          >
            <Badge
              badgeContent={0}
              color="error"
              variant="dot"
              invisible={true}
            >
              <NotificationsOutlined />
            </Badge>
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
