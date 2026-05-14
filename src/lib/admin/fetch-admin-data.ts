/**
 * Server-side helpers gọi RPC admin từ Supabase.
 * Dùng trong Server Components & Server Actions.
 *
 * Tất cả RPC đã GRANT cho `authenticated` role và là SECURITY DEFINER,
 * nhưng middleware đã check admin email từ trước → an toàn.
 */
import { createServerSupabase } from '@/lib/supabase/server';

export interface AdminDashboardStats {
  total_users: number;
  total_studios: number;
  active_30d: number;
  suspended_count: number;
  total_albums: number;
  total_photos: number;
  total_storage_bytes: number;
  new_signups_7d: number;
  signups_by_day: { date: string; count: number }[];
}

export async function fetchAdminDashboardStats(): Promise<AdminDashboardStats | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('get_admin_dashboard_stats');
  if (error) {
    console.error('[admin] fetchAdminDashboardStats:', error.message);
    return null;
  }
  return data as AdminDashboardStats;
}

export interface AdminStudioRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  logo_path: string | null;
  slug: string;
  plan_id: string | null;
  plan_name: string | null;
  total_storage_used_bytes: number;
  suspended_at: string | null;
  last_login_at: string | null;
  studio_created_at: string;
  user_email: string | null;
  user_created_at: string | null;
  user_last_sign_in_at: string | null;
  album_count: number;
  photo_count: number;
  total_count: number;
}

export interface ListStudiosParams {
  search?: string;
  filterStatus?: 'active' | 'suspended' | null;
  page?: number;
  pageSize?: number;
}

export async function fetchAdminStudiosList(
  params: ListStudiosParams = {}
): Promise<{ rows: AdminStudioRow[]; totalCount: number }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('get_admin_studios_list', {
    p_search: params.search ?? null,
    p_filter_status: params.filterStatus ?? null,
    p_page: params.page ?? 1,
    p_page_size: params.pageSize ?? 50,
  });

  if (error) {
    console.error('[admin] fetchAdminStudiosList:', error.message);
    return { rows: [], totalCount: 0 };
  }

  const rows = (data ?? []) as AdminStudioRow[];
  const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return { rows, totalCount };
}

export async function fetchAdminStudioDetail(studioId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('get_admin_studio_detail', {
    p_studio_id: studioId,
  });
  if (error) {
    console.error('[admin] fetchAdminStudioDetail:', error.message);
    return null;
  }
  return data as {
    studio: Record<string, unknown>;
    user: { email: string | null; created_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null };
    plan: Record<string, unknown> | null;
    album_count: number;
    photo_count: number;
    recent_albums: { id: string; title: string; slug: string; created_at: string; photo_count: number }[];
  };
}
