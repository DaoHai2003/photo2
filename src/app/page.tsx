'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined';
import { useAuthStore } from '@/stores/authStore';

const features = [
  {
    icon: <PhotoLibraryOutlinedIcon sx={{ fontSize: 40 }} />,
    title: 'Quản lý Album',
    desc: 'Tạo album nhanh chóng, upload hàng trăm ảnh cùng lúc, sắp xếp chuyên nghiệp.',
  },
  {
    icon: <ShareOutlinedIcon sx={{ fontSize: 40 }} />,
    title: 'Chia sẻ dễ dàng',
    desc: 'Gửi link album cho khách hàng. Bảo vệ bằng mật khẩu nếu cần.',
  },
  {
    icon: <FavoriteBorderIcon sx={{ fontSize: 40 }} />,
    title: 'Khách chọn ảnh',
    desc: 'Khách không cần đăng ký, chọn ảnh yêu thích trực tiếp trên trình duyệt.',
  },
  {
    icon: <FilterAltOutlinedIcon sx={{ fontSize: 40 }} />,
    title: 'Lọc ảnh thông minh',
    desc: 'Tự động lọc ảnh gốc theo danh sách đã chọn. Tiết kiệm hàng giờ.',
  },
  {
    icon: <LanguageOutlinedIcon sx={{ fontSize: 40 }} />,
    title: 'Website Portfolio',
    desc: 'Tạo website portfolio chuyên nghiệp cho studio trong vài phút.',
  },
  {
    icon: <SpeedOutlinedIcon sx={{ fontSize: 40 }} />,
    title: 'Nhanh & Đơn giản',
    desc: 'Giao diện trực quan, tối ưu cho quy trình thực tế của studio.',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { user, loading } = useAuthStore();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard/albums');
    }
  }, [user, loading, router]);

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* Navbar */}
      <Box
        component="nav"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="lg">
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1.5 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <PhotoLibraryOutlinedIcon sx={{ color: 'primary.main', fontSize: 32 }} />
              <Typography variant="h5" fontWeight={700} color="primary.main">
                PhotoShare
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" onClick={() => router.push('/login')}>
                Đăng nhập
              </Button>
              <Button variant="contained" onClick={() => router.push('/register')}>
                Dùng thử miễn phí
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Hero */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
          color: 'white',
          py: { xs: 8, md: 12 },
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography
            variant="h2"
            fontWeight={800}
            sx={{ fontSize: { xs: '2rem', md: '3rem' }, mb: 2 }}
          >
            Quản lý album ảnh
            <Box component="br" />
            chuyên nghiệp cho studio
          </Typography>
          <Typography
            variant="h6"
            sx={{ opacity: 0.85, mb: 4, fontWeight: 400, fontSize: { xs: '1rem', md: '1.2rem' } }}
          >
            Tạo album, chia sẻ cho khách, nhận lựa chọn ảnh yêu thích,
            <Box component="br" sx={{ display: { xs: 'none', md: 'block' } }} />
            lọc ảnh tự động và xây dựng website portfolio.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
            <Button
              variant="contained"
              size="large"
              onClick={() => router.push('/register')}
              sx={{
                bgcolor: '#C9A96E',
                color: '#1A1A2E',
                px: 4,
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 700,
                '&:hover': { bgcolor: '#D9C49A' },
              }}
            >
              Bắt đầu miễn phí
            </Button>
            <Button
              variant="outlined"
              size="large"
              sx={{
                borderColor: 'rgba(255,255,255,0.4)',
                color: 'white',
                px: 4,
                py: 1.5,
                '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' },
              }}
              onClick={() => router.push('/login')}
            >
              Đăng nhập
            </Button>
          </Stack>
        </Container>
      </Box>

      {/* Features */}
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Typography variant="h3" textAlign="center" mb={1}>
          Tất cả trong một nền tảng
        </Typography>
        <Typography variant="body1" textAlign="center" color="text.secondary" mb={6}>
          Mọi thứ studio cần để quản lý và chia sẻ ảnh với khách hàng
        </Typography>
        <Grid container spacing={3}>
          {features.map((f, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Card sx={{ height: '100%', p: 1 }}>
                <CardContent>
                  <Box sx={{ color: 'primary.main', mb: 2 }}>{f.icon}</Box>
                  <Typography variant="h6" mb={1}>
                    {f.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {f.desc}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* CTA */}
      <Box sx={{ bgcolor: '#1A1A2E', color: 'white', py: 8, textAlign: 'center' }}>
        <Container maxWidth="sm">
          <Typography variant="h4" mb={2} fontWeight={700}>
            Sẵn sàng bắt đầu?
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.8, mb: 4 }}>
            Tạo tài khoản miễn phí và bắt đầu quản lý album ảnh chuyên nghiệp ngay hôm nay.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => router.push('/register')}
            sx={{
              bgcolor: '#C9A96E',
              color: '#1A1A2E',
              px: 5,
              py: 1.5,
              fontWeight: 700,
              '&:hover': { bgcolor: '#D9C49A' },
            }}
          >
            Dùng thử miễn phí
          </Button>
        </Container>
      </Box>

      {/* Footer */}
      <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">
          &copy; 2025 PhotoShare. Nền tảng quản lý album ảnh cho studio chụp ảnh.
        </Typography>
      </Box>
    </Box>
  );
}
