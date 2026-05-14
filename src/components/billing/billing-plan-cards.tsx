/**
 * 2 plan cards Free vs Pro + payment dialog.
 * Click Pro → mở dialog → user chọn cycle (monthly/yearly) → submit →
 * hiện reference code + STK chuyển khoản → user CK → đợi admin duyệt.
 */
'use client';

import { useState, useTransition } from 'react';
import {
  Box, Card, Typography, Button, Stack, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, ToggleButton, ToggleButtonGroup,
  Alert, TextField, Snackbar, IconButton,
} from '@mui/material';
import { CheckCircle, ContentCopy, Close } from '@mui/icons-material';
import { submitPaymentRequestAction } from '@/actions/billing-actions';

const FREE_FEATURES = [
  'Tạo tối đa 5 album',
  'Lưu trữ ảnh 30 ngày',
  'Tải ảnh thường (xem online)',
  'Bộ lọc cơ bản',
];
const PRO_FEATURES = [
  'Album không giới hạn',
  'Lưu trữ vĩnh viễn (đang sub)',
  'Download ZIP ảnh yêu thích',
  'Bộ lọc nâng cao',
  'Studio profile public page',
  'Ẩn footer "Map Boss Club"',
  'Hỗ trợ ưu tiên',
];

// Bank info — admin update sau qua env
const BANK_INFO = {
  bank: 'Vietcombank',
  account: '0123456789',
  holder: 'NGUYEN VAN A',
};

export interface BillingPlanCardsProps {
  currentPlanName: 'free' | 'pro';
  priceMonthly: number;
  priceYearly: number;
  priceMonthlyText: string;
  priceYearlyText: string;
}

