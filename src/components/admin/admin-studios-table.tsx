/**
 * Admin Studios Table — search + filter + paginate.
 * Client component vì cần interactive search/filter UX (debounce + URL sync).
 */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Box, Card, TextField, InputAdornment, Stack, Chip, Typography,
  Table, TableHead, TableRow, TableCell, TableBody, IconButton,
  Pagination, ToggleButton, ToggleButtonGroup, Avatar, Tooltip,
} from '@mui/material';
import { Search, BlockOutlined, CheckCircleOutline, OpenInNew } from '@mui/icons-material';
import type { AdminStudioRow } from '@/lib/admin/fetch-admin-data';

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} ngày`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

export interface AdminStudiosTableProps {
  initialRows: AdminStudioRow[];
  initialTotalCount: number;
  initialPage: number;
  initialSearch: string;
  initialFilter: 'active' | 'suspended' | null;
  pageSize: number;
}

export default function AdminStudiosTable({
  initialRows,
  initialTotalCount,
  initialPage,
  initialSearch,
  initialFilter,
  pageSize,
}: AdminStudiosTableProps) {
  const router = useRouter();
  const params = useSearchParams();

  const [search, setSearch] = useState(initialSearch);

  // Debounce search → push lên URL → server re-render
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams(params.toString());
      if (search) qs.set('q', search); else qs.delete('q');
      qs.delete('page'); // reset về trang 1 khi search
      router.push(`/admin/studios?${qs.toString()}`);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleFilterChange = (_: unknown, value: string | null) => {
    const qs = new URLSearchParams(params.toString());
    if (value) qs.set('status', value); else qs.delete('status');
    qs.delete('page');
    router.push(`/admin/studios?${qs.toString()}`);
  };

  const handlePageChange = (_: unknown, page: number) => {
    const qs = new URLSearchParams(params.toString());
    qs.set('page', String(page));
    router.push(`/admin/studios?${qs.toString()}`);
  };

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(initialTotalCount / pageSize)),
    [initialTotalCount, pageSize]
  );

  return (
    <Card elevation={0} sx={{ borderRadius: 1, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      {/* Filter bar */}
      <Box sx={{ p: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo email, tên studio..."
          size="small"
          sx={{ flex: 1, minWidth: 240 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />
        <ToggleButtonGroup
          size="small"
          value={initialFilter}
          exclusive
          onChange={handleFilterChange}
        >
          <ToggleButton value="active" sx={{ px: 2, fontSize: '0.78rem' }}>Active</ToggleButton>
          <ToggleButton value="suspended" sx={{ px: 2, fontSize: '0.78rem' }}>Bị khoá</ToggleButton>
        </ToggleButtonGroup>
        <Typography fontSize="0.8rem" color="text.secondary" sx={{ ml: 'auto' }}>
          {initialTotalCount.toLocaleString('vi-VN')} studios
        </Typography>
      </Box>

      {/* Table */}
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 1100 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#2A2A48' }}>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Studio</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Email</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Plan</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">Albums</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">Ảnh</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">Dung lượng</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Login cuối</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Đăng ký</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {initialRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 6, color: 'text.secondary', fontSize: '0.85rem' }}>
                  Không có studio nào khớp.
                </TableCell>
              </TableRow>
            ) : initialRows.map((r) => (
              <TableRow
                key={r.id}
                hover
                sx={{ '&:hover': { bgcolor: '#2A2A48' }, cursor: 'pointer' }}
                onClick={() => router.push(`/admin/studios/${r.id}`)}
              >
                <TableCell>
                  <Stack direction="row" spacing={1.2} alignItems="center">
                    <Avatar src={r.logo_path || undefined} sx={{ width: 32, height: 32, bgcolor: 'rgba(201,169,110,0.12)', color: '#C9A96E', fontSize: '0.85rem', fontWeight: 700 }}>
                      {r.name?.[0]?.toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography fontSize="0.85rem" fontWeight={600} color="#E8E6E3">{r.name}</Typography>
                      <Typography fontSize="0.7rem" color="text.secondary">/{r.slug}</Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography fontSize="0.8rem" color="#E8E6E3">{r.user_email || r.email || '—'}</Typography>
                  {r.phone && <Typography fontSize="0.7rem" color="text.secondary">{r.phone}</Typography>}
                </TableCell>
                <TableCell>
                  <Chip
                    label={r.plan_name || 'Chưa có'}
                    size="small"
                    sx={{
                      height: 22, fontSize: '0.7rem', fontWeight: 600,
                      bgcolor: r.plan_name ? 'rgba(201,169,110,0.12)' : 'rgba(255,255,255,0.06)',
                      color: r.plan_name ? '#C9A96E' : '#64748b',
                    }}
                  />
                </TableCell>
                <TableCell align="right" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.album_count}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{r.photo_count}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                  {formatBytes(Number(r.total_storage_used_bytes))}
                </TableCell>
                <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                  {timeAgo(r.user_last_sign_in_at)}
                </TableCell>
                <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                  {timeAgo(r.user_created_at || r.studio_created_at)}
                </TableCell>
                <TableCell>
                  {r.suspended_at ? (
                    <Chip icon={<BlockOutlined sx={{ fontSize: 14 }} />} label="Khoá" size="small" sx={{ bgcolor: 'rgba(248,113,113,0.15)', color: '#F87171', height: 22, fontSize: '0.68rem', fontWeight: 600 }} />
                  ) : (
                    <Chip icon={<CheckCircleOutline sx={{ fontSize: 14 }} />} label="Active" size="small" sx={{ bgcolor: 'rgba(74,222,128,0.15)', color: '#4ADE80', height: 22, fontSize: '0.68rem', fontWeight: 600 }} />
                  )}
                </TableCell>
                <TableCell>
                  <Tooltip title="Xem chi tiết">
                    <IconButton
                      size="small"
                      component={Link}
                      href={`/admin/studios/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <OpenInNew fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Pagination
            count={totalPages}
            page={initialPage}
            onChange={handlePageChange}
            shape="rounded"
            size="small"
            color="primary"
          />
        </Box>
      )}
    </Card>
  );
}
