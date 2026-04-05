import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get Google token: first try session, then fallback to saved token in DB
    const { data: { session } } = await supabase.auth.getSession();
    let providerToken = session?.provider_token;

    if (!providerToken) {
      // Fallback: get saved token from studios table
      const { data: studio } = await supabase
        .from('studios')
        .select('google_drive_token')
        .eq('id', user.id)
        .single();
      providerToken = studio?.google_drive_token || null;
    }

    if (!providerToken) {
      return NextResponse.json({
        error: 'no_token',
        message: 'No Google Drive token. Please re-login with Google.',
      }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folderId = formData.get('folderId') as string;
    const albumTitle = formData.get('albumTitle') as string;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // If no folderId, create a folder for this album
    let targetFolderId = folderId;
    if (!targetFolderId) {
      // First, find or create "San San" root folder
      const rootFolder = await findOrCreateFolder(providerToken, 'San San', 'root');
      // Then create album subfolder
      targetFolderId = await findOrCreateFolder(providerToken, albumTitle || 'Album', rootFolder);
    }

    // Upload file to Google Drive
    const fileBuffer = await file.arrayBuffer();
    const metadata = {
      name: file.name,
      parents: [targetFolderId],
    };

    const boundary = '-------sansan-boundary';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${file.type}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      Buffer.from(fileBuffer).toString('base64') +
      closeDelimiter;

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink,webContentLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${providerToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!uploadRes.ok) {
      const errData = await uploadRes.json().catch(() => ({}));
      return NextResponse.json({
        error: errData.error?.message || 'Upload to Drive failed',
      }, { status: uploadRes.status });
    }

    const driveFile = await uploadRes.json();

    // Make file publicly viewable
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFile.id}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${providerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }
    );

    return NextResponse.json({
      success: true,
      driveFileId: driveFile.id,
      driveFileName: driveFile.name,
      driveLink: driveFile.webViewLink,
      driveThumbnail: driveFile.thumbnailLink || null,
      driveContentLink: driveFile.webContentLink || null,
      folderId: targetFolderId,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message || 'Unknown error',
    }, { status: 500 });
  }
}

async function findOrCreateFolder(
  token: string,
  name: string,
  parentId: string
): Promise<string> {
  // Search for existing folder
  const searchQ = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQ)}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const searchData = await searchRes.json();

  if (searchData.files?.length > 0) {
    return searchData.files[0].id;
  }

  // Create new folder
  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    }
  );
  const folder = await createRes.json();
  return folder.id;
}
