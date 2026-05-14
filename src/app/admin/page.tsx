/**
 * Admin Dashboard — overview stats cards + signups sparkline.
 * Server Component: fetch RPC trực tiếp, không cần client-side query.
 */
import { Box, Typography, Grid } from '@mui/material';
import {
  Groups, Business, BoltOutlined, BlockOutlined,
  PhotoLibrary, Image as ImageIcon, Storage, PersonAddAlt1,
} from '@mui/icons-material';
import { fetchAdminDashboardStats } from '@/lib/admin/fetch-admin-data';
import AdminStatCard from '@/components/admin/admin-stat-card';
import SignupsSparkline from '@/components/admin/signups-sparkline';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

export default async function AdminDashboardPage() {
  const stats = await fetchAdminDashboardStats();

  if (!stats) {
    return (
      <Box>
        <Typography color="error">Không tải được stats. Kiểm tra log server.</Typography>
      </Box>
    );
  }

  const cards = [
    { label: 'Tổng users', value: formatNumber(stats.total_users), icon: <Groups />, gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)' },
    { label: 'Studios', value: formatNumber(stats.total_studios), icon: <Business />, gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)' },
    { label: 'Active 30d', value: formatNumber(stats.active_30d), hint: `${Math.round((stats.active_30d / Math.max(1, stats.total_users)) * 100)}% tổng users`, icon: <BoltOutlined />, gradient: 'linear-gradient(135deg, #f59e0b, #f97316)' },
    { label: 'Bị khoá', value: formatNumber(stats.suspended_count), icon: <BlockOutlined />, gradient: 'linear-gradient(135deg, #64748b, #475569)' },
    { label: 'Tổng albums', value: formatNumber(stats.total_albums), icon: <PhotoLibrary />, gradient: 'linear-gradient(135deg, #14b8a6, #0d9488)' },
    { label: 'Tổng ảnh', value: formatNumber(stats.total_photos), icon: <ImageIcon />, gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)' },
    { label: 'Dung lượng', value: formatBytes(stats.total_storage_bytes), icon: <Storage />, gradient: 'linear-gradient(135deg, #8b5cf6, #6366f1)' },
    { label: 'Đăng ký 7d', value: formatNumber(stats.new_signups_7d), hint: 'Tài khoản mới tuần này', icon: <PersonAddAlt1 />, gradient: 'linear-gradient(135deg, #22c55e, #16a34a)' },
  ];

  return (
    <Box>
      {/* Page header */}
      <Box mb={4}>
        <Typography fontSize="1.7rem" fontWeight={800} color="#E8E6E3">
          Tổng quan
        </Typography>
        <Typography fontSize="0.9rem" color="text.secondary" mt={0.5}>
          Theo dõi số liệu người dùng, studios và hoạt động hệ thống.
        </Typography>
      </Box>

      {/* Stats grid */}
      <Grid container spacing={2.5} mb={4}>
        {cards.map((c) => (
          <Grid key={c.label} size={{ xs: 12, sm: 6, md: 3 }}>
            <AdminStatCard {...c} />
          </Grid>
        ))}
      </Grid>

      {/* Signups chart */}
      <SignupsSparkline data={stats.signups_by_day || []} />
    </Box>
  );
}
