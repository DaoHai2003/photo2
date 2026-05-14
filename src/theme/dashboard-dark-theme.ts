/**
 * Dashboard dark theme — MUI theme scoped riêng cho /dashboard/*
 * Áp dụng global qua ThemeProvider trong dashboard/layout.tsx
 * → toàn bộ Card / Paper / Button / TextField của dashboard tự động dark
 * mà không cần sửa từng file.
 *
 * Public pages (album, studio profile) vẫn dùng lightTheme bình thường.
 */
'use client';

import { createTheme } from '@mui/material/styles';
import {
  DARK_BG, DARK_PANEL, DARK_CARD, DARK_HOVER, DARK_BORDER, DARK_BORDER_STRONG,
  ACCENT_CYAN, ACCENT_GLOW, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED,
} from './dashboard-dark-tokens';

export const dashboardDarkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: ACCENT_CYAN,
      light: '#DCC189',
      dark: '#B8964F',
      contrastText: '#1A1A2E',
    },
    secondary: {
      main: '#A78BFA',
      light: '#C4B5FD',
      dark: '#7C3AED',
    },
    warning: { main: '#F59E0B' },
    error: { main: '#F87171' },
    success: { main: '#4ADE80' },
    background: {
      default: DARK_BG,
      paper: DARK_CARD,
    },
    text: {
      primary: TEXT_PRIMARY,
      secondary: TEXT_SECONDARY,
      disabled: TEXT_MUTED,
    },
    divider: DARK_BORDER,
    action: {
      hover: DARK_HOVER,
      selected: ACCENT_GLOW,
      disabled: TEXT_MUTED,
      disabledBackground: 'rgba(255,255,255,0.08)',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.2 },
    h2: { fontSize: '2rem', fontWeight: 700, lineHeight: 1.3 },
    h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.4 },
    h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 },
    h5: { fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.5 },
    h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
    body1: { fontSize: '0.95rem', lineHeight: 1.6 },
    body2: { fontSize: '0.85rem', lineHeight: 1.6 },
    caption: { fontSize: '0.72rem', lineHeight: 1.5 },
    button: { fontSize: '0.85rem', fontWeight: 600, textTransform: 'none' as const },
  },
  shape: { borderRadius: 7 },
  components: {
    // Card / Paper — dark surface với hover glow
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: DARK_CARD,
          borderRadius: 7,
        },
        outlined: {
          borderColor: DARK_BORDER,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: DARK_CARD,
          backgroundImage: 'none',
          border: `1px solid ${DARK_BORDER}`,
          borderRadius: 7,
          boxShadow: 'none',
          transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: { root: { '&:last-child': { paddingBottom: 16 } } },
    },
    // Button — primary cyan gradient, outlined với border subtle
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          textTransform: 'none',
          fontWeight: 600,
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
        containedPrimary: {
          color: '#1A1A2E',
          background: `linear-gradient(135deg, ${ACCENT_CYAN} 0%, #B8964F 100%)`,
          '&:hover': { background: `linear-gradient(135deg, #DCC189 0%, ${ACCENT_CYAN} 100%)` },
          '&.Mui-disabled': { background: DARK_HOVER, color: TEXT_MUTED },
        },
        outlined: {
          borderColor: DARK_BORDER_STRONG,
          color: TEXT_PRIMARY,
          '&:hover': { borderColor: ACCENT_CYAN, backgroundColor: ACCENT_GLOW },
        },
        text: {
          color: TEXT_SECONDARY,
          '&:hover': { backgroundColor: DARK_HOVER, color: TEXT_PRIMARY },
        },
      },
    },
    // Inputs — dark bg, cyan focus
    MuiTextField: {
      defaultProps: { variant: 'outlined' as const, size: 'small' as const },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          backgroundColor: DARK_HOVER,
          color: TEXT_PRIMARY,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: DARK_BORDER },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: DARK_BORDER_STRONG },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: ACCENT_CYAN, borderWidth: 1 },
        },
        input: { color: TEXT_PRIMARY },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: { color: TEXT_SECONDARY, '&.Mui-focused': { color: ACCENT_CYAN } } },
    },
    MuiSelect: {
      styleOverrides: { icon: { color: TEXT_SECONDARY } },
    },
    MuiMenuItem: {
      styleOverrides: { root: { fontSize: '0.85rem' } },
    },
    MuiMenu: {
      styleOverrides: { paper: { backgroundColor: DARK_CARD, border: `1px solid ${DARK_BORDER}` } },
    },
    // Chip — subtle dark
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 7, fontWeight: 600, backgroundColor: DARK_HOVER, color: TEXT_PRIMARY },
        outlined: { borderColor: DARK_BORDER_STRONG },
      },
    },
    // Dialog — dark surface
    MuiDialog: {
      styleOverrides: {
        paper: { backgroundColor: DARK_CARD, backgroundImage: 'none', border: `1px solid ${DARK_BORDER}` },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { color: TEXT_PRIMARY } } },
    // AppBar inside dashboard
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: DARK_PANEL, backgroundImage: 'none', boxShadow: 'none' },
      },
    },
    // Drawer (sidebar)
    MuiDrawer: {
      styleOverrides: { paper: { backgroundColor: DARK_PANEL, backgroundImage: 'none', border: 'none' } },
    },
    // Divider
    MuiDivider: { styleOverrides: { root: { borderColor: DARK_BORDER } } },
    // Tooltip
    MuiTooltip: {
      styleOverrides: { tooltip: { backgroundColor: '#1F2937', fontSize: '0.72rem' } },
    },
    // Tabs
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, color: TEXT_SECONDARY, '&.Mui-selected': { color: ACCENT_CYAN } },
      },
    },
    MuiTabs: {
      styleOverrides: { indicator: { backgroundColor: ACCENT_CYAN, height: 3, borderRadius: 2 } },
    },
    // Switch — cyan track when on
    MuiSwitch: {
      styleOverrides: {
        switchBase: { '&.Mui-checked': { color: ACCENT_CYAN, '+ .MuiSwitch-track': { backgroundColor: ACCENT_CYAN } } },
      },
    },
    // List
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: 7, '&.Mui-selected': { backgroundColor: ACCENT_GLOW, color: ACCENT_CYAN } },
      },
    },
    MuiListItemIcon: { styleOverrides: { root: { color: TEXT_SECONDARY } } },
  },
});
