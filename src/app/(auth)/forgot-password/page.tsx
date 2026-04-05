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
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  ArrowBack,
  MailOutline,
  CheckCircleOutline,
} from '@mui/icons-material';
import { createClient } from '@/lib/supabase/client';
import { useSnackbar } from '@/components/providers/SnackbarProvider';

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Vui lòng nhập email')
    .email('Địa chỉ email không hợp lệ'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const { showSnackbar } = useSnackbar();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        data.email,
        {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        }
      );

      if (authError) {
        setError(authError.message);
        return;
      }

      setSuccess(true);
      showSnackbar('Đã gửi link đặt lại mật khẩu!', 'success');
    } catch {
      setError('Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'rgba(46, 125, 50, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 3,
          }}
        >
          <MailOutline sx={{ fontSize: 36, color: 'success.main' }} />
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700, color: '#1A1A2E', mb: 1.5 }}>
          Kiểm tra email của bạn
        </Typography>

        <Typography
          variant="body1"
          sx={{ color: 'text.secondary', mb: 4, lineHeight: 1.7, px: 2 }}
        >
          Đã gửi link đặt lại mật khẩu. Kiểm tra email của bạn.
        </Typography>

        <Button
          component={Link}
          href="/login"
          variant="outlined"
          startIcon={<ArrowBack />}
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

      <Button
        component={Link}
        href="/login"
        startIcon={<ArrowBack />}
        sx={{
          mb: 3,
          textTransform: 'none',
          color: 'text.secondary',
          fontWeight: 500,
          px: 0,
          '&:hover': {
            backgroundColor: 'transparent',
            color: '#1A1A2E',
          },
        }}
      >
        Quay lại đăng nhập
      </Button>

      <Typography
        variant="h4"
        sx={{ fontWeight: 700, color: '#1A1A2E', mb: 0.5 }}
      >
        Quên mật khẩu
      </Typography>

      <Typography
        variant="body1"
        sx={{ color: 'text.secondary', mb: 4, lineHeight: 1.6 }}
      >
        Nhập email của bạn và chúng tôi sẽ gửi link đặt lại mật khẩu
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
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
              sx={{ mb: 3 }}
              InputProps={{
                sx: { borderRadius: 2 },
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
            'Gửi link đặt lại mật khẩu'
          )}
        </Button>
      </Box>
    </Box>
  );
}
