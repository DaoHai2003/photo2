/**
 * /dashboard/billing — pricing page Free vs Pro.
 * Server fetch current plan + render 2 columns. Submit payment → mở dialog
 * hiện reference code + hướng dẫn chuyển khoản.
 */
import { Box, Typography } from '@mui/material';
import { getCurrentPlan, formatVND } from '@/lib/billing/get-current-plan';
import BillingPlanCards from '@/components/billing/billing-plan-cards';

export default async function BillingPage() {
  const current = await getCurrentPlan();

  return (
    <Box>
      <Box mb={3}>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.7rem', letterSpacing: 1.5, fontWeight: 600, textTransform: 'uppercase' }}>
          Dashboard
        </Typography>
        <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: '-0.02em' }}>
          Gói cước
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mt: 0.5 }}>
          Bạn đang dùng <b>{current?.display_name || 'Miễn phí'}</b>
          {current?.is_trial && ' (đang trial)'}
          {current?.expires_at && ` — hết hạn ${new Date(current.expires_at).toLocaleDateString('vi-VN')}`}
        </Typography>
      </Box>

      <BillingPlanCards
        currentPlanName={current?.plan_name || 'free'}
        priceMonthly={49000}
        priceYearly={490000}
        priceMonthlyText={formatVND(49000)}
        priceYearlyText={formatVND(490000)}
      />
    </Box>
  );
}
