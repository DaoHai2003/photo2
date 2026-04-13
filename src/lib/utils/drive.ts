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
  return getDriveImageUrl(fileId, 250);
}

export function getDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
