/**
 * Admin Studio Detail — chi tiết 1 studio.
 * Server component fetch RPC `get_admin_studio_detail` → render layout 2 cột:
 *   - Left: thông tin studio + recent albums
 *   - Right: action panel (suspend / unsuspend / reset password)
 */
import { notFound } from 'next/navigation';
import {
  Box, Typography, Grid, Card, Avatar, Chip, Stack, Divider, Button,
} from '@mui/material';
import { ArrowBack, OpenInNew, PhotoLibrary } from '@mui/icons-material';
import { fetchAdminStudioDetail } from '@/lib/admin/fetch-admin-data';
import AdminStudioActions from '@/components/admin/admin-studio-actions';
import AdminStorageSyncButton from '@/components/admin/admin-storage-sync-button';
import AdminPlanManagement from '@/components/admin/admin-plan-management';
import { createServerSupabase } from '@/lib/supabase/server';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

interface InfoRowProps { label: string; value: React.ReactNode }
function InfoRow({ label, value }: InfoRowProps) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px dashed rgba(255,255,255,0.06)' }}>
      <Typography fontSize="0.78rem" color="text.secondary" fontWeight={600}>{label}</Typography>
      <Typography fontSize="0.85rem" color="#E8E6E3" fontWeight={500} sx={{ textAlign: 'right' }}>{value}</Typography>
    </Box>
  );
}

export default async function AdminStudioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await fetchAdminStudioDetail(id);

  if (!detail || !detail.studio) notFound();

  const studio = detail.studio as Record<string, string | number | null>;
  const user = detail.user;
  const plan = detail.plan as Record<string, string | number | boolean | null> | null;
  const isSuspended = !!studio.suspended_at;

  // Fetch active plan + expires_at qua RPC để truyền vô AdminPlanManagement
  const supabase = await createServerSupabase();
  const { data: planData } = await supabase.rpc('get_studio_plan', { p_studio_id: id });
  const studioPlan = planData as { plan_name: string; expires_at: string | null; is_trial: boolean } | null;

  return (
    <Box>
      {/* Back nav */}
      <Button
        href="/admin/studios"
        startIcon={<ArrowBack fontSize="small" />}
        size="small"
        sx={{ mb: 2, color: 'text.secondary' }}
      >
        Quay lại danh sách
      </Button>

      {/* Header */}
      <Card elevation={0} sx={{ p: 3, borderRadius: 1, border: '1px solid rgba(255,255,255,0.06)', mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ sm: 'center' }}>
          <Avatar
            src={(studio.logo_path as string) || undefined}
            sx={{
              width: 72, height: 72,
              bgcolor: 'rgba(201,169,110,0.12)', color: '#C9A96E',
              fontSize: '1.6rem', fontWeight: 800,
              border: '3px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 12px rgba(124,58,237,0.15)',
            }}
          >
            {(studio.name as string)?.[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography fontSize="1.5rem" fontWeight={800} color="#E8E6E3">{studio.name as string}</Typography>
            <Typography fontSize="0.85rem" color="text.secondary">/{studio.slug as string} · {user.email}</Typography>
            <Stack direction="row" spacing={1} mt={1}>
              {isSuspended ? (
                <Chip label="Bị khoá" size="small" sx={{ bgcolor: 'rgba(248,113,113,0.15)', color: '#F87171', fontWeight: 600 }} />
              ) : (
                <Chip label="Active" size="small" sx={{ bgcolor: 'rgba(74,222,128,0.15)', color: '#4ADE80', fontWeight: 600 }} />
              )}
              {plan && (
                <Chip label={plan.display_name as string} size="small" sx={{ bgcolor: 'rgba(201,169,110,0.12)', color: '#C9A96E', fontWeight: 600 }} />
              )}
            </Stack>
          </Box>
          <Button
            href={`/${studio.slug}`}
            target="_blank"
            variant="outlined"
            startIcon={<OpenInNew fontSize="small" />}
            size="small"
          >
            Xem trang public
          </Button>
        </Stack>
      </Card>

      <Grid container spacing={3}>
        {/* Left column */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card elevation={0} sx={{ p: 2.5, borderRadius: 1, border: '1px solid rgba(255,255,255,0.06)', mb: 3 }}>
            <Typography fontSize="0.95rem" fontWeight={700} mb={1.5}>Thông tin tài khoản</Typography>
            <InfoRow label="Email" value={user.email || '—'} />
            <InfoRow label="Email đã xác thực" value={user.email_confirmed_at ? '✓ ' + formatDate(user.email_confirmed_at) : 'Chưa'} />
            <InfoRow label="Tạo tài khoản" value={formatDate(user.created_at)} />
            <InfoRow label="Login cuối" value={formatDate(user.last_sign_in_at)} />
            <InfoRow label="SĐT" value={(studio.phone as string) || '—'} />
            <InfoRow label="Địa chỉ" value={(studio.address as string) || '—'} />
            <InfoRow label="Tổng albums" value={detail.album_count} />
            <InfoRow label="Tổng ảnh" value={detail.photo_count} />
            <InfoRow
              label="Dung lượng dùng"
              value={
                <>
                  {formatBytes(Number(studio.total_storage_used_bytes) || 0)}
                  <AdminStorageSyncButton studioId={id} />
                </>
              }
            />
            {plan && (
              <>
                <InfoRow label="Plan" value={plan.display_name as string} />
                <InfoRow label="Max albums" value={plan.max_albums === -1 ? 'Unlimited' : (plan.max_albums as number)} />
                <InfoRow label="Max storage" value={plan.max_storage_mb === -1 ? 'Unlimited' : `${plan.max_storage_mb} MB`} />
              </>
            )}
          </Card>

          {/* Recent albums */}
          <Card elevation={0} sx={{ p: 2.5, borderRadius: 1, border: '1px solid rgba(255,255,255,0.06)' }}>
            <Typography fontSize="0.95rem" fontWeight={700} mb={1.5}>Albums gần đây</Typography>
            {detail.recent_albums.length === 0 ? (
              <Typography fontSize="0.85rem" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                Chưa có album nào.
              </Typography>
            ) : (
              <Stack divider={<Divider sx={{ borderStyle: 'dashed' }} />} spacing={0}>
                {detail.recent_albums.map((a) => (
                  <Box key={a.id} sx={{ py: 1.2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <PhotoLibrary fontSize="small" sx={{ color: '#A8A8B8' }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography fontSize="0.85rem" fontWeight={600} noWrap>{a.title}</Typography>
                      <Typography fontSize="0.7rem" color="text.secondary">
                        /{a.slug} · {a.photo_count} ảnh · {formatDate(a.created_at)}
                      </Typography>
                    </Box>
                    <Button href={`/album/${a.slug}`} target="_blank" size="small" sx={{ fontSize: '0.7rem' }}>
                      Xem
                    </Button>
                  </Box>
                ))}
              </Stack>
            )}
          </Card>
        </Grid>

        {/* Right column — actions */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={2}>
            <AdminPlanManagement
              studioId={id}
              currentPlanName={studioPlan?.plan_name || 'free'}
              currentExpiresAt={studioPlan?.expires_at || null}
              isTrial={studioPlan?.is_trial || false}
            />
            <AdminStudioActions
              studioId={id}
              userEmail={user.email}
              isSuspended={isSuspended}
              suspendReason={(studio.suspend_reason as string) || null}
            />
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
