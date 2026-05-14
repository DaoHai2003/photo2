'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Stack,
  Container,
} from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import FacebookIcon from '@mui/icons-material/Facebook';
import InstagramIcon from '@mui/icons-material/Instagram';
import YouTubeIcon from '@mui/icons-material/YouTube';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDriveImageUrl } from '@/lib/utils/drive';
import { Card, CardContent, CardActionArea } from '@mui/material';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';

interface AlbumCardData {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  description: string | null;
  created_at: string;
}

// ----- Types -----

interface WebsiteProfile {
  id: string;
  studio_id: string;
  slug: string;
  hero_title: string;
  hero_subtitle: string;
  about_text: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  // DB column names khớp schema
  social_facebook: string;
  social_instagram: string;
  social_tiktok: string;
  social_youtube: string;
  theme: string;
  cover_image_path: string | null;
  is_published: boolean;
}

export default function StudioPortfolioPage() {
  const params = useParams();
  const router = useRouter();
  const studioSlug = params.studioSlug as string;
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<WebsiteProfile | null>(null);
  const [albums, setAlbums] = useState<AlbumCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Fetch website profile by slug
      const { data: wp, error } = await supabase
        .from('website_profiles')
        .select('*')
        .eq('slug', studioSlug)
        .eq('is_published', true)
        .single();

      if (error || !wp) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfile(wp);

      // Fetch visible albums — filter theo website_id (đúng FK), is_visible
      const { data: waData } = await supabase
        .from('website_albums')
        .select('album_id, sort_order')
        .eq('website_id', wp.id)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true });

      if (waData && waData.length > 0) {
        const albumIds = waData.map((wa: any) => wa.album_id);
        const { data: albumsData } = await supabase
          .from('albums')
          .select('id, title, slug, description, cover_photo_id, created_at')
          .in('id', albumIds)
          .eq('is_published', true)
          .is('deleted_at', null);

        if (albumsData && albumsData.length > 0) {
          // Lấy cover photo: ưu tiên cover_photo_id, fallback ảnh đầu tiên
          // theo sort_order. 1 query batch cho tất cả albums → O(1) round-trip.
          const coverPhotoIds = (albumsData as any[])
            .map((a) => a.cover_photo_id).filter(Boolean) as string[];

          // Map albumId → cover photo data
          const coverByAlbum = new Map<string, { storage_path: string | null; drive_file_id: string | null }>();

          // (a) Photos được set làm cover cụ thể
          if (coverPhotoIds.length > 0) {
            const { data: coverPhotos } = await supabase
              .from('photos')
              .select('id, album_id, storage_path, drive_file_id')
              .in('id', coverPhotoIds);
            for (const p of (coverPhotos ?? []) as any[]) {
              coverByAlbum.set(p.album_id, { storage_path: p.storage_path, drive_file_id: p.drive_file_id });
            }
          }

          // (b) Cho albums chưa có cover, lấy 1 ảnh đầu tiên
          const albumsWithoutCover = (albumsData as any[])
            .filter((a) => !coverByAlbum.has(a.id))
            .map((a) => a.id);
          if (albumsWithoutCover.length > 0) {
            const { data: firstPhotos } = await supabase
              .from('photos')
              .select('album_id, storage_path, drive_file_id, sort_order')
              .in('album_id', albumsWithoutCover)
              .eq('photo_type', 'original')
              .order('sort_order', { ascending: true });
            // Take first per album_id
            for (const p of (firstPhotos ?? []) as any[]) {
              if (!coverByAlbum.has(p.album_id)) {
                coverByAlbum.set(p.album_id, { storage_path: p.storage_path, drive_file_id: p.drive_file_id });
              }
            }
          }

          // (c) Sign URLs cho photos lưu Supabase Storage (batch)
          const storagePaths: string[] = [];
          for (const cover of coverByAlbum.values()) {
            if (!cover.drive_file_id && cover.storage_path) storagePaths.push(cover.storage_path);
          }
          const signedMap = new Map<string, string>();
          if (storagePaths.length > 0) {
            const { data: signed } = await supabase.storage
              .from('album-photos').createSignedUrls(storagePaths, 3600);
            for (const s of (signed ?? [])) {
              if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl);
            }
          }

          // Build cover_url cho từng album
          const orderMap = new Map(waData.map((wa: any) => [wa.album_id, wa.sort_order]));
          const sorted = (albumsData as any[])
            .map((a) => {
              const cover = coverByAlbum.get(a.id);
              let cover_url: string | null = null;
              if (cover) {
                if (cover.drive_file_id) {
                  cover_url = getDriveImageUrl(cover.drive_file_id, 800);
                } else if (cover.storage_path) {
                  cover_url = signedMap.get(cover.storage_path) ?? null;
                }
              }
              return { ...a, cover_url };
            })
            .sort((a, b) => (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0));
          setAlbums(sorted);
        }
      }

      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioSlug]);

  // Theme-based styles
  const isDark = profile?.theme === 'elegant-dark';
  const bgColor = isDark ? '#0F0F1A' : '#FAFAFA';
  const textColor = isDark ? '#FFFFFF' : '#1A1A2E';
  const subtextColor = isDark ? 'rgba(255,255,255,0.6)' : '#6B7280';
  const cardBg = isDark ? '#1A1A2E' : '#FFFFFF';
  const sectionBg = isDark ? '#141422' : '#F3F4F6';
  const accentColor = '#C9A96E';

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          backgroundColor: '#FAFAFA',
        }}
      >
        <CircularProgress sx={{ color: '#1A1A2E' }} />
      </Box>
    );
  }

  if (notFound || !profile) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          gap: 2,
          px: 3,
        }}
      >
        <CameraAltIcon sx={{ fontSize: 64, color: '#D1D5DB' }} />
        <Typography variant="h4" sx={{ color: '#374151', textAlign: 'center' }}>
          Trang không tìm thấy
        </Typography>
        <Typography variant="body1" sx={{ color: '#6B7280', textAlign: 'center' }}>
          Studio này chưa có website hoặc website chưa được xuất bản.
        </Typography>
      </Box>
    );
  }

  const hasSocial = profile.social_facebook || profile.social_instagram || profile.social_tiktok || profile.social_youtube;
  const hasContact = profile.contact_email || profile.contact_phone || profile.address;

  return (
    <Box sx={{
      minHeight: '100vh', backgroundColor: bgColor,
      // Animations dùng chung — keyframes inline qua sx parent
      '@keyframes fadeUp': {
        '0%': { opacity: 0, transform: 'translateY(30px)' },
        '100%': { opacity: 1, transform: 'translateY(0)' },
      },
      '@keyframes fadeIn': {
        '0%': { opacity: 0 },
        '100%': { opacity: 1 },
      },
      '@keyframes scaleIn': {
        '0%': { opacity: 0, transform: 'scale(0.96)' },
        '100%': { opacity: 1, transform: 'scale(1)' },
      },
      '@keyframes shimmer': {
        '0%': { backgroundPosition: '-200% 0' },
        '100%': { backgroundPosition: '200% 0' },
      },
    }}>
      {/* Hero Section — modern edgy design với corner brackets, mesh gradient,
          noise grain texture và animated mouse scroll indicator. */}
      <Box
        sx={{
          position: 'relative',
          minHeight: { xs: 540, md: 720 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          px: 3,
          color: '#FFFFFF',
          overflow: 'hidden',
          // Multi-layer background: dark base + 3 mesh gradients + studio cover (nếu có)
          background: profile.cover_image_path
            ? `linear-gradient(180deg, rgba(10,10,20,0.85) 0%, rgba(10,10,20,0.65) 50%, rgba(10,10,20,0.95) 100%), url(${profile.cover_image_path}) center/cover no-repeat, #0a0a14`
            : '#0a0a14',
          // Mesh gradient backdrop
          '&::before': {
            content: '""', position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `
              radial-gradient(circle at 15% 20%, ${accentColor}28 0%, transparent 45%),
              radial-gradient(circle at 85% 80%, ${accentColor}1f 0%, transparent 50%),
              radial-gradient(circle at 50% 50%, rgba(120,80,200,0.18) 0%, transparent 60%)
            `,
            animation: 'meshFloat 18s ease-in-out infinite',
          },
          // Noise grain texture (SVG inline) — thêm chiều sâu, không "phẳng"
          '&::after': {
            content: '""', position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.4%22/%3E%3C/svg%3E")',
            opacity: 0.18, mixBlendMode: 'overlay',
          },
          '& > *': { position: 'relative', zIndex: 1 },
          '@keyframes meshFloat': {
            '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
            '50%': { transform: 'translate(2%, -2%) scale(1.05)' },
          },
          '@keyframes mouseScroll': {
            '0%': { transform: 'translateY(0)', opacity: 1 },
            '60%': { opacity: 1 },
            '100%': { transform: 'translateY(14px)', opacity: 0 },
          },
        }}
      >
        {/* Corner brackets — sharp edge accent (góc cạnh) */}
        {[
          { top: 24, left: 24, borderTop: '2px solid', borderLeft: '2px solid' },
          { top: 24, right: 24, borderTop: '2px solid', borderRight: '2px solid' },
          { bottom: 24, left: 24, borderBottom: '2px solid', borderLeft: '2px solid' },
          { bottom: 24, right: 24, borderBottom: '2px solid', borderRight: '2px solid' },
        ].map((pos, i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute', width: 28, height: 28, ...pos,
              borderColor: `${accentColor}80`,
              animation: `fadeIn 1.2s ease-out ${0.6 + i * 0.08}s backwards`,
            }}
          />
        ))}

        <Typography
          variant="overline"
          sx={{
            letterSpacing: 6,
            color: accentColor,
            fontSize: '0.78rem',
            fontWeight: 600,
            mb: 2.5,
            position: 'relative',
            animation: 'fadeUp 0.8s ease-out 0.1s backwards',
            // Decorative line trên 2 bên
            '&::before, &::after': {
              content: '""', display: 'inline-block', width: 36, height: 1,
              background: accentColor, verticalAlign: 'middle', mx: 1.5, opacity: 0.6,
            },
          }}
        >
          PHOTOGRAPHY STUDIO
        </Typography>

        <Typography
          variant="h2"
          sx={{
            fontWeight: 800,
            mb: 2.5,
            fontSize: { xs: '2.4rem', sm: '3.2rem', md: '4.4rem' },
            maxWidth: 900,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            // Gradient text — edgy
            background: `linear-gradient(180deg, #fff 0%, ${accentColor}cc 110%)`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'fadeUp 0.9s ease-out 0.3s backwards',
          }}
        >
          {profile.hero_title}
        </Typography>

        {profile.hero_subtitle && (
          <Typography
            sx={{
              fontWeight: 400,
              fontSize: { xs: '1rem', md: '1.15rem' },
              color: 'rgba(255,255,255,0.7)',
              maxWidth: 560,
              lineHeight: 1.7,
              animation: 'fadeUp 1s ease-out 0.5s backwards',
            }}
          >
            {profile.hero_subtitle}
          </Typography>
        )}

        {/* Animated mouse scroll indicator — thay cho text "SCROLL" */}
        <Box
          sx={{
            position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
            animation: 'fadeIn 1s ease-out 1.4s backwards',
          }}
        >
          {/* Mouse outline */}
          <Box
            sx={{
              width: 26, height: 42,
              border: '2px solid rgba(255,255,255,0.6)',
              borderRadius: '14px',
              display: 'flex', justifyContent: 'center',
              pt: 1,
              position: 'relative',
              transition: 'border-color 0.3s',
              '&:hover': { borderColor: accentColor },
            }}
          >
            {/* Dot moving down */}
            <Box
              sx={{
                width: 3, height: 8, borderRadius: 2,
                background: accentColor,
                animation: 'mouseScroll 1.6s ease-in-out infinite',
              }}
            />
          </Box>
          <Typography
            sx={{
              fontSize: '0.62rem',
              letterSpacing: 3,
              color: 'rgba(255,255,255,0.4)',
              fontWeight: 600,
            }}
          >
            SCROLL
          </Typography>
        </Box>
      </Box>

      {/* Albums Section */}
      {albums.length > 0 && (
        <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
          <Typography
            variant="overline"
            sx={{
              display: 'block',
              textAlign: 'center',
              letterSpacing: 3,
              color: accentColor,
              mb: 1,
            }}
          >
            PORTFOLIO
          </Typography>
          <Typography
            variant="h3"
            sx={{
              textAlign: 'center',
              fontWeight: 700,
              color: textColor,
              mb: 6,
              fontSize: { xs: '1.5rem', md: '2rem' },
            }}
          >
            Các album nổi bật
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
              },
              gap: 3,
            }}
          >
            {albums.map((album, idx) => (
              <Card
                key={album.id}
                sx={{
                  backgroundColor: cardBg,
                  borderRadius: 3,
                  overflow: 'hidden',
                  animation: `scaleIn 0.6s ease-out ${0.1 + idx * 0.08}s backwards`,
                  transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1), box-shadow 0.4s ease',
                  '&:hover': {
                    transform: 'translateY(-6px)',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.15)',
                  },
                  '&:hover .album-cover-img': { transform: 'scale(1.06)' },
                  '&:hover .album-cover-overlay': { opacity: 1 },
                }}
              >
                <CardActionArea onClick={() => router.push(`/album/${album.slug}`)}>
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
            ))}
          </Box>
        </Container>
      )}

      {/* About Section */}
      {profile.about_text && (
        <Box
          sx={{
            backgroundColor: sectionBg,
            py: { xs: 6, md: 10 },
          }}
        >
          <Container maxWidth="md" sx={{ textAlign: 'center' }}>
            <Typography
              variant="overline"
              sx={{
                display: 'block',
                letterSpacing: 3,
                color: accentColor,
                mb: 1,
              }}
            >
              VỀ CHÚNG TÔI
            </Typography>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 700,
                color: textColor,
                mb: 3,
                fontSize: { xs: '1.5rem', md: '2rem' },
              }}
            >
              Giới thiệu
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: subtextColor,
                lineHeight: 1.8,
                maxWidth: 700,
                mx: 'auto',
                whiteSpace: 'pre-line',
              }}
            >
              {profile.about_text}
            </Typography>
          </Container>
        </Box>
      )}

      {/* Contact Section */}
      {(hasContact || hasSocial) && (
        <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 }, textAlign: 'center' }}>
          <Typography
            variant="overline"
            sx={{
              display: 'block',
              letterSpacing: 3,
              color: accentColor,
              mb: 1,
            }}
          >
            LIÊN HỆ
          </Typography>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 700,
              color: textColor,
              mb: 4,
              fontSize: { xs: '1.5rem', md: '2rem' },
            }}
          >
            Kết nối với chúng tôi
          </Typography>

          <Stack spacing={2} alignItems="center" sx={{ mb: 4 }}>
            {profile.contact_email && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <EmailIcon sx={{ color: accentColor, fontSize: 20 }} />
                <Typography variant="body1" sx={{ color: textColor }}>
                  {profile.contact_email}
                </Typography>
              </Box>
            )}
            {profile.contact_phone && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <PhoneIcon sx={{ color: accentColor, fontSize: 20 }} />
                <Typography variant="body1" sx={{ color: textColor }}>
                  {profile.contact_phone}
                </Typography>
              </Box>
            )}
            {profile.address && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <LocationOnIcon sx={{ color: accentColor, fontSize: 20 }} />
                <Typography variant="body1" sx={{ color: textColor }}>
                  {profile.address}
                </Typography>
              </Box>
            )}
          </Stack>

          {hasSocial && (
            <Stack direction="row" spacing={1} justifyContent="center">
              {profile.social_facebook && (
                <IconButton
                  component="a"
                  href={profile.social_facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    backgroundColor: isDark ? '#2D2D44' : '#F3F4F6',
                    '&:hover': { backgroundColor: accentColor, color: '#fff' },
                    color: textColor,
                  }}
                >
                  <FacebookIcon />
                </IconButton>
              )}
              {profile.social_instagram && (
                <IconButton
                  component="a"
                  href={profile.social_instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    backgroundColor: isDark ? '#2D2D44' : '#F3F4F6',
                    '&:hover': { backgroundColor: accentColor, color: '#fff' },
                    color: textColor,
                  }}
                >
                  <InstagramIcon />
                </IconButton>
              )}
              {profile.social_tiktok && (
                <IconButton
                  component="a"
                  href={profile.social_tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    backgroundColor: isDark ? '#2D2D44' : '#F3F4F6',
                    '&:hover': { backgroundColor: accentColor, color: '#fff' },
                    color: textColor,
                  }}
                >
                  <MusicNoteIcon />
                </IconButton>
              )}
              {profile.social_youtube && (
                <IconButton
                  component="a"
                  href={profile.social_youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    backgroundColor: isDark ? '#2D2D44' : '#F3F4F6',
                    '&:hover': { backgroundColor: accentColor, color: '#fff' },
                    color: textColor,
                  }}
                >
                  <YouTubeIcon />
                </IconButton>
              )}
            </Stack>
          )}
        </Container>
      )}

      {/* Footer */}
      <Box
        sx={{
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB'}`,
          py: 3,
          textAlign: 'center',
        }}
      >
        <Typography variant="caption" sx={{ color: subtextColor }}>
          Một sản phẩm của{' '}
          <Box
            component="span"
            sx={{ color: accentColor, fontWeight: 600 }}
          >
            Map Boss Club - Đỗ Trương San San
          </Box>
        </Typography>
      </Box>
    </Box>
  );
}
