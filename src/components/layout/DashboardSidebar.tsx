'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
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
  CardMembershipOutlined,
} from '@mui/icons-material';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import {
  DARK_PANEL, DARK_HOVER, DARK_BORDER,
  ACCENT_CYAN, ACCENT_GLOW, TEXT_PRIMARY, TEXT_SECONDARY,
} from '@/theme/dashboard-dark-tokens';

const SIDEBAR_WIDTH = 260;

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
    label: 'Gói cước',
    icon: <CardMembershipOutlined />,
    href: '/dashboard/billing',
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

  // Fetch plan thực từ DB qua RPC. Cache lâu (5p) để không spam RPC mỗi navigation.
  const { data: planData } = useQuery({
    queryKey: ['studio-plan', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const supabase = createClient();
      const { data } = await supabase.rpc('get_studio_plan', { p_studio_id: user.id });
      return data as { plan_name: 'free' | 'pro'; display_name: string; is_trial: boolean; expires_at: string | null } | null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
  const isPro = planData?.plan_name === 'pro';
  const isTrial = planData?.is_trial === true;

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
        background: `linear-gradient(180deg, ${DARK_PANEL} 0%, #13132A 100%)`,
        borderRight: `1px solid ${DARK_BORDER}`,
        color: TEXT_PRIMARY,
        animation: 'sidebarFadeIn 0.45s ease-out',
        '@keyframes sidebarFadeIn': {
          from: { opacity: 0, transform: 'translateX(-12px)' },
          to: { opacity: 1, transform: 'translateX(0)' },
        },
      }}
    >
      {/* Logo section */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: 2.25,
          py: 2,
          minHeight: 60,
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '7px',
            background: `linear-gradient(135deg, ${ACCENT_CYAN} 0%, #B8964F 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1A1A2E',
            boxShadow: `0 4px 14px ${ACCENT_GLOW}`,
            transition: 'transform 0.3s ease',
            '&:hover': { transform: 'rotate(-8deg) scale(1.06)' },
          }}
        >
          <CameraAltOutlined sx={{ fontSize: 20 }} />
        </Box>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '1.05rem',
            background: `linear-gradient(135deg, ${ACCENT_CYAN} 0%, #DCC189 100%)`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.01em',
          }}
        >
          San San
        </Typography>
      </Box>

      <Divider sx={{ borderColor: DARK_BORDER }} />

      {/* Navigation — text nhỏ + animation slide-in stagger */}
      <List sx={{ flex: 1, px: 1.5, py: 1.5 }}>
        {navItems.map((item, idx) => {
          const active = isActive(item.href);
          return (
            <ListItem
              key={item.href}
              disablePadding
              sx={{
                mb: 0.4,
                animation: `navFadeIn 0.4s ease-out ${0.15 + idx * 0.05}s backwards`,
                '@keyframes navFadeIn': {
                  from: { opacity: 0, transform: 'translateX(-8px)' },
                  to: { opacity: 1, transform: 'translateX(0)' },
                },
              }}
            >
              <ListItemButton
                onClick={() => handleNavigate(item.href)}
                sx={{
                  borderRadius: '7px',
                  py: 0.9,
                  px: 1.5,
                  transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
                  position: 'relative',
                  background: active
                    ? `linear-gradient(90deg, ${ACCENT_GLOW} 0%, transparent 100%)`
                    : 'transparent',
                  color: active ? ACCENT_CYAN : TEXT_SECONDARY,
                  border: `1px solid ${active ? 'rgba(201,169,110,0.25)' : 'transparent'}`,
                  '&:hover': {
                    backgroundColor: active ? ACCENT_GLOW : DARK_HOVER,
                    color: active ? ACCENT_CYAN : TEXT_PRIMARY,
                    transform: 'translateX(3px)',
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'inherit',
                    minWidth: 32,
                    transition: 'all 0.22s ease',
                    '& svg': { fontSize: 18 },
                  },
                  '& .MuiListItemText-primary': {
                    fontWeight: active ? 600 : 500,
                    fontSize: '0.78rem',
                    letterSpacing: 0.1,
                  },
                  // Indicator bar bên trái khi active
                  ...(active && {
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: -1,
                      top: '20%',
                      bottom: '20%',
                      width: 3,
                      borderRadius: '0 4px 4px 0',
                      background: ACCENT_CYAN,
                      boxShadow: `0 0 12px ${ACCENT_CYAN}`,
                    },
                  }),
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
      <Box sx={{ px: 1.5, pb: 1.5 }}>
        {/* Plan badge — clickable card → /dashboard/billing.
            Pro: gradient gold + diamond icon. Free: subtle với CTA "Nâng cấp".
            Trial: thêm chip nhỏ "TRIAL" + ngày còn lại. */}
        <Box
          onClick={() => router.push('/dashboard/billing')}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 1.25, py: 0.85, mb: 1.5,
            borderRadius: '7px',
            cursor: 'pointer',
            background: isPro
              ? `linear-gradient(135deg, ${ACCENT_GLOW} 0%, rgba(184,150,79,0.06) 100%)`
              : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isPro ? 'rgba(201,169,110,0.35)' : DARK_BORDER}`,
            transition: 'all 0.22s ease',
            '&:hover': {
              borderColor: ACCENT_CYAN,
              transform: 'translateY(-1px)',
              boxShadow: `0 4px 12px ${ACCENT_GLOW}`,
            },
          }}
        >
          {/* Star icon — gold cho Pro, outline cho Free */}
          <Box
            sx={{
              width: 26, height: 26,
              borderRadius: '6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              background: isPro
                ? `linear-gradient(135deg, ${ACCENT_CYAN}, #B8964F)`
                : 'rgba(255,255,255,0.05)',
              color: isPro ? '#1A1A2E' : TEXT_SECONDARY,
              fontSize: '0.85rem',
              boxShadow: isPro ? `0 2px 8px ${ACCENT_GLOW}` : 'none',
            }}
          >
            {isPro ? '✦' : '○'}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{
                fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.1,
                color: isPro ? ACCENT_CYAN : TEXT_PRIMARY,
                letterSpacing: 0.3,
              }}>
                {isPro ? 'PRO' : 'FREE'}
              </Typography>
              {isTrial && (
                <Box sx={{
                  fontSize: '0.55rem', fontWeight: 700,
                  px: 0.5, py: 0.05, borderRadius: '4px',
                  background: 'rgba(34,197,94,0.18)', color: '#4ADE80',
                  letterSpacing: 0.5,
                }}>
                  TRIAL
                </Box>
              )}
            </Box>
            <Typography sx={{
              fontSize: '0.62rem', color: TEXT_SECONDARY,
              lineHeight: 1.2, mt: 0.15,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {isPro
                ? (planData?.expires_at
                    ? `Hết hạn ${new Date(planData.expires_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`
                    : 'Vĩnh viễn')
                : 'Nâng cấp ngay →'}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ borderColor: DARK_BORDER, mb: 1.5 }} />

        {/* User info */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, px: 0.5 }}>
          <Avatar
            sx={{
              width: 30, height: 30,
              background: `linear-gradient(135deg, ${ACCENT_CYAN}, #B8964F)`,
              color: '#1A1A2E',
              fontSize: '0.78rem',
              fontWeight: 700,
            }}
          >
            {studioInitial}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 600,
                fontSize: '0.75rem',
                color: TEXT_PRIMARY,
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
                color: TEXT_SECONDARY,
                p: 0.5,
                '&:hover': {
                  color: '#F87171',
                  backgroundColor: 'rgba(248,113,113,0.12)',
                },
              }}
            >
              <LogoutOutlined sx={{ fontSize: 17 }} />
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
