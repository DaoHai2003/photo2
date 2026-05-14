'use client';

import { useState } from 'react';
import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material';
import { ThemeProvider as MUIThemeProvider } from '@mui/material/styles';
import DashboardSidebar from '@/components/layout/DashboardSidebar';
import DashboardTopbar from '@/components/layout/DashboardTopbar';
import UploadProgressChip from '@/components/dashboard/upload-progress-chip';
import { DARK_BG } from '@/theme/dashboard-dark-tokens';
import { dashboardDarkTheme } from '@/theme/dashboard-dark-theme';

const SIDEBAR_WIDTH = 260;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isLgUp = useMediaQuery(theme.breakpoints.up('lg'));

  const handleSidebarToggle = () => {
    setMobileOpen((prev) => !prev);
  };

  return (
    <MUIThemeProvider theme={dashboardDarkTheme}>
    <Box sx={{
      display: 'flex',
      minHeight: '100vh',
      bgcolor: DARK_BG,
      color: '#E2E8F0',
      // Subtle radial glow ở góc trên — chiều sâu, không phẳng
      backgroundImage: `
        radial-gradient(circle at 0% 0%, rgba(201,169,110,0.06) 0%, transparent 40%),
        radial-gradient(circle at 100% 100%, rgba(184,150,79,0.04) 0%, transparent 40%)
      `,
    }}>
      {/* Sidebar - permanent on lg+, temporary drawer on smaller */}
      {isLgUp ? (
        <Box
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
          }}
        >
          <DashboardSidebar open={true} onClose={() => {}} variant="permanent" />
        </Box>
      ) : (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleSidebarToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: SIDEBAR_WIDTH,
              boxSizing: 'border-box',
            },
          }}
        >
          <DashboardSidebar open={mobileOpen} onClose={handleSidebarToggle} variant="temporary" />
        </Drawer>
      )}

      {/* Main content area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          width: { lg: `calc(100% - ${SIDEBAR_WIDTH}px)` },
        }}
      >
        <DashboardTopbar onMenuToggle={handleSidebarToggle} />
        <Box sx={{ p: 3, flexGrow: 1 }}>{children}</Box>
      </Box>

      {/* Floating chip — track background upload jobs (Drive → album).
          Mount global để hiện ở mọi page trong dashboard. */}
      <UploadProgressChip />
    </Box>
    </MUIThemeProvider>
  );
}
