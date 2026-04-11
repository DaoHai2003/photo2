import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/gif', 'image/heic', 'image/heif', 'image/bmp'];
const FOLDER_MIME = 'application/vnd.google-apps.folder';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
}

// List files using OAuth token (can read "Shared with me")
async function listFilesWithToken(folderId: string, token: string): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,size,thumbnailLink)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || 'Google Drive API error (OAuth)');
    }

    for (const file of (data.files || []) as DriveFile[]) {
      if (IMAGE_MIMES.includes(file.mimeType)) {
        allFiles.push(file);
      } else if (file.mimeType === FOLDER_MIME) {
        const subFiles = await listFilesWithToken(file.id, token);
        allFiles.push(...subFiles);
      }
    }

    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return allFiles;
}

// List files using API key (only public folders owned by user)
async function listFilesWithKey(folderId: string, key: string): Promise<DriveFile[]> {
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
      throw new Error(data.error?.message || 'Google Drive API error (API Key)');
    }

    for (const file of (data.files || []) as DriveFile[]) {
      if (IMAGE_MIMES.includes(file.mimeType)) {
        allFiles.push(file);
      } else if (file.mimeType === FOLDER_MIME) {
        const subFiles = await listFilesWithKey(file.id, key);
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
      return NextResponse.json({ error: 'folderId is required' }, { status: 400 });
    }

    // Strategy 1: Try OAuth token first (can read "Shared with me")
    let files: DriveFile[] = [];
    let usedMethod = '';

    try {
      const supabase = await createServerSupabase();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Try session token first
        const { data: { session } } = await supabase.auth.getSession();
        let oauthToken = session?.provider_token;

        // Fallback to saved token in DB
        if (!oauthToken) {
          const { data: studio } = await supabase
            .from('studios')
            .select('google_drive_token')
            .eq('id', user.id)
            .single();
          oauthToken = studio?.google_drive_token || null;
        }

        if (oauthToken) {
          files = await listFilesWithToken(folderId, oauthToken);
          usedMethod = 'oauth';
        }
      }
    } catch {
      // OAuth failed, will fallback to API key
    }

    // Strategy 2: Fallback to API key (only public folders)
    if (files.length === 0 && !usedMethod) {
      const key = apiKey || process.env.GOOGLE_DRIVE_API_KEY;
      if (key) {
        try {
          files = await listFilesWithKey(folderId, key);
          usedMethod = 'apikey';
        } catch {
          // API key also failed
        }
      }
    }

    // Strategy 3: If OAuth returned 0 results, also try API key
    if (files.length === 0 && usedMethod === 'oauth') {
      const key = apiKey || process.env.GOOGLE_DRIVE_API_KEY;
      if (key) {
        try {
          files = await listFilesWithKey(folderId, key);
        } catch {
          // ignore
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json({
        files: [],
        count: 0,
        error: 'Kh\u00f4ng t\u00ecm th\u1ea5y \u1ea3nh. Ki\u1ec3m tra link v\u00e0 quy\u1ec1n chia s\u1ebb.',
      });
    }

    return NextResponse.json({
      files,
      count: files.length,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message || 'L\u1ed7i kh\u00f4ng x\u00e1c \u0111\u1ecbnh',
    }, { status: 500 });
  }
}
