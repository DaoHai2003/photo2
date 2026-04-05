'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import GoogleIcon from '@mui/icons-material/Google';
import { createClient } from '@/lib/supabase/client';
import { useSnackbar } from '@/components/providers/SnackbarProvider';

const loginSchema = z.object({
  email: z.string().min(1, 'Vui lòng nhập email').email('Email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

type LoginForm = z.infer<typeof loginSchema>;

import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showSnackbar } = useSnackbar();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Check for callback errors
  const callbackError = searchParams.get('error');
  const errorDesc = searchParams.get('error_description');
  const [error, setError] = useState<string | null>(
    callbackError === 'auth_callback_error'
      ? errorDesc || 'Đăng nhập thất bại. Vui lòng thử lại.'
      : null
  );

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'Email hoặc mật khẩu không chính xác'
          : authError.message);
        return;
      }
      showSnackbar('Đăng nhập thành công!', 'success');
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'https://www.googleapis.com/auth/drive.file',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (authError) {
        setError(authError.message);
        setIsGoogleLoading(false);
      }
    } catch {
      setError('Đã xảy ra lỗi với Google. Vui lòng thử lại.');
      setIsGoogleLoading(false);
    }
  };

  return (
    <Box>
      <Typography
        variant="h5"
        sx={{ display: { xs: 'block', md: 'none' }, fontWeight: 700, color: '#1A1A2E', mb: 1, textAlign: 'center' }}
      >
        PhotoShare
      </Typography>

      <Typography variant="h4" sx={{ fontWeight: 700, color: '#1A1A2E', mb: 0.5 }}>
        Chào mừng trở lại
      </Typography>
      <Typography variant="body1" sx={{ color: 'text.secondary', mb: 4 }}>
        Đăng nhập để quản lý album ảnh của bạn
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Email"
              placeholder="studio@example.com"
              error={!!errors.email}
              helperText={errors.email?.message}
              sx={{ mb: 2.5 }}
            />
          )}
        />

        <Controller
          name="password"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Mật khẩu"
              type={showPassword ? 'text' : 'password'}
              error={!!errors.password}
              helperText={errors.password?.message}
              sx={{ mb: 1.5 }}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}
        />

        <Box sx={{ textAlign: 'right', mb: 3 }}>
          <Typography
            component={Link}
            href="/forgot-password"
            variant="body2"
            sx={{ color: '#1A1A2E', textDecoration: 'none', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
          >
            Quên mật khẩu?
          </Typography>
        </Box>

        <Button
          type="submit"
          fullWidth
          variant="contained"
          disabled={isLoading}
          sx={{
            py: 1.5,
            borderRadius: 2,
            fontWeight: 600,
            fontSize: '1rem',
            background: 'linear-gradient(135deg, #1A1A2E 0%, #2D2D44 100%)',
            boxShadow: '0 4px 14px rgba(26, 26, 46, 0.3)',
            '&:hover': { background: 'linear-gradient(135deg, #2D2D44 0%, #1A1A2E 100%)' },
          }}
        >
          {isLoading ? <CircularProgress size={24} sx={{ color: '#fff' }} /> : 'Đăng nhập'}
        </Button>
      </Box>

      <Divider sx={{ my: 3, color: 'text.secondary', fontSize: '0.875rem' }}>
        hoặc
      </Divider>

      <Button
        fullWidth
        variant="outlined"
        disabled={isGoogleLoading}
        onClick={handleGoogleLogin}
        startIcon={isGoogleLoading ? <CircularProgress size={20} /> : <GoogleIcon />}
        sx={{
          py: 1.5,
          borderRadius: 2,
          fontWeight: 500,
          fontSize: '0.95rem',
          borderColor: '#ddd',
          color: 'text.primary',
          '&:hover': { borderColor: '#bbb', backgroundColor: 'rgba(0,0,0,0.02)' },
        }}
      >
        Đăng nhập với Google
      </Button>

      <Typography variant="body2" sx={{ textAlign: 'center', mt: 4, color: 'text.secondary' }}>
        Chưa có tài khoản?{' '}
        <Typography
          component={Link}
          href="/register"
          variant="body2"
          sx={{ color: '#1A1A2E', fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
        >
          Đăng ký ngay
        </Typography>
      </Typography>
    </Box>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
