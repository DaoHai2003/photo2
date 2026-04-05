'use client';

import { Box, Container } from '@mui/material';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: '#FAFAFA',
      }}
    >
      <Container
        maxWidth={false}
        disableGutters
        sx={{
          minHeight: '100vh',
        }}
      >
        {children}
      </Container>
    </Box>
  );
}
