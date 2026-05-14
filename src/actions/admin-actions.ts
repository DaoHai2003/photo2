'use server';

/**
 * Admin server actions: suspend / unsuspend studio + reset password.
 * Tất cả check admin email DOUBLE-LAYER:
 *   - Middleware đã chặn route /admin (404 non-admin)
 *   - Action tự re-check để defend in-depth (nếu action invoked trực tiếp)
 */
import { createServerSupabase } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin/check-admin-email';
import { revalidatePath } from 'next/cache';

async function assertAdmin() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    throw new Error('FORBIDDEN');
  }
  return { supabase, user };
}

export async function suspendStudioAction(studioId: string, reason: string | null) {
  try {
    const { supabase } = await assertAdmin();
    const { error } = await supabase.rpc('admin_suspend_studio', {
      p_studio_id: studioId,
      p_reason: reason,
    });
    if (error) return { error: error.message };
    revalidatePath('/admin/studios');
    revalidatePath(`/admin/studios/${studioId}`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function unsuspendStudioAction(studioId: string) {
  try {
    const { supabase } = await assertAdmin();
    const { error } = await supabase.rpc('admin_unsuspend_studio', {
      p_studio_id: studioId,
    });
    if (error) return { error: error.message };
    revalidatePath('/admin/studios');
    revalidatePath(`/admin/studios/${studioId}`);
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Recompute dung lượng dùng của studio từ SUM(photos.file_size).
 * Fix drift counter, không gọi Drive API → nhanh, không tốn quota.
 */
export async function recomputeStudioStorageAction(studioId: string) {
  try {
    const { supabase } = await assertAdmin();
    const { data, error } = await supabase.rpc('recompute_studio_storage', {
      p_studio_id: studioId,
    });
    if (error) return { error: error.message };
    revalidatePath(`/admin/studios/${studioId}`);
    revalidatePath('/admin/studios');
    return { success: true, result: data };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Tạo password reset link cho user (admin support tool).
 * Cần SUPABASE_SERVICE_ROLE_KEY trong env (chỉ server-side).
 * Trả link để admin copy gửi user qua kênh khác (Zalo, etc).
 */
export async function generatePasswordResetLinkAction(userEmail: string) {
  try {
    await assertAdmin();
    const { createClient } = await import('@supabase/supabase-js');
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await adminSupabase.auth.admin.generateLink({
      type: 'recovery',
      email: userEmail,
    });
    if (error) return { error: error.message };
    return { link: data.properties?.action_link || null };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
