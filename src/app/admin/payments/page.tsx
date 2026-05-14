/**
 * /admin/payments — queue payment requests cần admin duyệt thủ công.
 * Server component fetch list pending → pass xuống client table.
 */
import { Box, Typography, Alert } from '@mui/material';
import { createServerSupabase } from '@/lib/supabase/server';
import AdminPaymentsTable from '@/components/admin/admin-payments-table';

interface PendingPayment {
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

export default async function AdminPaymentsPage() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('list_pending_payments');

  return (
    <Box>
      <Box mb={3}>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.7rem', letterSpacing: 1.5, fontWeight: 600, textTransform: 'uppercase' }}>
          Admin
        </Typography>
        <Typography variant="h5" fontWeight={800}>
          Thanh toán chờ duyệt
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mt: 0.5 }}>
          User chuyển khoản với reference code → click "Duyệt" để activate Pro.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error.message}</Alert>}
      <AdminPaymentsTable rows={(data || []) as PendingPayment[]} />
    </Box>
  );
}
