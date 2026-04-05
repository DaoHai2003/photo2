'use client';

import { useState } from 'react';
import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material';
import DashboardSidebar from '@/components/layout/DashboardSidebar';
import DashboardTopbar from '@/components/layout/DashboardTopbar';

const SIDEBAR_WIDTH = 280;

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
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
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
    </Box>
  );
}
