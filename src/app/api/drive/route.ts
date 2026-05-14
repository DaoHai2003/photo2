/**
 * /api/drive — quét folder Google Drive lấy danh sách ảnh.
 *
 * Strategy ưu tiên:
 *   1. OAuth access_token từ session.provider_token (lúc vừa login Google)
 *   2. OAuth access_token saved trong studios.google_drive_token
 *   3. Nếu (1)/(2) trả 401 → refresh token bằng refresh_token + retry
 *   4. Fallback API key (chỉ folder public)
 *
 * Error surfacing: thay vì silent catch, trả error message rõ ràng cho UI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { refreshDriveToken } from '@/lib/google/refresh-drive-token';

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/gif', 'image/heic', 'image/heif', 'image/bmp'];
const FOLDER_MIME = 'application/vnd.google-apps.folder';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  folderName?: string | null;
  folderId?: string | null;
}

// Helper: gọi Drive API list. Trả raw response để caller check status code.
async function listOnce(folderId: string, token: string, pageToken?: string): Promise<Response> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'nextPageToken,files(id,name,mimeType,size,thumbnailLink)',
    pageSize: '1000',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  if (pageToken) params.set('pageToken', pageToken);
  return fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Recursive list bằng OAuth — throw nếu fail (caller decide refresh hay không)
async function listFilesWithToken(
  folderId: string, token: string,
  parentFolderName?: string | null, parentFolderId?: string | null
): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];
  let pageToken = '';
  do {
    const res = await listOnce(folderId, token, pageToken || undefined);
    const data = await res.json();
    if (!res.ok) {
      // Throw object có status để caller phân biệt 401 vs khác
      const err = new Error(data.error?.message || `Drive API error ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    for (const file of (data.files || []) as DriveFile[]) {
      if (IMAGE_MIMES.includes(file.mimeType)) {
        allFiles.push({ ...file, folderName: parentFolderName || null, folderId: parentFolderId || null });
      } else if (file.mimeType === FOLDER_MIME) {
        const subFiles = await listFilesWithToken(file.id, token, file.name, file.id);
        allFiles.push(...subFiles);
      }
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return allFiles;
}

// API key fallback — chỉ folder public (Anyone with link)
async function listFilesWithKey(
  folderId: string, key: string,
  parentFolderName?: string | null, parentFolderId?: string | null
): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      key,
      fields: 'nextPageToken,files(id,name,mimeType,size,thumbnailLink)',
      pageSize: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error?.message || `Drive API key error ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    for (const file of (data.files || []) as DriveFile[]) {
      if (IMAGE_MIMES.includes(file.mimeType)) {
        allFiles.push({ ...file, folderName: parentFolderName || null, folderId: parentFolderId || null });
      } else if (file.mimeType === FOLDER_MIME) {
        const subFiles = await listFilesWithKey(file.id, key, file.name, file.id);
        allFiles.push(...subFiles);
      }
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return allFiles;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { folderId, apiKey } = body;
    if (!folderId || typeof folderId !== 'string') {
      return NextResponse.json({ error: 'folderId là bắt buộc' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    let files: DriveFile[] = [];
    let lastError: string | null = null;

    // ===== Strategy 1+2+3: OAuth với refresh =====
    if (user) {
      const { data: { session } } = await supabase.auth.getSession();
      let token = session?.provider_token || null;

      if (!token) {
        const { data: studio } = await supabase
          .from('studios').select('google_drive_token').eq('id', user.id).single();
        token = studio?.google_drive_token || null;
      }

      // Hàm helper: thử list với token, nếu 401 → refresh + retry 1 lần
      const tryListWithRefresh = async (initialToken: string | null): Promise<DriveFile[] | null> => {
        if (!initialToken) return null;
        try {
          return await listFilesWithToken(folderId, initialToken);
        } catch (e: any) {
          if (e?.status !== 401) {
            lastError = e.message;
            return null;
          }
          // 401 → refresh
          const refreshed = await refreshDriveToken(supabase, user.id);
          if (!refreshed.accessToken) {
            lastError = refreshed.error || 'Token hết hạn, refresh thất bại';
            return null;
          }
          try {
            return await listFilesWithToken(folderId, refreshed.accessToken);
          } catch (e2: any) {
            lastError = e2.message;
            return null;
          }
        }
      };

      const oauthResult = await tryListWithRefresh(token);
      if (oauthResult) files = oauthResult;
    }

    // ===== Strategy 4: API key fallback =====
    if (files.length === 0) {
      const key = apiKey || process.env.GOOGLE_DRIVE_API_KEY;
      if (key) {
        try {
          files = await listFilesWithKey(folderId, key);
        } catch (e: any) {
          lastError = lastError || e.message;
        }
      }
    }

    if (files.length === 0) {
      // Trả error rõ ràng — không nuốt im lặng nữa
      return NextResponse.json({
        files: [], count: 0,
        error: lastError
          ? `Không quét được folder: ${lastError}. Thử đăng xuất → đăng nhập lại Google.`
          : 'Không tìm thấy ảnh. Kiểm tra link và quyền chia sẻ.',
      });
    }

    return NextResponse.json({ files, count: files.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi không xác định' }, { status: 500 });
  }
}