export default function BillingPlanCards({
  currentPlanName, priceMonthly, priceYearly, priceMonthlyText, priceYearlyText,
}: BillingPlanCardsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [pending, startTransition] = useTransition();
  const [requestResult, setRequestResult] = useState<{ reference_code: string; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snackOpen, setSnackOpen] = useState(false);

  const handleSubmit = () => {
    startTransition(async () => {
      setError(null);
      const res = await submitPaymentRequestAction(cycle, null);
      if (res.error) setError(res.error);
      else if (res.request) setRequestResult(res.request);
    });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setSnackOpen(true);
  };

  const isPro = currentPlanName === 'pro';
  const amount = cycle === 'monthly' ? priceMonthly : priceYearly;

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} useFlexGap flexWrap="wrap">
        {/* FREE card */}
        <Card sx={{ flex: 1, minWidth: 260, p: 3, position: 'relative' }}>
          {currentPlanName === 'free' && (
            <Chip label="Đang dùng" size="small" sx={{ position: 'absolute', top: 12, right: 12 }} />
          )}
          <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>Miễn phí</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 2 }}>
            Dùng thử dịch vụ
          </Typography>
          <Typography variant="h4" fontWeight={800} sx={{ mb: 0.5 }}>
            0 đ <Typography component="span" sx={{ fontSize: '0.85rem', color: 'text.secondary', fontWeight: 500 }}>/ tháng</Typography>
          </Typography>
          <Stack spacing={1} mt={3}>
            {FREE_FEATURES.map((f, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center">
                <CheckCircle sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>{f}</Typography>
              </Stack>
            ))}
          </Stack>
        </Card>

        {/* PRO card */}
        <Card
          sx={{
            flex: 1, minWidth: 260, p: 3, position: 'relative',
            border: '1.5px solid', borderColor: 'primary.main',
            background: 'linear-gradient(180deg, rgba(201,169,110,0.08) 0%, transparent 80%)',
          }}
        >
          <Chip
            label="PHỔ BIẾN"
            size="small"
            color="primary"
            sx={{ position: 'absolute', top: 12, right: 12, fontWeight: 700, fontSize: '0.65rem', letterSpacing: 0.5 }}
          />
          <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5, color: 'primary.main' }}>Pro</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 2 }}>
            Toàn quyền — không giới hạn
          </Typography>
          <Typography variant="h4" fontWeight={800} sx={{ mb: 0.5 }}>
            {priceMonthlyText} <Typography component="span" sx={{ fontSize: '0.85rem', color: 'text.secondary', fontWeight: 500 }}>/ tháng</Typography>
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
            hoặc {priceYearlyText} / năm (tiết kiệm ~17%)
          </Typography>
          <Stack spacing={1} mt={3}>
            {PRO_FEATURES.map((f, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center">
                <CheckCircle sx={{ fontSize: 16, color: 'primary.main' }} />
                <Typography sx={{ fontSize: '0.85rem' }}>{f}</Typography>
              </Stack>
            ))}
          </Stack>
          <Button
            fullWidth
            variant="contained"
            sx={{ mt: 3, py: 1.2, fontWeight: 700 }}
            onClick={() => { setDialogOpen(true); setRequestResult(null); setError(null); }}
            disabled={isPro}
          >
            {isPro ? 'Đang dùng Pro' : 'Nâng cấp ngay'}
          </Button>
        </Card>
      </Stack>

      {/* Payment dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {requestResult ? 'Hướng dẫn chuyển khoản' : 'Nâng cấp Pro'}
          <IconButton size="small" onClick={() => setDialogOpen(false)}><Close fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {!requestResult ? (
            <>
              <Typography sx={{ mb: 2, fontSize: '0.85rem', color: 'text.secondary' }}>
                Chọn chu kỳ thanh toán:
              </Typography>
              <ToggleButtonGroup
                value={cycle}
                exclusive
                onChange={(_, v) => v && setCycle(v)}
                fullWidth
                sx={{ mb: 2 }}
              >
                <ToggleButton value="monthly">Tháng — {priceMonthlyText}</ToggleButton>
                <ToggleButton value="yearly">Năm — {priceYearlyText}</ToggleButton>
              </ToggleButtonGroup>
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                Sau khi bấm "Tạo yêu cầu", bạn sẽ nhận mã tham chiếu để chuyển khoản. Admin sẽ duyệt trong vòng vài giờ.
              </Typography>
              {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            </>
          ) : (
            <Stack spacing={2}>
              <Alert severity="success">Đã tạo yêu cầu thanh toán. Vui lòng chuyển khoản theo thông tin bên dưới.</Alert>
              <Box>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>Số tiền</Typography>
                <Typography fontWeight={700} fontSize="1.2rem" color="primary.main">
                  {new Intl.NumberFormat('vi-VN').format(requestResult.amount)} đ
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>Ngân hàng</Typography>
                <Typography fontWeight={600}>{BANK_INFO.bank}</Typography>
              </Box>
              <CopyableField label="Số tài khoản" value={BANK_INFO.account} onCopy={handleCopy} />
              <Box>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>Chủ tài khoản</Typography>
                <Typography fontWeight={600}>{BANK_INFO.holder}</Typography>
              </Box>
              <CopyableField
                label="Nội dung chuyển khoản (BẮT BUỘC ĐÚNG)"
                value={requestResult.reference_code}
                onCopy={handleCopy}
                highlight
              />
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                Sau khi CK, admin sẽ duyệt và Pro được kích hoạt 30 ngày (hoặc 1 năm). Bạn sẽ nhận thông báo qua email.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {!requestResult ? (
            <>
              <Button onClick={() => setDialogOpen(false)} disabled={pending}>Huỷ</Button>
              <Button variant="contained" onClick={handleSubmit} disabled={pending}>
                Tạo yêu cầu — {new Intl.NumberFormat('vi-VN').format(amount)} đ
              </Button>
            </>
          ) : (
            <Button variant="contained" onClick={() => setDialogOpen(false)}>Đã hiểu</Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar open={snackOpen} autoHideDuration={1800} onClose={() => setSnackOpen(false)} message="Đã copy" />
    </Box>
  );
}

function CopyableField({ label, value, onCopy, highlight }: {
  label: string; value: string; onCopy: (s: string) => void; highlight?: boolean;
}) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>{label}</Typography>
      <Stack direction="row" spacing={1}>
        <TextField
          value={value}
          size="small"
          fullWidth
          InputProps={{
            readOnly: true,
            sx: highlight ? { fontWeight: 700, color: 'primary.main', fontSize: '0.95rem' } : undefined,
          }}
        />
        <IconButton onClick={() => onCopy(value)} size="small">
          <ContentCopy fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}
