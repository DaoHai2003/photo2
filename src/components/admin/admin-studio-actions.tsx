/**
 * Action panel cho admin studio detail — suspend / unsuspend / reset password.
 * Client component vì cần state cho dialog confirm + reason input.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card, Box, Typography, Button, TextField, Stack, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { BlockOutlined, LockOpen, Key, ContentCopy } from '@mui/icons-material';
import {
  suspendStudioAction,
  unsuspendStudioAction,
  generatePasswordResetLinkAction,
} from '@/actions/admin-actions';

export interface AdminStudioActionsProps {
  studioId: string;
  userEmail: string | null;
  isSuspended: boolean;
  suspendReason: string | null;
}

export default function AdminStudioActions({
  studioId, userEmail, isSuspended, suspendReason,
}: AdminStudioActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const handleSuspend = () => {
    startTransition(async () => {
      const res = await suspendStudioAction(studioId, reason || null);
      if (res.error) setMsg('Lỗi: ' + res.error);
      else { setMsg('Đã khoá studio.'); setSuspendOpen(false); setReason(''); router.refresh(); }
    });
  };

  const handleUnsuspend = () => {
    if (!confirm('Mở khoá studio này?')) return;
    startTransition(async () => {
      const res = await unsuspendStudioAction(studioId);
      if (res.error) setMsg('Lỗi: ' + res.error);
      else { setMsg('Đã mở khoá.'); router.refresh(); }
    });
  };

  const handleResetPwd = () => {
    if (!userEmail) { setResetError('Không có email user.'); return; }
    startTransition(async () => {
      setResetError(null); setResetLink(null);
      const res = await generatePasswordResetLinkAction(userEmail);
      if (res.error) setResetError(res.error);
      else if (res.link) setResetLink(res.link);
    });
  };

  return (
    <Card elevation={0} sx={{ p: 2.5, borderRadius: 1, border: '1px solid rgba(248,113,113,0.25)', bgcolor: 'rgba(248,113,113,0.08)' }}>
      <Typography fontSize="0.95rem" fontWeight={700} color="#F87171" mb={2}>
        Danger Zone
      </Typography>

      {msg && <Alert severity="info" onClose={() => setMsg(null)} sx={{ mb: 2 }}>{msg}</Alert>}

      <Stack spacing={1.5}>
        {/* Suspend / Unsuspend */}
        {isSuspended ? (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography fontSize="0.85rem" fontWeight={600}>Studio đang bị khoá</Typography>
              {suspendReason && (
                <Typography fontSize="0.75rem" color="text.secondary">Lý do: {suspendReason}</Typography>
              )}
            </Box>
            <Button
              variant="outlined"
              color="success"
              size="small"
              startIcon={<LockOpen />}
              onClick={handleUnsuspend}
              disabled={pending}
            >
              Mở khoá
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography fontSize="0.85rem" fontWeight={600}>Khoá tài khoản</Typography>
              <Typography fontSize="0.75rem" color="text.secondary">User sẽ không login được</Typography>
            </Box>
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<BlockOutlined />}
              onClick={() => setSuspendOpen(true)}
              disabled={pending}
            >
              Khoá
            </Button>
          </Box>
        )}

        {/* Reset password */}
        <Box sx={{ pt: 1.5, borderTop: '1px dashed #fca5a5' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography fontSize="0.85rem" fontWeight={600}>Reset password</Typography>
              <Typography fontSize="0.75rem" color="text.secondary">Tạo link copy gửi user</Typography>
            </Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Key />}
              onClick={handleResetPwd}
              disabled={pending || !userEmail}
            >
              Tạo link
            </Button>
          </Box>

          {resetError && <Alert severity="error" sx={{ mt: 1.5 }}>{resetError}</Alert>}
          {resetLink && (
            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#22223C', borderRadius: 1, border: '1px solid rgba(201,169,110,0.3)' }}>
              <Typography fontSize="0.7rem" color="text.secondary" mb={0.5}>Link reset (gửi user):</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField value={resetLink} size="small" fullWidth InputProps={{ readOnly: true, sx: { fontSize: '0.72rem' } }} />
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<ContentCopy fontSize="small" />}
                  onClick={() => navigator.clipboard.writeText(resetLink)}
                >
                  Copy
                </Button>
              </Stack>
            </Box>
          )}
        </Box>
      </Stack>

      {/* Suspend dialog */}
      <Dialog open={suspendOpen} onClose={() => setSuspendOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Khoá tài khoản này?</DialogTitle>
        <DialogContent>
          <Typography fontSize="0.85rem" color="text.secondary" mb={2}>
            User sẽ không đăng nhập được nữa. Có thể mở khoá bất cứ lúc nào.
          </Typography>
          <TextField
            label="Lý do (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            size="small"
            multiline
            minRows={2}
            placeholder="Vd: Vi phạm điều khoản..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuspendOpen(false)} disabled={pending}>Huỷ</Button>
          <Button variant="contained" color="error" onClick={handleSuspend} disabled={pending}>
            Xác nhận khoá
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
