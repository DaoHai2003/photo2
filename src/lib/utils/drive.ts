// Google Drive image URL helpers
// These URLs work for publicly shared files

export function getDriveImageUrl(fileId: string, size?: number): string {
  // Direct thumbnail URL from Google Drive
  if (size) {
    return `https://lh3.googleusercontent.com/d/${fileId}=w${size}`;
  }
  // Full size
  return `https://lh3.googleusercontent.com/d/${fileId}=s0`;
}

export function getDriveThumbnailUrl(fileId: string): string {
  return getDriveImageUrl(fileId, 400);
}

/**
 * URL ảnh hiển thị trong album grid — kích thước trung bình ~2400px cạnh dài.
 * Vẫn nhỏ hơn full nhưng nét gấp ~6x thumbnail (=w400). Cho phép user iOS
 * long-press save được ảnh nét đủ để post mạng xã hội / in A4.
 * 75 ảnh/page × ~1-2MB ≈ 100-150MB → mobile chấp nhận được.
 */
export function getDriveDisplayUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}=s2400`;
}

export function getDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
