import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAlbums, getAlbumById, createAlbum, deleteAlbum, getStudioStats } from '@/actions/albums';

export function useAlbums() {
  return useQuery({
    queryKey: ['albums'],
    queryFn: async () => {
      const result = await getAlbums();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useAlbum(albumId: string) {
  return useQuery({
    queryKey: ['album', albumId],
    queryFn: async () => {
      const result = await getAlbumById(albumId);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!albumId,
  });
}

export function useCreateAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAlbum,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      queryClient.invalidateQueries({ queryKey: ['studioStats'] });
    },
  });
}

export function useDeleteAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAlbum,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] });
      queryClient.invalidateQueries({ queryKey: ['studioStats'] });
    },
  });
}

export function useStudioStats() {
  return useQuery({
    queryKey: ['studioStats'],
    queryFn: getStudioStats,
  });
}
