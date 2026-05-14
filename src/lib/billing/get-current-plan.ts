/**
 * Server helper — fetch current plan của studio đang login.
 * Cache short-lived qua React cache() để 1 request không gọi RPC nhiều lần.
 */
import { cache } from 'react';
import { createServerSupabase } from '@/lib/supabase/server';

export interface CurrentPlan {
  plan_name: 'free' | 'pro';
  display_name: string;
  max_albums: number;
  max_storage_mb: number;
  has_zip_download: boolean;
  has_custom_branding: boolean;
  has_website_builder: boolean;
  is_trial: boolean;
  expires_at: string | null;
}

export const getCurrentPlan = cache(async (): Promise<CurrentPlan | null> => {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return null;
  const { data, error } = await supabase.rpc('get_studio_plan', { p_studio_id: user.id });
  if (error) {
    console.error('[billing] get_studio_plan:', error.message);
    return null;
  }
  return data as CurrentPlan;
});

/** Format VND như "49.000 đ" */
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
}
