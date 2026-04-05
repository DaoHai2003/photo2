'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { SaveOutlined } from '@mui/icons-material';
import { useAuthStore } from '@/stores/authStore';
import { createClient } from '@/lib/supabase/client';

export default function SettingsPage() {
  const { studio, setStudio } = useAuthStore();
  const supabase = createClient();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (studio) {
      setName(studio.name || '');
      setSlug(studio.slug || '');
      setEmail(studio.email || '');
      setPhone(studio.phone || '');
      setAddress(studio.address || '');
    }
  }, [studio]);

  const handleSave = async () => {
    if (!studio?.id) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('studios')
        .update({
          name,
          slug,
          email,
          phone,
          address,
        })
        .eq('id', studio.id)
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setStudio({ ...studio, ...data });
      }
    } catch (err) {
      console.error('Lỗi khi lưu cài đặt:', err);
    } finally {
      setSaving(false);
    }
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} mb={3}>
        Cài đặt Studio
      </Typography>

      <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3}>
            <TextField
              label="Tên Studio"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
            />

            <Box>
              <TextField
                label="Slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                fullWidth
              />
              <Typography variant="caption" color="text.secondary" mt={0.5}>
                URL xem trước: {baseUrl}/{slug}
              </Typography>
            </Box>

            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
            />

            <TextField
              label="Số điện thoại"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
            />

            <TextField
              label="Địa chỉ"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              fullWidth
              multiline
              rows={3}
            />

            {/* Logo upload placeholder */}
            <Box>
              <Typography variant="subtitle2" mb={1}>
                Logo Studio
              </Typography>
              <Box
                sx={{
                  width: 120,
                  height: 120,
                  border: '2px dashed',
                  borderColor: 'grey.300',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                  },
                }}
              >
                <Typography variant="caption" color="text.secondary" textAlign="center">
                  Tải lên logo
                </Typography>
              </Box>
            </Box>

            <Box>
              <Button
                variant="contained"
                startIcon={<SaveOutlined />}
                onClick={handleSave}
                disabled={saving}
                sx={{ borderRadius: 2, px: 4 }}
              >
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
