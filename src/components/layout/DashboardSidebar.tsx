'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Avatar,
  IconButton,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  PhotoLibraryOutlined,
  FilterAltOutlined,
  LanguageOutlined,
  HelpOutlineOutlined,
  SettingsOutlined,
  LogoutOutlined,
  CameraAltOutlined,
  DarkModeOutlined,
  LightModeOutlined,
} from '@mui/icons-material';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';

const SIDEBAR_WIDTH = 280;

interface DashboardSidebarProps {
  open: boolean;
  onClose: () => void;
  variant: 'permanent' | 'temporary';
}

const navItems = [
  {
    label: 'Albums',
    icon: <PhotoLibraryOutlined />,
    href: '/dashboard/albums',
  },
  {
    label: 'Lọc Ảnh',
    icon: <FilterAltOutlined />,
    href: '/dashboard/smart-filter',
  },
  {
    label: 'Tạo Website',
    icon: <LanguageOutlined />,
    href: '/dashboard/website',
  },
  {
    label: 'Hướng dẫn',
    icon: <HelpOutlineOutlined />,
    href: '/dashboard/guide',
  },
  {
    label: 'Cài đặt Studio',
    icon: <SettingsOutlined />,
    href: '/dashboard/settings',
  },
];

export default function DashboardSidebar({
  open,
  onClose,
  variant,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, studio } = useAuthStore();
  const { mode, toggleMode } = useThemeStore();

  const studioName = studio?.name || user?.email || 'Studio';
  const studioInitial = studioName.charAt(0).toUpperCase();
  const currentPlan: string = 'Free';

  const isActive = (href: string) => {
    if (href === '/dashboard/albums') {
      return pathname === '/dashboard' || pathname === '/dashboard/albums' || pathname?.startsWith('/dashboard/albums');
    }
    return pathname?.startsWith(href);
  };

  const handleNavigate = (href: string) => {
    router.push(href);
    if (variant === 'temporary') {
      onClose();
    }
  };

  const handleLogout = async () => {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const sidebarContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* Logo section */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 3,
          py: 2.5,
          minHeight: 64,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
          }}
        >
          <CameraAltOutlined sx={{ fontSize: 22 }} />
        </Box>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            fontSize: '1.25rem',
            background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.02em',
          }}
        >
          San San
        </Typography>
      </Box>

      <Divider />

      {/* Navigation */}
      <List sx={{ flex: 1, px: 2, py: 2 }}>
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <ListItem key={item.href} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                onClick={() => handleNavigate(item.href)}
                sx={{
                  borderRadius: '10px',
                  py: 1.2,
                  px: 2,
                  transition: 'all 0.2s ease-in-out',
                  backgroundColor: active
                    ? 'primary.main'
                    : 'transparent',
                  color: active ? '#FFFFFF' : 'text.secondary',
                  '&:hover': {
                    backgroundColor: active
                      ? 'primary.dark'
                      : 'action.hover',
                    transform: 'translateX(2px)',
                  },
                  '& .MuiListItemIcon-root': {
                    color: active ? '#FFFFFF' : 'text.secondary',
                    minWidth: 40,
                    transition: 'color 0.2s ease-in-out',
                  },
                  '& .MuiListItemText-primary': {
                    fontWeight: active ? 600 : 500,
                    fontSize: '0.9rem',
                  },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {/* Bottom section */}
      <Box sx={{ px: 2, pb: 2 }}>
        {/* Plan badge */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            mb: 2,
          }}
        >
          <Chip
            label={`Gói ${currentPlan}`}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              ...(currentPlan === 'Pro'
                ? {
                    backgroundColor: '#FFF8E1',
                    color: '#F59E0B',
                    border: '1px solid #FDE68A',
                  }
                : {
                    backgroundColor: '#F0F0FF',
                    color: '#6366F1',
                    border: '1px solid #E0E0FF',
                  }),
            }}
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* User info */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 1,
          }}
        >
          <Avatar
            sx={{
              width: 36,
              height: 36,
              backgroundColor: 'primary.main',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
          >
            {studioInitial}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                fontSize: '0.85rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {studioName}
            </Typography>
          </Box>
          <Tooltip title="Đăng xuất">
            <IconButton
              size="small"
              onClick={handleLogout}
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  color: 'error.main',
                  backgroundColor: 'error.lighter',
                },
              }}
            >
              <LogoutOutlined sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Drawer
      variant={variant}
      open={open}
      onClose={onClose}
      ModalProps={{
        keepMounted: true, // Better performance on mobile
      }}
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: SIDEBAR_WIDTH,
          boxSizing: 'border-box',
          border: 'none',
        },
      }}
    >
      {sidebarContent}
    </Drawer>
  );
}
