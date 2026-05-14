'use client';

import { createTheme } from '@mui/material/styles';

const sharedTypography = {
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  h1: { fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.2 },
  h2: { fontSize: '2rem', fontWeight: 700, lineHeight: 1.3 },
  h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.4 },
  h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 },
  h5: { fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.5 },
  h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
  body1: { fontSize: '1rem', lineHeight: 1.6 },
  body2: { fontSize: '0.875rem', lineHeight: 1.6 },
  caption: { fontSize: '0.75rem', lineHeight: 1.5 },
  button: { fontSize: '0.875rem', fontWeight: 600, textTransform: 'none' as const },
};

const sharedShape = { borderRadius: 7 };

const sharedComponents = {
  MuiButton: {
    styleOverrides: {
      root: { borderRadius: 7, padding: '8px 20px', boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
    },
  },
  MuiTextField: {
    defaultProps: { variant: 'outlined' as const, size: 'medium' as const },
    styleOverrides: { root: { '& .MuiOutlinedInput-root': { borderRadius: 7 } } },
  },
  MuiDialog: { styleOverrides: { paper: { borderRadius: 7 } } },
  MuiChip: { styleOverrides: { root: { borderRadius: 7, fontWeight: 500 } } },
  MuiAppBar: { styleOverrides: { root: { boxShadow: '0 1px 3px rgba(0,0,0,0.05)' } } },
};

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1A1A2E', light: '#2D2D44', dark: '#0F0F1A', contrastText: '#FFFFFF' },
    secondary: { main: '#E8B4B8', light: '#F0D0D3', dark: '#D4909A', contrastText: '#1A1A2E' },
    warning: { main: '#C9A96E', light: '#D9C49A', dark: '#A68B4B' },
    error: { main: '#DC2626' },
    success: { main: '#059669' },
    background: { default: '#F8F9FC', paper: '#FFFFFF' },
    text: { primary: '#1A1A2E', secondary: '#6B7280', disabled: '#9CA3AF' },
    divider: '#E5E7EB',
  },
  typography: sharedTypography,
  shape: sharedShape,
  components: {
    ...sharedComponents,
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 7, padding: '8px 20px', boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
          // Disabled style chung — visible cho mọi variant, không bị
          // chìm vào background dialog.
          '&.Mui-disabled': {
            opacity: 0.6,
            cursor: 'not-allowed',
          },
        },
        // Dùng backgroundColor (không gradient shorthand) để sx prop
        // bgcolor:'...' từ chỗ khác override được.
        containedPrimary: {
          backgroundColor: '#1A1A2E',
          color: '#FFFFFF',
          '&:hover': { backgroundColor: '#2D2D44' },
          '&.Mui-disabled': {
            backgroundColor: '#D1D5DB',
            color: '#6B7280',
          },
        },
        // Đảm bảo mọi contained button có disabled style rõ ràng,
        // không lẫn vào nền trắng của Dialog.
        contained: {
          '&.Mui-disabled': {
            backgroundColor: '#D1D5DB',
            color: '#6B7280',
          },
        },
        outlined: {
          '&.Mui-disabled': {
            borderColor: '#E5E7EB',
            color: '#9CA3AF',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
          border: '1px solid #F0F0F0',
          '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
          transition: 'box-shadow 0.2s ease',
        },
      },
    },
  },
});

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#7C8CF5', light: '#A0AEFF', dark: '#5B6BD4', contrastText: '#FFFFFF' },
    secondary: { main: '#E8B4B8', light: '#F0D0D3', dark: '#D4909A' },
    warning: { main: '#C9A96E', light: '#D9C49A', dark: '#A68B4B' },
    error: { main: '#EF4444' },
    success: { main: '#10B981' },
    background: { default: '#0F0F1A', paper: '#1A1A2E' },
    text: { primary: '#E5E7EB', secondary: '#9CA3AF', disabled: '#6B7280' },
    divider: '#2D2D44',
  },
  typography: sharedTypography,
  shape: sharedShape,
  components: {
    ...sharedComponents,
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 7, padding: '8px 20px', boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
          '&.Mui-disabled': {
            opacity: 0.6,
            cursor: 'not-allowed',
          },
        },
        containedPrimary: {
          backgroundColor: '#7C8CF5',
          color: '#FFFFFF',
          '&:hover': { backgroundColor: '#5B6BD4' },
          '&.Mui-disabled': {
            backgroundColor: '#374151',
            color: '#9CA3AF',
          },
        },
        contained: {
          '&.Mui-disabled': {
            backgroundColor: '#374151',
            color: '#9CA3AF',
          },
        },
        outlined: {
          '&.Mui-disabled': {
            borderColor: '#374151',
            color: '#6B7280',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          border: '1px solid #2D2D44',
          backgroundColor: '#1A1A2E',
          '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.4)' },
          transition: 'box-shadow 0.2s ease',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
});

// Default export for backward compatibility
export default lightTheme;
