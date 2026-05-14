/**
 * Sparkline chart cho signups 30 ngày — vẽ bằng SVG path, không cần lib chart.
 * Lightweight, nhanh, đẹp.
 */
'use client';

import { Box, Card, Typography } from '@mui/material';

export interface SignupsSparklineProps {
  data: { date: string; count: number }[];
}

export default function SignupsSparkline({ data }: SignupsSparklineProps) {
  // Fill missing days với count=0 để chart smooth
  const today = new Date();
  const last30: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const found = data.find((x) => x.date.startsWith(iso));
    last30.push({ date: iso, count: found ? Number(found.count) : 0 });
  }

  const maxCount = Math.max(1, ...last30.map((d) => d.count));
  const W = 600;
  const H = 100;
  const padding = 8;

  const points = last30.map((d, i) => {
    const x = padding + (i / (last30.length - 1)) * (W - 2 * padding);
    const y = H - padding - (d.count / maxCount) * (H - 2 * padding);
    return { x, y, count: d.count, date: d.date };
  });

  // Smooth Bezier path
  const pathD = points
    .map((p, i) => {
      if (i === 0) return `M ${p.x},${p.y}`;
      const prev = points[i - 1];
      const cx = (prev.x + p.x) / 2;
      return `Q ${cx},${prev.y} ${cx},${(prev.y + p.y) / 2} T ${p.x},${p.y}`;
    })
    .join(' ');

  const areaD = `${pathD} L ${points[points.length - 1].x},${H - padding} L ${points[0].x},${H - padding} Z`;

  const totalSignups = last30.reduce((s, d) => s + d.count, 0);

  return (
    <Card elevation={0} sx={{ p: 2.5, borderRadius: 1, border: '1px solid rgba(255,255,255,0.06)' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box>
          <Typography fontSize="0.78rem" color="text.secondary" fontWeight={600} letterSpacing={0.3} sx={{ textTransform: 'uppercase' }}>
            Đăng ký 30 ngày qua
          </Typography>
          <Typography fontSize="1.6rem" fontWeight={800} mt={0.5}>
            {totalSignups} <Typography component="span" fontSize="0.85rem" color="text.secondary" fontWeight={500}>tài khoản mới</Typography>
          </Typography>
        </Box>
      </Box>

      <Box sx={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 100 }}>
          <defs>
            <linearGradient id="sparkArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C9A96E" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#C9A96E" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#sparkArea)" />
          <path d={pathD} fill="none" stroke="#C9A96E" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {/* Endpoint dots */}
          {points.map((p, i) => (
            i === points.length - 1 ? (
              <circle key={i} cx={p.x} cy={p.y} r="4" fill="#C9A96E" stroke="#22223C" strokeWidth="2" />
            ) : null
          ))}
        </svg>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, px: 1 }}>
        <Typography fontSize="0.7rem" color="text.disabled">
          {last30[0].date.slice(5)}
        </Typography>
        <Typography fontSize="0.7rem" color="text.disabled">
          Hôm nay
        </Typography>
      </Box>
    </Card>
  );
}
