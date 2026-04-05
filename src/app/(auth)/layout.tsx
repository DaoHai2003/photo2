'use client';

import { Box, Typography } from '@mui/material';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Left Panel - Branding */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          width: '45%',
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #1A1A2E 0%, #2D2D44 50%, #1A1A2E 100%)',
          position: 'relative',
          overflow: 'hidden',
          px: 6,
        }}
      >
        {/* Decorative circles */}
        <Box
          sx={{
            position: 'absolute',
            top: -80,
            right: -80,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.03)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: -120,
            left: -60,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.02)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: '20%',
            left: '10%',
            width: 150,
            height: 150,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.015)',
          }}
        />

        {/* Camera Icon */}
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 3,
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <CameraAltOutlinedIcon sx={{ fontSize: 40, color: 'rgba(255,255,255,0.9)' }} />
        </Box>

        {/* Branding */}
        <Typography
          variant="h3"
          sx={{
            color: '#fff',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            mb: 1.5,
            textAlign: 'center',
          }}
        >
          San San
        </Typography>

        <Typography
          variant="body1"
          sx={{
            color: 'rgba(255,255,255,0.6)',
            textAlign: 'center',
            maxWidth: 320,
            lineHeight: 1.7,
            fontSize: '1rem',
          }}
        >
          Qu&#7843;n l&yacute; album &#7843;nh chuy&ecirc;n nghi&#7879;p cho studio
        </Typography>

        {/* Decorative dots */}
        <Box sx={{ display: 'flex', gap: 1, mt: 4 }}>
          {[0.4, 0.6, 0.8, 0.6, 0.4].map((opacity, i) => (
            <Box
              key={i}
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: `rgba(255,255,255,${opacity})`,
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Right Panel - Form */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fff',
          px: { xs: 3, sm: 6 },
          py: 4,
          minHeight: '100vh',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 440 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
