'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  CircularProgress,
  IconButton,
  Stack,
  Container,
} from '@mui/material';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import FacebookIcon from '@mui/icons-material/Facebook';
import InstagramIcon from '@mui/icons-material/Instagram';
import YouTubeIcon from '@mui/icons-material/YouTube';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';

interface WebsiteProfile {
  id: string;
  studio_id: string;
  hero_title: string;
  hero_subtitle: string;
  about_text: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  youtube_url: string;
  theme: string;
  cover_url: string | null;
  is_published: boolean;
}

interface AlbumCard {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  description: string | null;
}

export default function WebsitePreviewPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuthStore();

  const [profile, setProfile] = useState<WebsiteProfile | null>(null);
  const [albums, setAlbums] = useState<AlbumCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setLoading(true);

      // Fetch website profile for current user
      const { data: wp, error } = await supabase
        .from('website_profiles')
        .select('*')
        .eq('studio_id', user.id)
        .single();

      if (error || !wp) {
        setLoading(false);
        return;
      }

      setProfile(wp);

      // Fetch visible albums via website_albums
      const { data: waData } = await supabase
        .from('website_albums')
        .select('album_id, sort_order')
        .eq('website_id', wp.id)
        .order('sort_order', { ascending: true });

      if (waData && waData.length > 0) {
        const albumIds = waData.map((wa: any) => wa.album_id);
        const { data: albumsData } = await supabase
          .from('albums')
          .select('id, title, slug, cover_url, description')
          .in('id', albumIds)
          .is('deleted_at', null);

        if (albumsData) {
          const orderMap = new Map(waData.map((wa: any) => [wa.album_id, wa.sort_order]));
          const sorted = albumsData.sort(
            (a: any, b: any) => (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0)
          );
          setAlbums(sorted);
        }
      }

      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Theme-based styles
  const isDark = profile?.theme === 'elegant-dark' || profile?.theme === 'modern';
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
          backgroundColor: 'background.default',
        }}
      >
        <CircularProgress sx={{ color: 'text.primary' }} />
      </Box>
    );
  }

  if (!profile) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '80vh',
          gap: 2,
          px: 3,
        }}
      >
        <CameraAltIcon sx={{ fontSize: 64, color: '#D1D5DB' }} />
        <Typography variant="h4" sx={{ color: 'text.primary', textAlign: 'center' }}>
          Chưa tạo website
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', textAlign: 'center' }}>
          Bạn chưa thiết lập thông tin website. Hãy quay lại trang "Xây dựng Website" để bắt đầu.
        </Typography>
      </Box>
    );
  }

  const hasSocial =
    profile.facebook_url || profile.instagram_url || profile.tiktok_url || profile.youtube_url;
  const hasContact = profile.contact_email || profile.contact_phone || profile.address;

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: bgColor }}>
      {/* Preview Banner */}
      <Box
        sx={{
          backgroundColor: '#FF9800',
          color: '#fff',
          textAlign: 'center',
          py: 1,
          px: 2,
          fontSize: '0.875rem',
          fontWeight: 600,
        }}
      >
        Chế độ xem trước - Đây là bản xem trước website portfolio của bạn
      </Box>

      {/* Hero Section */}
      <Box
        sx={{
          position: 'relative',
          minHeight: { xs: 350, md: 500 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          px: 3,
          background: profile.cover_url
            ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${profile.cover_url}) center/cover no-repeat`
            : 'linear-gradient(135deg, #1A1A2E 0%, #2D2D44 50%, #1A1A2E 100%)',
          color: '#FFFFFF',
        }}
      >
        <Typography
          variant="overline"
          sx={{
            letterSpacing: 4,
            color: accentColor,
            fontSize: '0.8rem',
            mb: 2,
          }}
        >
          PHOTOGRAPHY STUDIO
        </Typography>
        <Typography
          variant="h2"
          sx={{
            fontWeight: 700,
            mb: 2,
            fontSize: { xs: '2rem', md: '3rem' },
            maxWidth: 700,
          }}
        >
          {profile.hero_title || 'Tiêu đề website'}
        </Typography>
        {profile.hero_subtitle && (
          <Typography
            variant="h6"
            sx={{
              fontWeight: 400,
              color: 'rgba(255,255,255,0.75)',
              maxWidth: 600,
              lineHeight: 1.6,
            }}
          >
            {profile.hero_subtitle}
          </Typography>
        )}
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
            {albums.map((album) => (
              <Card
                key={album.id}
                sx={{
                  backgroundColor: cardBg,
                  borderRadius: 3,
                  overflow: 'hidden',
                  transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                  },
                }}
              >
                <CardActionArea>
                  <Box
                    sx={{
                      position: 'relative',
                      paddingTop: '66%',
                      backgroundColor: isDark ? '#2D2D44' : '#F3F4F6',
                      backgroundImage: album.cover_url ? `url(${album.cover_url})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {!album.cover_url && (
                      <Box
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <PhotoLibraryIcon sx={{ fontSize: 48, color: '#D1D5DB' }} />
                      </Box>
                    )}
                  </Box>
                  <CardContent sx={{ p: 2.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: textColor, mb: 0.5 }}>
                      {album.title}
                    </Typography>
                    {album.description && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: subtextColor,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
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
            LIEN HE
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
              {profile.facebook_url && (
                <IconButton
                  component="a"
                  href={profile.facebook_url}
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
              {profile.instagram_url && (
                <IconButton
                  component="a"
                  href={profile.instagram_url}
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
              {profile.tiktok_url && (
                <IconButton
                  component="a"
                  href={profile.tiktok_url}
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
              {profile.youtube_url && (
                <IconButton
                  component="a"
                  href={profile.youtube_url}
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
          Powered by{' '}
          <Box component="span" sx={{ color: accentColor, fontWeight: 600 }}>
            PhotoShare
          </Box>
        </Typography>
      </Box>
    </Box>
  );
}
