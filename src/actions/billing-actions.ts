'use server';

/**
 * Billing actions — user submit payment intent + admin approve queue.
 * Workflow:
 *   1. User click "Nâng cấp Pro" → submitPaymentRequestAction tạo row
 *      payment_requests (status=pending) + reference_code unique.
 *   2. User chuyển khoản với ND = reference_code.
 *   3. Admin vô /admin/payments → click "Duyệt" → activate Pro 30d hoặc 1 năm.
 */
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin/check-admin-email';
import { revalidatePath } from 'next/cache';

const PRICES = {
  monthly: 49000,
  yearly: 490000,
} as const;

type Cycle = keyof typeof PRICES;

export async function submitPaymentRequestAction(
  cycle: Cycle,
  userNote: string | null
) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return { error: 'Bạn cần đăng nhập' };

    // Reference code = PRO-{shortStudioId}-{YYMMDDHHMM} — unique, dễ nhập CK
    const shortId = user.id.slice(0, 6).toUpperCase();
    const ts = new Date().toISOString().slice(2, 16).replace(/[-:T]/g, '');
    const referenceCode = `PRO-${shortId}-${ts}`;

    const { data, error } = await supabase
      .from('payment_requests')
      .insert({
        studio_id: user.id,
        plan_code: 'pro',
        billing_cycle: cycle,
        amount: PRICES[cycle],
        reference_code: referenceCode,
        user_note: userNote || null,
      })
      .select('id, reference_code, amount')
      .single();

    if (error) return { error: error.message };
    revalidatePath('/dashboard/billing');
    return { success: true, request: data };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function adminApprovePaymentAction(requestId: string) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) return { error: 'FORBIDDEN' };

    const { data, error } = await supabase.rpc('admin_approve_payment', {
      p_request_id: requestId,
      p_admin_email: user.email,
    });
    if (error) return { error: error.message };
    revalidatePath('/admin/payments');
    return { success: true, result: data };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function adminRejectPaymentAction(requestId: string, note: string) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) return { error: 'FORBIDDEN' };

    const { error } = await supabase
      .from('payment_requests')
      .update({
        status: 'rejected',
        admin_note: note,
        approved_by_email: user.email,
        approved_at: new Date().toISOString(),
      })
      .eq('id', requestId);
    if (error) return { error: error.message };
    revalidatePath('/admin/payments');
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Admin: kích hoạt Pro 30d/1y cho 1 studio bất kỳ (test / sale offline) */
export async function adminSetStudioProAction(studioId: string, cycle: 'monthly' | 'yearly') {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) return { error: 'FORBIDDEN' };
    const { data, error } = await supabase.rpc('admin_set_studio_pro', {
      p_studio_id: studioId, p_cycle: cycle, p_admin_email: user.email,
    });
    if (error) return { error: error.message };
    revalidatePath(`/admin/studios/${studioId}`);
    return { success: true, result: data };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Admin: huỷ Pro của 1 studio → fall back về Free ngay */
export async function adminCancelStudioProAction(studioId: string) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) return { error: 'FORBIDDEN' };
    const { data, error } = await supabase.rpc('admin_cancel_studio_pro', {
      p_studio_id: studioId, p_admin_email: user.email,
    });
    if (error) return { error: error.message };
    revalidatePath(`/admin/studios/${studioId}`);
    return { success: true, result: data };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Admin manual trigger — chạy expire job (tới khi setup pg_cron). */
export async function adminTriggerExpireAlbumsAction() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) return { error: 'FORBIDDEN' };

    const { data, error } = await supabase.rpc('expire_old_albums');
    if (error) return { error: error.message };
    return { success: true, result: data };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
