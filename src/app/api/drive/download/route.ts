/**
 * /api/drive/download — proxy tải file từ Google Drive về client.
 *
 * Strategy:
 *   1. Tìm photo theo drive_file_id → lấy studio_id (owner upload file này)
 *   2. Dùng OAuth token của owner (lưu trong studios.google_drive_token)
 *      + refresh khi 401 → có thể tải file private (chỉ owner thấy)
 *   3. Fallback API key nếu file public (Anyone with link)
 *   4. Trả binary với Content-Disposition: attachment để force download
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { refreshDriveToken } from '@/lib/google/refresh-drive-token';

/**
 * Service-role Supabase client — bypass RLS để query photos+studios.
 * Bắt buộc cho route public-download này vì visitor anonymous không có quyền
 * đọc photos/studios qua RLS.
 */
function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function fetchDriveFile(fileId: string, token: string): Promise<Response> {
  return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    if (!fileId) {
      return NextResponse.json({ error: 'fileId là bắt buộc' }, { status: 400 });
    }

    const supabase = createServiceSupabase();
    const debug: string[] = [];

    // ===== Step 1: Tìm owner studio_id qua drive_file_id =====
    let studioId: string | null = null;
    const { data: photoRow, error: photoErr } = await supabase
      .from('photos')
      .select('id, album_id, albums!inner(studio_id)')
      .eq('drive_file_id', fileId)
      .maybeSingle();
    if (photoErr) debug.push(`photo-query: ${photoErr.message}`);
    if (!photoRow) debug.push(`no photo row for fileId=${fileId.slice(0, 12)}...`);
    if (photoRow) {
      const a = (photoRow as any).albums;
      studioId = Array.isArray(a) ? a[0]?.studio_id : a?.studio_id;
      if (!studioId) debug.push('photo found but no studio_id');
    }

    let response: Response | null = null;
    let lastError: string | null = null;

    // ===== Step 2: OAuth của owner (private files) =====
    if (studioId) {
      const { data: studio, error: studioErr } = await supabase
        .from('studios')
        .select('google_drive_token, google_refresh_token')
        .eq('id', studioId)
        .single();
      if (studioErr) debug.push(`studio-query: ${studioErr.message}`);
      let token = studio?.google_drive_token || null;
      if (!token) debug.push('studio has no google_drive_token');
      if (!studio?.google_refresh_token) debug.push('studio has no refresh_token');

      if (token) {
        let res = await fetchDriveFile(fileId, token);
        debug.push(`oauth-initial: ${res.status}`);
        // 401 → refresh + retry
        if (res.status === 401) {
          const r = await refreshDriveToken(supabase, studioId);
          if (r.accessToken) {
            debug.push('oauth-refreshed');
            res = await fetchDriveFile(fileId, r.accessToken);
            debug.push(`oauth-retry: ${res.status}`);
          } else {
            debug.push(`refresh-fail: ${r.error}`);
            lastError = r.error || 'Refresh token failed';
          }
        }
        if (res.ok) response = res;
        else lastError = lastError || `OAuth ${res.status}`;
      }
    }

    // ===== Step 3: Fallback API key (chỉ file public) =====
    if (!response) {
      const apiKey = searchParams.get('apiKey') || process.env.GOOGLE_DRIVE_API_KEY;
      if (!apiKey) debug.push('no GOOGLE_DRIVE_API_KEY env');
      if (apiKey) {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
        const res = await fetch(url);
        debug.push(`apikey: ${res.status}`);
        if (res.ok) response = res;
        else lastError = lastError || `API key ${res.status}`;
      }
    }

    if (!response) {
      return NextResponse.json(
        {
          error: `Không tải được. ${lastError || 'không strategy nào work'}`,
          debug: debug.join(' | '),
        },
        { status: 403 }
      );
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();

    const filename = searchParams.get('filename');
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    };
    if (filename) {
      const safeFilename = encodeURIComponent(filename);
      headers['Content-Disposition'] = `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`;
    }

    return new NextResponse(arrayBuffer, { status: 200, headers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi không xác định' }, { status: 500 });
  }
}
