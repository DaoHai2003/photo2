/**
 * Stat card cho admin dashboard — gradient icon + big number + delta hint.
 * Dùng đi dùng lại cho các metric cards (users, studios, GB, ...).
 */
'use client';

import { Box, Card, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export interface AdminStatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
  gradient?: string;
}

export default function AdminStatCard({
  label,
  value,
  hint,
  icon,
  gradient = 'linear-gradient(135deg, #6366f1, #8b5cf6)',
}: AdminStatCardProps) {
  return (
    <Card
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 1,
        border: '1px solid rgba(255,255,255,0.06)',
        background: '#22223C',
        transition: 'all 0.22s cubic-bezier(0.16,1,0.3,1)',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: '0 12px 28px rgba(15,23,42,0.08)',
          borderColor: 'transparent',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography fontSize="0.78rem" color="text.secondary" fontWeight={600} letterSpacing={0.3} sx={{ textTransform: 'uppercase' }}>
          {label}
        </Typography>
        <Box
          sx={{
            width: 38, height: 38, borderRadius: 1.5,
            background: gradient,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            boxShadow: `0 4px 12px ${gradient.includes('6366f1') ? 'rgba(99,102,241,0.25)' : 'rgba(0,0,0,0.1)'}`,
          }}
        >
          {icon}
        </Box>
      </Box>

      <Typography fontSize="1.75rem" fontWeight={800} lineHeight={1.1} color="#E8E6E3">
        {value}
      </Typography>

      {hint && (
        <Typography fontSize="0.75rem" color="text.secondary" mt={0.5}>
          {hint}
        </Typography>
      )}
    </Card>
  );
}
