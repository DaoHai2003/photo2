import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPhotos, deletePhoto } from '@/actions/photos';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export function usePhotos(albumId: string) {
  return useQuery({
    queryKey: ['photos', albumId],
    queryFn: async () => {
      const result = await getPhotos(albumId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!albumId,
  });
}

export function useDeletePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePhoto,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos'] });
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });
}

export function useUploadPhotos(albumId: string) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const uploadPhoto = async (
    file: File,
    onProgress?: (progress: number) => void
  ) => {
    if (!user) throw new Error('Chưa đăng nhập');

    const supabase = createClient();
    const photoId = crypto.randomUUID();
    const storagePath = `${user.id}/${albumId}/${photoId}_${file.name}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('album-photos')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw new Error(`Upload lỗi: ${uploadError.message}`);
    onProgress?.(80);

    // Get image dimensions
    let width: number | undefined;
    let height: number | undefined;
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      await new Promise<void>((resolve) => {
        img.onload = () => {
          width = img.naturalWidth;
          height = img.naturalHeight;
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        img.src = url;
      });
    } catch {}

    // Register in database
    const { registerPhoto } = await import('@/actions/photos');
    const result = await registerPhoto(albumId, {
      originalFilename: file.name,
      storagePath,
      width,
      height,
      fileSize: file.size,
      mimeType: file.type,
    });

    onProgress?.(100);

    if (result.error) throw new Error(result.error);
    return result.data;
  };

  const uploadMultiple = async (
    files: File[],
    onFileProgress?: (index: number, progress: number) => void,
    onFileComplete?: (index: number, success: boolean) => void
  ) => {
    const results = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const data = await uploadPhoto(files[i], (p) => onFileProgress?.(i, p));
        results.push({ index: i, success: true, data });
        onFileComplete?.(i, true);
      } catch (err: any) {
        results.push({ index: i, success: false, error: err.message });
        onFileComplete?.(i, false);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['photos', albumId] });
    queryClient.invalidateQueries({ queryKey: ['albums'] });
    queryClient.invalidateQueries({ queryKey: ['studioStats'] });
    return results;
  };

  return { uploadPhoto, uploadMultiple };
}
