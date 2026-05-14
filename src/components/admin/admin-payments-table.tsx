/**
 * Admin payments queue table — duyệt / từ chối từng request.
 * Hiện reference_code để admin so với nội dung CK Vietcombank thực tế.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card, Box, Stack, Typography, Table, TableHead, TableRow, TableCell,
  TableBody, Button, Chip, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Snackbar, Alert,
} from '@mui/material';
import { CheckCircle, Cancel, ContentCopy } from '@mui/icons-material';
import { adminApprovePaymentAction, adminRejectPaymentAction } from '@/actions/billing-actions';

interface Row {
  id: string;
  studio_id: string;
  studio_name: string | null;
  user_email: string | null;
  plan_code: string;
  billing_cycle: string;
  amount: number;
  reference_code: string;
  user_note: string | null;
  created_at: string;
}

export interface AdminPaymentsTableProps {
  rows: Row[];
}

export default function AdminPaymentsTable({ rows }: AdminPaymentsTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectDialog, setRejectDialog] = useState<{ id: string; note: string } | null>(null);
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  const handleApprove = (id: string) => {
    if (!confirm('Xác nhận đã nhận tiền và duyệt Pro?')) return;
    startTransition(async () => {
      const res = await adminApprovePaymentAction(id);
      if (res.error) setSnack({ msg: 'Lỗi: ' + res.error, severity: 'error' });
      else { setSnack({ msg: 'Đã duyệt — Pro activated', severity: 'success' }); router.refresh(); }
    });
  };

  const handleReject = () => {
    if (!rejectDialog) return;
    startTransition(async () => {
      const res = await adminRejectPaymentAction(rejectDialog.id, rejectDialog.note);
      if (res.error) setSnack({ msg: 'Lỗi: ' + res.error, severity: 'error' });
      else { setSnack({ msg: 'Đã từ chối', severity: 'success' }); setRejectDialog(null); router.refresh(); }
    });
  };

  return (
    <>
      <Card>
        {rows.length === 0 ? (
          <Box sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
            <Typography fontSize="0.95rem">✨ Không có yêu cầu nào chờ duyệt.</Typography>
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Studio</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Gói</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }} align="right">Số tiền</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Mã tham chiếu</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Ngày yêu cầu</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Typography fontSize="0.85rem" fontWeight={600}>{r.studio_name || '—'}</Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{r.user_email || '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={`${r.plan_code.toUpperCase()} · ${r.billing_cycle === 'yearly' ? '1 năm' : '1 tháng'}`}
                        size="small"
                        color="primary"
                        sx={{ fontSize: '0.7rem', height: 22 }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.9rem', color: 'primary.main' }}>
                      {new Intl.NumberFormat('vi-VN').format(r.amount)} đ
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600 }}>
                          {r.reference_code}
                        </Box>
                        <Tooltip title="Copy">
                          <IconButton size="small" onClick={() => navigator.clipboard.writeText(r.reference_code)}>
                            <ContentCopy sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                      {new Date(r.created_at).toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<CheckCircle fontSize="small" />}
                          onClick={() => handleApprove(r.id)}
                          disabled={pending}
                          sx={{ fontSize: '0.72rem', py: 0.4 }}
                        >
                          Duyệt
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<Cancel fontSize="small" />}
                          onClick={() => setRejectDialog({ id: r.id, note: '' })}
                          disabled={pending}
                          sx={{ fontSize: '0.72rem', py: 0.4 }}
                        >
                          Từ chối
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>

      {/* Reject dialog */}
      <Dialog open={!!rejectDialog} onClose={() => setRejectDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Từ chối yêu cầu thanh toán?</DialogTitle>
        <DialogContent>
          <TextField
            label="Lý do (sẽ gửi user)"
            value={rejectDialog?.note || ''}
            onChange={(e) => setRejectDialog((d) => d ? { ...d, note: e.target.value } : d)}
            fullWidth
            multiline
            minRows={2}
            placeholder="Vd: Không tìm thấy giao dịch khớp mã..."
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialog(null)}>Huỷ</Button>
          <Button variant="contained" color="error" onClick={handleReject} disabled={pending}>
            Xác nhận từ chối
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3500} onClose={() => setSnack(null)}>
        {snack ? <Alert severity={snack.severity}>{snack.msg}</Alert> : undefined}
      </Snackbar>
    </>
  );
}
