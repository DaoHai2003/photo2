/**
 * Website Hero Cover Upload — input file → upload Supabase Storage → callback URL.
 * Bucket: `website-covers` (public, 8MB limit, image/* only).
 * Path pattern: `<userId>/hero-<timestamp>.<ext>` để tránh trùng + RLS đúng owner.
 */
'use client';

import { useState, useRef } from 'react';
import { Box, Button, IconButton, Typography, CircularProgress, Stack } from '@mui/material';
import { CloudUpload, Delete } from '@mui/icons-material';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export interface WebsiteCoverUploadProps {
  value: string | null;            // current cover URL (full public URL)
  onChange: (url: string | null) => void;
}

export default function WebsiteCoverUpload({ value, onChange }: WebsiteCoverUploadProps) {
  const supabase = createClient();
  const { user } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = () => inputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setError(null);
    setUploading(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/hero-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase
        .storage.from('website-covers')
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from('website-covers').getPublicUrl(path);

      onChange(urlData.publicUrl);
    } catch (err) {
      setError((err as Error).message || 'Upload thất bại');
    } finally {
      setUploading(false);
      // reset input để có thể chọn lại cùng file
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    onChange(null);
    setError(null);
  };

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={handleFile}
      />

      {value ? (
        <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
          <Box
            component="img"
            src={value}
            alt="Hero cover preview"
            sx={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }}
          />
          <Stack
            direction="row"
            spacing={1}
            sx={{
              position: 'absolute', top: 8, right: 8,
              bgcolor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
              borderRadius: 1, p: 0.5,
            }}
          >
            <IconButton size="small" onClick={handlePick} sx={{ color: '#fff' }} disabled={uploading}>
              {uploading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <CloudUpload fontSize="small" />}
            </IconButton>
            <IconButton size="small" onClick={handleRemove} sx={{ color: '#fff' }} disabled={uploading}>
              <Delete fontSize="small" />
            </IconButton>
          </Stack>
        </Box>
      ) : (
        <Button
          fullWidth
          variant="outlined"
          startIcon={uploading ? <CircularProgress size={18} /> : <CloudUpload />}
          onClick={handlePick}
          disabled={uploading}
          sx={{
            py: 4, borderStyle: 'dashed', borderWidth: 2,
            color: 'text.secondary',
            '&:hover': { borderStyle: 'dashed', borderWidth: 2, bgcolor: 'rgba(0,0,0,0.02)' },
          }}
        >
          {uploading ? 'Đang upload...' : 'Chọn ảnh nền hero (JPG / PNG / WEBP, tối đa 8MB)'}
        </Button>
      )}

      {error && (
        <Typography fontSize="0.78rem" color="error" mt={1}>
          {error}
        </Typography>
      )}
      <Typography fontSize="0.7rem" color="text.secondary" mt={1}>
        Khuyến nghị: ảnh ngang 1920×1080 hoặc lớn hơn cho chất lượng tốt nhất.
      </Typography>
    </Box>
  );
}
