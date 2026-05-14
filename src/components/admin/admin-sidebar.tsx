/**
 * Admin sidebar — gradient dark theme cho không gian admin.
 * Khác sidebar dashboard để admin biết mình đang ở đâu, tránh nhầm.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, Divider, Chip } from '@mui/material';
import { Dashboard, Groups, ExitToApp, ShieldOutlined, PaymentOutlined } from '@mui/icons-material';
import {
  DARK_PANEL, DARK_HOVER, DARK_BORDER,
  ACCENT_CYAN, ACCENT_GLOW, TEXT_PRIMARY, TEXT_SECONDARY,
} from '@/theme/dashboard-dark-tokens';

const NAV_ITEMS = [
  { label: 'Tổng quan', href: '/admin', icon: <Dashboard /> },
  { label: 'Studios', href: '/admin/studios', icon: <Groups /> },
  { label: 'Thanh toán', href: '/admin/payments', icon: <PaymentOutlined /> },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
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
      {/* Logo header */}
      <Box sx={{ p: 2.25, pb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 36, height: 36, borderRadius: '7px',
              background: `linear-gradient(135deg, ${ACCENT_CYAN}, #B8964F)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 14px ${ACCENT_GLOW}`,
              transition: 'transform 0.3s ease',
              '&:hover': { transform: 'rotate(-8deg) scale(1.06)' },
            }}
          >
            <ShieldOutlined sx={{ color: '#1A1A2E', fontSize: 20 }} />
          </Box>
          <Box>
            <Typography fontWeight={700} fontSize="1.05rem" lineHeight={1.1} sx={{ color: TEXT_PRIMARY }}>
              Admin
            </Typography>
            <Typography fontSize="0.68rem" sx={{ color: TEXT_SECONDARY }}>
              Photoshare Control
            </Typography>
          </Box>
        </Box>
        <Chip
          label="SUPER ADMIN"
          size="small"
          sx={{
            mt: 1.5,
            height: 18,
            fontSize: '0.62rem',
            fontWeight: 700,
            letterSpacing: 0.5,
            background: ACCENT_GLOW,
            color: ACCENT_CYAN,
            border: `1px solid rgba(201,169,110,0.3)`,
            borderRadius: '7px',
          }}
        />
      </Box>

      <Divider sx={{ borderColor: DARK_BORDER }} />

      {/* Nav */}
      <List sx={{ flex: 1, p: 1.25 }}>
        {NAV_ITEMS.map((item, idx) => {
          const active = pathname === item.href ||
            (item.href !== '/admin' && pathname.startsWith(item.href));
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
                component={Link}
                href={item.href}
                sx={{
                  borderRadius: '7px',
                  py: 0.9,
                  px: 1.5,
                  position: 'relative',
                  background: active
                    ? `linear-gradient(90deg, ${ACCENT_GLOW} 0%, transparent 100%)`
                    : 'transparent',
                  border: `1px solid ${active ? 'rgba(201,169,110,0.25)' : 'transparent'}`,
                  color: active ? ACCENT_CYAN : TEXT_SECONDARY,
                  '&:hover': {
                    background: active ? ACCENT_GLOW : DARK_HOVER,
                    color: active ? ACCENT_CYAN : TEXT_PRIMARY,
                    transform: 'translateX(3px)',
                  },
                  transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
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
                <ListItemIcon sx={{ minWidth: 32, color: 'inherit', '& svg': { fontSize: 18 } }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: '0.78rem', fontWeight: active ? 600 : 500, letterSpacing: 0.1 }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ borderColor: DARK_BORDER }} />

      {/* Bottom: back to dashboard */}
      <Box sx={{ p: 1.25 }}>
        <ListItemButton
          component={Link}
          href="/dashboard/albums"
          sx={{
            borderRadius: '7px',
            py: 0.85,
            px: 1.5,
            color: TEXT_SECONDARY,
            '&:hover': { background: DARK_HOVER, color: TEXT_PRIMARY },
            transition: 'all 0.22s ease',
          }}
        >
          <ListItemIcon sx={{ minWidth: 32, color: 'inherit', '& svg': { fontSize: 17 } }}>
            <ExitToApp />
          </ListItemIcon>
          <ListItemText
            primary="Về Dashboard"
            primaryTypographyProps={{ fontSize: '0.78rem', fontWeight: 500 }}
          />
        </ListItemButton>
      </Box>
    </Box>
  );
}
