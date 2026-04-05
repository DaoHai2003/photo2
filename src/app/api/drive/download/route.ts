import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    const apiKey = searchParams.get('apiKey') || process.env.GOOGLE_DRIVE_API_KEY;

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId là bắt buộc' },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chưa cấu hình Google Drive API Key' },
        { status: 500 }
      );
    }

    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Không thể tải file: ${errorText}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Lỗi không xác định' },
      { status: 500 }
    );
  }
}
