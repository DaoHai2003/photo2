/**
 * Admin Plan Management — panel set/cancel Pro cho 1 studio.
 * Hiện trong studio detail page bên cạnh Danger Zone.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card, Box, Typography, Button, Stack, Chip, Snackbar, Alert,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { WorkspacePremium, CancelOutlined } from '@mui/icons-material';
import { adminSetStudioProAction, adminCancelStudioProAction } from '@/actions/billing-actions';

export interface AdminPlanManagementProps {
  studioId: string;
  currentPlanName: string | null;
  currentExpiresAt: string | null;
  isTrial: boolean;
}

export default function AdminPlanManagement({
  studioId, currentPlanName, currentExpiresAt, isTrial,
}: AdminPlanManagementProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const isPro = currentPlanName === 'pro';

  const handleActivate = () => {
    if (!confirm(`Kích hoạt Pro ${cycle === 'yearly' ? '1 NĂM' : '1 THÁNG'} cho studio này?`)) return;
    startTransition(async () => {
      const res = await adminSetStudioProAction(studioId, cycle);
      if (res.error) setSnack({ msg: 'Lỗi: ' + res.error, severity: 'error' });
      else { setSnack({ msg: `Đã kích hoạt Pro (${cycle})`, severity: 'success' }); router.refresh(); }
    });
  };

  const handleCancel = () => {
    if (!confirm('Huỷ Pro? Studio sẽ rơi về Free ngay lập tức.')) return;
    startTransition(async () => {
      const res = await adminCancelStudioProAction(studioId);
      if (res.error) setSnack({ msg: 'Lỗi: ' + res.error, severity: 'error' });
      else { setSnack({ msg: 'Đã huỷ Pro — studio đã về Free', severity: 'success' }); router.refresh(); }
    });
  };

  return (
    <>
      <Card
        elevation={0}
        sx={{
          p: 2.5, borderRadius: 1,
          border: '1px solid rgba(201,169,110,0.25)',
          bgcolor: 'rgba(201,169,110,0.05)',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
          <WorkspacePremium sx={{ color: 'primary.main', fontSize: 20 }} />
          <Typography fontSize="0.95rem" fontWeight={700} color="primary.main">
            Quản lý gói cước
          </Typography>
        </Stack>

        {/* Current state */}
        <Stack direction="row" spacing={1} alignItems="center" mb={2} flexWrap="wrap">
          <Chip
            label={isPro ? 'PRO' : 'FREE'}
            size="small"
            color={isPro ? 'primary' : 'default'}
            sx={{ fontWeight: 700, letterSpacing: 0.5 }}
          />
          {isTrial && (
            <Chip label="TRIAL" size="small" color="success" sx={{ fontWeight: 700 }} />
          )}
          {currentExpiresAt && (
            <Typography fontSize="0.78rem" color="text.secondary">
              Hết hạn: {new Date(currentExpiresAt).toLocaleString('vi-VN')}
            </Typography>
          )}
        </Stack>

        {/* Actions */}
        <Box>
          <Typography fontSize="0.78rem" color="text.secondary" mb={1}>
            Cấp Pro thủ công (test / sale offline):
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup
              value={cycle}
              exclusive
              size="small"
              onChange={(_, v) => v && setCycle(v)}
            >
              <ToggleButton value="monthly" sx={{ fontSize: '0.72rem', px: 1.5 }}>1 tháng</ToggleButton>
              <ToggleButton value="yearly" sx={{ fontSize: '0.72rem', px: 1.5 }}>1 năm</ToggleButton>
            </ToggleButtonGroup>
            <Button
              variant="contained"
              size="small"
              startIcon={<WorkspacePremium fontSize="small" />}
              onClick={handleActivate}
              disabled={pending}
              sx={{ fontSize: '0.75rem', py: 0.5 }}
            >
              Kích hoạt Pro
            </Button>
            {isPro && (
              <Button
                variant="outlined"
                size="small"
                color="error"
                startIcon={<CancelOutlined fontSize="small" />}
                onClick={handleCancel}
                disabled={pending}
                sx={{ fontSize: '0.75rem', py: 0.5 }}
              >
                Huỷ Pro
              </Button>
            )}
          </Stack>
        </Box>
      </Card>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)}>
        {snack ? <Alert severity={snack.severity}>{snack.msg}</Alert> : undefined}
      </Snackbar>
    </>
  );
}
