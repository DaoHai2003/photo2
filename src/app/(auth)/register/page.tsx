'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Box,
  Typography,
  TextField,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  CircularProgress,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Google as GoogleIcon,
  CheckCircleOutline,
} from '@mui/icons-material';
import { createClient } from '@/lib/supabase/client';
import { useSnackbar } from '@/components/providers/SnackbarProvider';

const registerSchema = z
  .object({
    studioName: z
      .string()
      .min(1, 'Vui lòng nhập tên studio')
      .min(2, 'Tên studio phải có ít nhất 2 ký tự')
      .max(100, 'Tên studio không được vượt quá 100 ký tự')
      .regex(
        /^[\p{L}\p{N}\s\-_.&]+$/u,
        'Tên studio chỉ được chứa chữ cái, số, khoảng trắng và các ký tự - _ . &'
      ),
    email: z
      .string()
      .min(1, 'Vui lòng nhập email')
      .email('Địa chỉ email không hợp lệ'),
    password: z
      .string()
      .min(1, 'Vui lòng nhập mật khẩu')
      .min(8, 'Mật khẩu phải có ít nhất 8 ký tự'),
    confirmPassword: z
      .string()
      .min(1, 'Vui lòng xác nhận mật khẩu'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: 'error' | 'warning' | 'info' | 'success';
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 20, label: 'Yếu', color: 'error' };
  if (score <= 2) return { score: 40, label: 'Trung bình', color: 'warning' };
  if (score <= 3) return { score: 60, label: 'Khá', color: 'info' };
  if (score <= 4) return { score: 80, label: 'Mạnh', color: 'success' };
  return { score: 100, label: 'Rất mạnh', color: 'success' };
}

export default function RegisterPage() {
  const { showSnackbar } = useSnackbar();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      studioName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const passwordValue = watch('password');
  const passwordStrength = passwordValue
    ? getPasswordStrength(passwordValue)
    : null;

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            studio_name: data.studioName,
          },
        },
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('Email này đã được đăng ký');
        } else {
          setError(authError.message);
        }
        return;
      }

      setSuccess(true);
      showSnackbar('Đăng ký thành công! Kiểm tra email của bạn.', 'success');
    } catch {
      setError('Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setIsGoogleLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'https://www.googleapis.com/auth/drive',
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

  if (success) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <CheckCircleOutline
          sx={{ fontSize: 64, color: 'success.main', mb: 2 }}
        />
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1A1A2E', mb: 1.5 }}>
          Đăng ký thành công!
        </Typography>
        <Typography
          variant="body1"
          sx={{ color: 'text.secondary', mb: 4, lineHeight: 1.7 }}
        >
          Kiểm tra email để xác nhận tài khoản
        </Typography>
        <Button
          component={Link}
          href="/login"
          variant="outlined"
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            borderColor: '#1A1A2E',
            color: '#1A1A2E',
            px: 4,
            py: 1.2,
            '&:hover': {
              borderColor: '#2D2D44',
              backgroundColor: 'rgba(26, 26, 46, 0.04)',
            },
          }}
        >
          Quay lại đăng nhập
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Mobile branding */}
      <Typography
        variant="h5"
        sx={{
          display: { xs: 'block', md: 'none' },
          fontWeight: 700,
          color: '#1A1A2E',
          mb: 1,
          textAlign: 'center',
        }}
      >
        San San
      </Typography>

      <Typography
        variant="h4"
        sx={{ fontWeight: 700, color: '#1A1A2E', mb: 0.5 }}
      >
        Tạo tài khoản studio
      </Typography>

      <Typography
        variant="body1"
        sx={{ color: 'text.secondary', mb: 4 }}
      >
        Bắt đầu quản lý album ảnh chuyên nghiệp
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Controller
          name="studioName"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Tên studio"
              placeholder="Ví dụ: Beautiful Moments Studio"
              error={!!errors.studioName}
              helperText={errors.studioName?.message}
              sx={{ mb: 2.5 }}
              InputProps={{
                sx: { borderRadius: 2 },
              }}
            />
          )}
        />

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
              InputProps={{
                sx: { borderRadius: 2 },
              }}
            />
          )}
        />

        <Controller
          name="password"
          control={control}
          render={({ field }) => (
            <Box sx={{ mb: 2.5 }}>
              <TextField
                {...field}
                fullWidth
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                placeholder="Tối thiểu 8 ký tự"
                error={!!errors.password}
                helperText={errors.password?.message}
                InputProps={{
                  sx: { borderRadius: 2 },
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {passwordStrength && !errors.password && (
                <Box sx={{ mt: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Độ mạnh mật khẩu
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: `${passwordStrength.color}.main`,
                      }}
                    >
                      {passwordStrength.label}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={passwordStrength.score}
                    color={passwordStrength.color}
                    sx={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: 'rgba(0,0,0,0.08)',
                    }}
                  />
                </Box>
              )}
            </Box>
          )}
        />

        <Controller
          name="confirmPassword"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Xác nhận mật khẩu"
              type={showConfirmPassword ? 'text' : 'password'}
              error={!!errors.confirmPassword}
              helperText={errors.confirmPassword?.message}
              sx={{ mb: 3 }}
              InputProps={{
                sx: { borderRadius: 2 },
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      edge="end"
                      size="small"
                    >
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          )}
        />

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
            textTransform: 'none',
            background: 'linear-gradient(135deg, #1A1A2E 0%, #2D2D44 100%)',
            boxShadow: '0 4px 14px rgba(26, 26, 46, 0.3)',
            '&:hover': {
              background: 'linear-gradient(135deg, #2D2D44 0%, #1A1A2E 100%)',
              boxShadow: '0 6px 20px rgba(26, 26, 46, 0.4)',
            },
            '&:disabled': {
              background: 'rgba(26, 26, 46, 0.5)',
            },
          }}
        >
          {isLoading ? (
            <CircularProgress size={24} sx={{ color: '#fff' }} />
          ) : (
            'Đăng ký'
          )}
        </Button>
      </Box>

      <Divider sx={{ my: 3, color: 'text.secondary', fontSize: '0.875rem' }}>
        hoặc
      </Divider>

      <Button
        fullWidth
        variant="outlined"
        disabled={isGoogleLoading}
        onClick={handleGoogleRegister}
        startIcon={
          isGoogleLoading ? (
            <CircularProgress size={20} />
          ) : (
            <GoogleIcon />
          )
        }
        sx={{
          py: 1.5,
          borderRadius: 2,
          fontWeight: 500,
          fontSize: '0.95rem',
          textTransform: 'none',
          borderColor: '#ddd',
          color: 'text.primary',
          '&:hover': {
            borderColor: '#bbb',
            backgroundColor: 'rgba(0,0,0,0.02)',
          },
        }}
      >
        Đăng ký với Google
      </Button>

      <Typography
        variant="body2"
        sx={{ textAlign: 'center', mt: 4, color: 'text.secondary' }}
      >
        Đã có tài khoản?{' '}
        <Typography
          component={Link}
          href="/login"
          variant="body2"
          sx={{
            color: '#1A1A2E',
            fontWeight: 600,
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          Đăng nhập
        </Typography>
      </Typography>
    </Box>
  );
}
