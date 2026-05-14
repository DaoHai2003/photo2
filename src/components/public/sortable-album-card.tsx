/**
 * Sortable Album Card — wrapper dùng @dnd-kit/sortable cho phép kéo thả album.
 * Khi drag mode tắt → render thường, không có drag handle.
 * Khi drag mode bật → hiện drag handle ở góc, cursor grab, transition smooth.
 */
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box, Card, CardActionArea, CardContent, Typography } from '@mui/material';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { useRouter } from 'next/navigation';

export interface AlbumCardData {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  description: string | null;
  created_at: string;
}

interface Props {
  album: AlbumCardData;
  draggable: boolean;
  isDark: boolean;
  cardBg: string;
  textColor: string;
  subtextColor: string;
  idx: number;
}

export default function SortableAlbumCard({
  album, draggable, isDark, cardBg, textColor, subtextColor, idx,
}: Props) {
  const router = useRouter();
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: album.id, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <Box ref={setNodeRef} style={style} sx={{ position: 'relative' }}>
      <Card
        sx={{
          backgroundColor: cardBg,
          borderRadius: 3,
          overflow: 'hidden',
          animation: !draggable ? `scaleIn 0.6s ease-out ${0.1 + idx * 0.08}s backwards` : 'none',
          transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1), box-shadow 0.4s ease',
          cursor: draggable ? 'grab' : 'auto',
          '&:active': draggable ? { cursor: 'grabbing' } : {},
          '&:hover': !draggable ? {
            transform: 'translateY(-6px)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.15)',
          } : {},
          '&:hover .album-cover-img': !draggable ? { transform: 'scale(1.06)' } : {},
          '&:hover .album-cover-overlay': !draggable ? { opacity: 1 } : {},
          border: draggable ? '2px dashed rgba(201,169,110,0.5)' : 'none',
        }}
        {...(draggable ? { ...attributes, ...listeners } : {})}
      >
        {/* Drag handle indicator — chỉ hiện khi draggable */}
        {draggable && (
          <Box sx={{
            position: 'absolute', top: 8, left: 8, zIndex: 2,
            bgcolor: 'rgba(0,0,0,0.6)', borderRadius: 1, p: 0.5,
            display: 'flex', alignItems: 'center',
          }}>
            <DragIndicatorIcon sx={{ color: '#fff', fontSize: 18 }} />
          </Box>
        )}

        <CardActionArea
          onClick={() => !draggable && router.push(`/album/${album.slug}`)}
          disabled={draggable}
          sx={{ pointerEvents: draggable ? 'none' : 'auto' }}
        >
          <Box sx={{
            position: 'relative',
            paddingTop: '66%',
            backgroundColor: isDark ? '#2D2D44' : '#F3F4F6',
            overflow: 'hidden',
          }}>
            {album.cover_url && (
              <Box
                className="album-cover-img"
                sx={{
                  position: 'absolute', inset: 0,
                  backgroundImage: `url(${album.cover_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  transition: 'transform 0.6s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
            )}
            <Box
              className="album-cover-overlay"
              sx={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.35) 100%)',
                opacity: 0,
                transition: 'opacity 0.4s ease',
              }}
            />
            {!album.cover_url && (
              <Box sx={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDark
                  ? 'linear-gradient(90deg, #1A1A2E 0%, #2D2D44 50%, #1A1A2E 100%)'
                  : 'linear-gradient(90deg, #F3F4F6 0%, #E5E7EB 50%, #F3F4F6 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2.5s ease-in-out infinite',
              }}>
                <PhotoLibraryIcon sx={{ fontSize: 48, color: isDark ? '#4B4B6B' : '#D1D5DB' }} />
              </Box>
            )}
          </Box>
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: textColor, mb: 0.5 }}>
              {album.title}
            </Typography>
            {album.description && (
              <Typography variant="body2" sx={{
                color: subtextColor,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {album.description}
              </Typography>
            )}
          </CardContent>
        </CardActionArea>
      </Card>
    </Box>
  );
}
