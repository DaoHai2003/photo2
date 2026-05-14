/**
 * Refresh Google Drive OAuth access token bằng refresh_token.
 *
 * Tại sao cần: access_token Google sống ~1h. Code cũ chỉ lưu access_token vào DB
 * lúc login, sau đó hết hạn → mọi API call trả 401 → user thấy "không quét được".
 * Phải logout/login lại mới fix tạm. Module này refresh tự động.
 *
 * Yêu cầu env:
 *   GOOGLE_CLIENT_ID    — OAuth client ID (giống cái đã setup ở Supabase Dashboard)
 *   GOOGLE_CLIENT_SECRET — OAuth client secret
 *
 * Flow:
 *   1. Lấy refresh_token từ studios.google_refresh_token
 *   2. POST https://oauth2.googleapis.com/token với grant_type=refresh_token
 *   3. Nhận access_token mới (+ optionally new refresh_token)
 *   4. Save vào DB
 *   5. Return access_token mới
 */
import type { SupabaseClient } from '@supabase/supabase-js';

interface RefreshResult {
  accessToken: string | null;
  error?: string;
}

export async function refreshDriveToken(
  supabase: SupabaseClient,
  userId: string
): Promise<RefreshResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { accessToken: null, error: 'GOOGLE_CLIENT_ID/SECRET chưa cấu hình trên server' };
  }

  // Lấy refresh_token từ DB
  const { data: studio } = await supabase
    .from('studios')
    .select('google_refresh_token')
    .eq('id', userId)
    .single();
  const refreshToken = studio?.google_refresh_token;
  if (!refreshToken) {
    return { accessToken: null, error: 'Không có refresh_token. Đăng xuất + đăng nhập lại Google.' };
  }

  // Gọi Google token endpoint
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    return {
      accessToken: null,
      error: `Refresh token bị từ chối: ${data.error_description || data.error || 'unknown'}. Cần đăng nhập lại Google.`,
    };
  }

  // Save token mới vào DB. Google đôi khi cấp refresh_token mới — nếu có thì lưu.
  const updates: Record<string, string> = { google_drive_token: data.access_token };
  if (data.refresh_token) updates.google_refresh_token = data.refresh_token;
  await supabase.from('studios').update(updates).eq('id', userId);

  return { accessToken: data.access_token };
}
