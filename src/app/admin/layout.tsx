/**
 * Admin layout — sidebar cố định 260px + content area.
 * Wrap với dashboardDarkTheme để Card/Paper/Button tự động dark warm-gold.
 */
'use client';

import { Box } from '@mui/material';
import { ThemeProvider as MUIThemeProvider } from '@mui/material/styles';
import AdminSidebar from '@/components/admin/admin-sidebar';
import { dashboardDarkTheme } from '@/theme/dashboard-dark-theme';
import { DARK_BG } from '@/theme/dashboard-dark-tokens';

const SIDEBAR_W = 260;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <MUIThemeProvider theme={dashboardDarkTheme}>
      <Box
        sx={{
          display: 'flex',
          minHeight: '100vh',
          bgcolor: DARK_BG,
          color: '#E8E6E3',
          backgroundImage: `
            radial-gradient(circle at 0% 0%, rgba(201,169,110,0.06) 0%, transparent 40%),
            radial-gradient(circle at 100% 100%, rgba(184,150,79,0.04) 0%, transparent 40%)
          `,
        }}
      >
        <Box sx={{ width: SIDEBAR_W, flexShrink: 0, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
          <AdminSidebar />
        </Box>
        <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
          {children}
        </Box>
      </Box>
    </MUIThemeProvider>
  );
}
