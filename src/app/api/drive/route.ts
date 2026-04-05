import { NextRequest, NextResponse } from 'next/server';

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/gif', 'image/heic', 'image/heif', 'image/bmp'];
const FOLDER_MIME = 'application/vnd.google-apps.folder';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
}

async function listFiles(folderId: string, key: string): Promise<DriveFile[]> {
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
      throw new Error(data.error?.message || 'Google Drive API error');
    }

    const files: DriveFile[] = data.files || [];

    // Separate images and subfolders
    for (const file of files) {
      if (IMAGE_MIMES.includes(file.mimeType)) {
        allFiles.push(file);
      } else if (file.mimeType === FOLDER_MIME) {
        // Recursively scan subfolders
        const subFiles = await listFiles(file.id, key);
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
      return NextResponse.json({ error: 'folderId l\u00e0 b\u1eaft bu\u1ed9c' }, { status: 400 });
    }

    const key = apiKey || process.env.GOOGLE_DRIVE_API_KEY;
    if (!key) {
      return NextResponse.json({ error: 'Ch\u01b0a c\u1ea5u h\u00ecnh Google Drive API Key' }, { status: 500 });
    }

    const files = await listFiles(folderId, key);

    return NextResponse.json({
      files,
      count: files.length,
    });
  } catch (error: any) {
    const msg = error.message || 'L\u1ed7i kh\u00f4ng x\u00e1c \u0111\u1ecbnh';
    return NextResponse.json({
      error: msg.includes('notFound')
        ? 'Kh\u00f4ng t\u00ecm th\u1ea5y th\u01b0 m\u1ee5c. Ki\u1ec3m tra link v\u00e0 quy\u1ec1n chia s\u1ebb.'
        : msg,
    }, { status: 500 });
  }
}
