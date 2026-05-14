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
import {
  DARK_PANEL, DARK_BORDER, ACCENT_CYAN, ACCENT_GLOW,
  TEXT_PRIMARY, TEXT_SECONDARY,
} from '@/theme/dashboard-dark-tokens';

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
        backgroundColor: `${DARK_PANEL}E6`,  // 90% opacity = subtle glass
        backdropFilter: 'blur(12px)',
        color: TEXT_PRIMARY,
        borderBottom: `1px solid ${DARK_BORDER}`,
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 52, sm: 58 }, px: { xs: 2, sm: 2.5 } }}>
        {/* Left side */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          {isMobile && (
            <IconButton edge="start" onClick={onMenuToggle} sx={{ mr: 1, color: TEXT_SECONDARY }}>
              <MenuOutlined />
            </IconButton>
          )}
          <Box>
            <Typography sx={{ color: TEXT_SECONDARY, fontSize: '0.65rem', letterSpacing: 1.5, fontWeight: 600, textTransform: 'uppercase' }}>
              Dashboard
            </Typography>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: { xs: '0.95rem', sm: '1.05rem' },
                lineHeight: 1.2,
                color: TEXT_PRIMARY,
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
              onClick={() => router.push('/dashboard/albums/new')}
              sx={{
                color: ACCENT_CYAN,
                border: `1px solid ${ACCENT_CYAN}40`,
                borderRadius: '7px',
                '&:hover': { backgroundColor: ACCENT_GLOW, borderColor: ACCENT_CYAN },
              }}
            >
              <AddOutlined />
            </IconButton>
          ) : (
            <Button
              startIcon={<AddOutlined />}
              onClick={() => router.push('/dashboard/albums/new')}
              sx={{
                borderRadius: '7px',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.78rem',
                px: 2,
                py: 0.6,
                color: '#1A1A2E',
                background: `linear-gradient(135deg, ${ACCENT_CYAN} 0%, #B8964F 100%)`,
                boxShadow: `0 4px 12px ${ACCENT_GLOW}`,
                transition: 'all 0.22s ease',
                '&:hover': {
                  background: `linear-gradient(135deg, #DCC189 0%, ${ACCENT_CYAN} 100%)`,
                  transform: 'translateY(-1px)',
                  boxShadow: `0 6px 20px ${ACCENT_GLOW}`,
                },
              }}
            >
              Tạo Album
            </Button>
          )}

          <IconButton
            sx={{
              color: TEXT_SECONDARY,
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.04)', color: ACCENT_CYAN },
            }}
          >
            <Badge badgeContent={0} color="error" variant="dot" invisible={true}>
              <NotificationsOutlined sx={{ fontSize: 20 }} />
            </Badge>
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
