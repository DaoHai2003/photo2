'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSnackbar } from '@/components/providers/SnackbarProvider';
import { useForm, Controller } from 'react-hook-form';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Stack,
  Divider,
  Grid,
  Switch,
  FormControlLabel,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Tabs,
  Tab,
} from '@mui/material';
import AlbumOrderPanel from '@/components/dashboard/album-order-panel';
import {
  Save as SaveIcon,
  Visibility as PreviewIcon,
  Publish as PublishIcon,
  Language as WebIcon,
  ContentCopy as CopyIcon,
  OpenInNew as OpenInNewIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { Alert } from '@mui/material';
import WebsiteCoverUpload from '@/components/dashboard/website-cover-upload';

interface WebsiteProfile {
  id: string;
  studio_id: string;
  slug: string | null;
  hero_title: string;
  hero_subtitle: string;
  about_text: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  // DB column names: social_facebook / social_instagram / social_tiktok / social_youtube
  social_facebook: string;
  social_instagram: string;
  social_tiktok: string;
  social_youtube: string;
  theme: 'minimal' | 'classic' | 'modern';
  cover_image_path: string | null;  // Hero background URL (Supabase Storage public)
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

interface WebsiteAlbum {
  id: string;
  website_id: string;
  album_id: string;
  sort_order: number;
}

interface Album {
  id: string;
  title: string;
  photo_count: number;
  is_published: boolean;
}

interface FormValues {
  hero_title: string;
  hero_subtitle: string;
  about_text: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  social_facebook: string;
  social_instagram: string;
  social_tiktok: string;
  social_youtube: string;
  theme: 'minimal' | 'classic' | 'modern';
  cover_image_path: string | null;
}

export default function WebsitePage() {
  const supabase = createClient();
  const { user } = useAuthStore();
  const { showSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [albumToggles, setAlbumToggles] = useState<Record<string, boolean>>({});

  // Tab state — 0: Xây dựng, 1: Sắp xếp album
  const [activeTab, setActiveTab] = useState(0);

  // Slug editor — cho user tự đổi URL website
  const [slugDraft, setSlugDraft] = useState('');
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugSaving, setSlugSaving] = useState(false);

  // Reserved slugs — paths internal Next.js / app dùng → không cho user lấy
  const RESERVED_SLUGS = useMemo(() => new Set([
    'album', 'dashboard', 'auth', 'api', 'studio', 'login', 'register',
    'photo', 'public', 'static', '_next', 'favicon', 'robots', 'sitemap',
    'admin', 'forgot-password', 'reset-password', 'about', 'contact',
    'pricing', 'terms', 'privacy', 'help', 'docs',
  ]), []);

  // Sanitize input → kebab-case, no diacritics, no special chars
  const sanitizeSlug = (raw: string): string => raw
    .toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove diacritics
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const { control, handleSubmit, reset, watch } = useForm<FormValues>({
    defaultValues: {
      hero_title: '',
      hero_subtitle: '',
      about_text: '',
      contact_email: '',
      contact_phone: '',
      address: '',
      social_facebook: '',
      social_instagram: '',
      social_tiktok: '',
      social_youtube: '',
      theme: 'minimal',
      cover_image_path: null,
    },
  });

  const selectedTheme = watch('theme');

  // Fetch website profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['website-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('website_profiles')
        .select('*')
        .eq('studio_id', user.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data as WebsiteProfile | null;
    },
    enabled: !!user?.id,
  });

  // Fetch albums for toggle list
  const { data: albums = [] } = useQuery({
    queryKey: ['all-albums', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('albums')
        .select('id, title, photo_count, is_published')
        .eq('studio_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Album[];
    },
    enabled: !!user?.id,
  });

  // Fetch website albums
  const { data: websiteAlbums = [] } = useQuery({
    queryKey: ['website-albums', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from('website_albums')
        .select('id, website_id, album_id, sort_order')
        .eq('website_id', profile.id);
      if (error) throw error;
      return data as unknown as WebsiteAlbum[];
    },
    enabled: !!profile?.id,
  });

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      reset({
        hero_title: profile.hero_title || '',
        hero_subtitle: profile.hero_subtitle || '',
        about_text: profile.about_text || '',
        contact_email: profile.contact_email || '',
        contact_phone: profile.contact_phone || '',
        address: profile.address || '',
        social_facebook: profile.social_facebook || '',
        social_instagram: profile.social_instagram || '',
        social_tiktok: profile.social_tiktok || '',
        social_youtube: profile.social_youtube || '',
        theme: profile.theme || 'minimal',
        cover_image_path: profile.cover_image_path || null,
      });
      setSlugDraft(profile.slug || '');
    }
  }, [profile, reset]);

  // Lưu slug mới — validate uniqueness + reserved trước khi update DB
  const handleSaveSlug = async () => {
    const cleaned = sanitizeSlug(slugDraft);
    if (!cleaned) {
      setSlugError('Slug không hợp lệ');
      return;
    }
    if (cleaned.length < 2) {
      setSlugError('Slug phải dài ít nhất 2 ký tự');
      return;
    }
    if (RESERVED_SLUGS.has(cleaned)) {
      setSlugError(`"${cleaned}" là từ dành riêng, vui lòng chọn slug khác`);
      return;
    }
    if (cleaned === profile?.slug) {
      setSlugError(null);
      showSnackbar('Slug không thay đổi', 'info');
      return;
    }
    setSlugSaving(true);
    setSlugError(null);
    // Check unique trong website_profiles
    const { data: existing } = await supabase
      .from('website_profiles').select('id').eq('slug', cleaned).maybeSingle();
    if (existing && existing.id !== profile?.id) {
      setSlugSaving(false);
      setSlugError(`Slug "${cleaned}" đã có studio khác dùng`);
      return;
    }
    if (!profile?.id) {
      setSlugSaving(false);
      setSlugError('Cần lưu thông tin website trước khi đặt slug');
      return;
    }
    const { error } = await supabase
      .from('website_profiles').update({ slug: cleaned }).eq('id', profile.id);
    setSlugSaving(false);
    if (error) {
      setSlugError(error.message);
      return;
    }
    setSlugDraft(cleaned);
    queryClient.invalidateQueries({ queryKey: ['website-profile'] });
    showSnackbar('Đã đổi slug thành ' + cleaned, 'success');
  };

  // Populate album toggles (album is visible if it has a website_albums record)
  useEffect(() => {
    if (albums.length === 0) return;
    const toggles: Record<string, boolean> = {};
    albums.forEach((a) => {
      toggles[a.id] = websiteAlbums.some((w) => w.album_id === a.id);
    });
    setAlbumToggles(toggles);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albums.length, websiteAlbums.length]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user?.id) throw new Error('Not authenticated');

      let profileId = profile?.id;

      if (profile) {
        const { error } = await supabase
          .from('website_profiles')
          .update({
            ...values,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);
        if (error) throw error;
      } else {
        // Lấy slug từ studios để dùng làm public URL /studio/{slug}
        const { data: studio } = await supabase
          .from('studios').select('slug').eq('id', user.id).single();
        const { data, error } = await supabase
          .from('website_profiles')
          .insert({
            studio_id: user.id,
            slug: studio?.slug || null,
            ...values,
            is_published: false,
          })
          .select()
          .single();
        if (error) throw error;
        profileId = data.id;
      }

      // Sync album toggles: insert if visible, delete if not
      if (profileId) {
        for (const albumId of Object.keys(albumToggles)) {
          const isVisible = albumToggles[albumId];
          const existing = websiteAlbums.find((w) => w.album_id === albumId);

          if (isVisible && !existing) {
            await supabase.from('website_albums').insert({
              website_id: profileId,
              album_id: albumId,
              sort_order: 0,
              is_visible: true,
            });
          } else if (!isVisible && existing) {
            await supabase.from('website_albums').delete().eq('id', existing.id);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['website-profile'] });
      queryClient.invalidateQueries({ queryKey: ['website-albums'] });
      showSnackbar('Đã lưu thông tin website', 'success');
    },
    onError: () => {
      showSnackbar('Không thể lưu. Vui lòng thử lại.', 'error');
    },
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('No profile');
      const { error } = await supabase
        .from('website_profiles')
        .update({ is_published: !profile.is_published, updated_at: new Date().toISOString() })
        .eq('id', profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['website-profile'] });
      showSnackbar(
        profile?.is_published ? 'Đã huỷ xuất bản website' : 'Đã xuất bản website thành công!',
        'success'
      );
    },
    onError: () => {
      showSnackbar('Không thể cập nhật trạng thái xuất bản', 'error');
    },
  });

  const onSubmit = (values: FormValues) => {
    saveMutation.mutate(values);
  };

  if (profileLoading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <WebIcon color="primary" />
          <Typography variant="h4" fontWeight={700}>
            Xây dựng Website
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          {profile && (
            <Chip
              label={profile.is_published ? 'Đã xuất bản' : 'Bản nháp'}
              color={profile.is_published ? 'success' : 'default'}
              variant="outlined"
            />
          )}
        </Stack>
      </Stack>

      {/* Tabs ngay dưới header — 2 mục: Xây dựng / Sắp xếp album */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          mb: 3,
          borderBottom: 1, borderColor: 'divider',
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.85rem' },
        }}
      >
        <Tab label="Xây dựng" />
        <Tab label="Sắp xếp album" />
      </Tabs>

      {activeTab === 1 && <AlbumOrderPanel />}

      {activeTab === 0 && (
      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container spacing={3}>
          {/* Hero Section */}
          <Grid size={{"xs":12,"md":8}}>
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" mb={2}>
                Phần Hero
              </Typography>
              <Stack spacing={2}>
                <Controller
                  name="hero_title"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Tiêu đề chính" fullWidth placeholder="Studio Photography" />
                  )}
                />
                <Controller
                  name="hero_subtitle"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Phụ đề"
                      fullWidth
                      placeholder="Lưu giữ khoảnh khắc đẹp nhất"
                    />
                  )}
                />

                {/* Hero background cover — hiển thị bên dưới chữ + layers trên trang public */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
                    Ảnh nền hero
                  </Typography>
                  <Controller
                    name="cover_image_path"
                    control={control}
                    render={({ field }) => (
                      <WebsiteCoverUpload
                        value={field.value}
                        onChange={(url) => field.onChange(url)}
                      />
                    )}
                  />
                </Box>
              </Stack>
            </Paper>

            {/* About Section */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" mb={2}>
                Giới thiệu
              </Typography>
              <Controller
                name="about_text"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Nội dung giới thiệu"
                    fullWidth
                    multiline
                    rows={5}
                    placeholder="Viết vài dòng giới thiệu về studio của bạn..."
                  />
                )}
              />
            </Paper>

            {/* Contact Info */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" mb={2}>
                Thông tin liên hệ
              </Typography>
              <Stack spacing={2}>
                <Controller
                  name="contact_email"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Email" fullWidth type="email" />
                  )}
                />
                <Controller
                  name="contact_phone"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Số điện thoại" fullWidth />
                  )}
                />
                <Controller
                  name="address"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Địa chỉ" fullWidth />
                  )}
                />
              </Stack>
            </Paper>

            {/* Social Media */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" mb={2}>
                Mạng xã hội
              </Typography>
              <Stack spacing={2}>
                <Controller
                  name="social_facebook"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Facebook URL" fullWidth placeholder="https://facebook.com/..." />
                  )}
                />
                <Controller
                  name="social_instagram"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Instagram URL" fullWidth placeholder="https://instagram.com/..." />
                  )}
                />
                <Controller
                  name="social_tiktok"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="TikTok URL" fullWidth placeholder="https://tiktok.com/@..." />
                  )}
                />
                <Controller
                  name="social_youtube"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="YouTube URL" fullWidth placeholder="https://youtube.com/..." />
                  )}
                />
              </Stack>
            </Paper>
          </Grid>

          {/* Sidebar */}
          <Grid size={{"xs":12,"md":4}}>
            {/* Theme Selector */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" mb={2}>
                Giao diện
              </Typography>
              <Controller
                name="theme"
                control={control}
                render={({ field }) => (
                  <FormControl>
                    <RadioGroup {...field}>
                      <FormControlLabel
                        value="minimal"
                        control={<Radio />}
                        label={
                          <Box>
                            <Typography variant="body1" fontWeight={500}>
                              Minimal
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Tối giản, sạch sẽ
                            </Typography>
                          </Box>
                        }
                      />
                      <FormControlLabel
                        value="classic"
                        control={<Radio />}
                        label={
                          <Box>
                            <Typography variant="body1" fontWeight={500}>
                              Classic
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Cổ điển, thanh lịch
                            </Typography>
                          </Box>
                        }
                      />
                      <FormControlLabel
                        value="modern"
                        control={<Radio />}
                        label={
                          <Box>
                            <Typography variant="body1" fontWeight={500}>
                              Modern
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Hiện đại, nổi bật
                            </Typography>
                          </Box>
                        }
                      />
                    </RadioGroup>
                  </FormControl>
                )}
              />
            </Paper>

            {/* Slug editor — đổi URL website tuỳ ý */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" mb={1}>
                🔗 URL website
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Đổi slug để có URL ngắn gọn, dễ chia sẻ. Chỉ cho phép a-z, 0-9, dấu gạch ngang.
              </Typography>
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.5, mb: 1,
                px: 1.5, py: 1, borderRadius: 1.5,
                bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider',
              }}>
                <Typography sx={{ fontSize: '0.85rem', fontFamily: 'monospace', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                  photo.giauco.vn /
                </Typography>
                <TextField
                  value={slugDraft}
                  onChange={(e) => { setSlugDraft(e.target.value); setSlugError(null); }}
                  placeholder="ten-studio-cua-ban"
                  variant="standard"
                  size="small"
                  fullWidth
                  disabled={slugSaving}
                  InputProps={{ disableUnderline: true, sx: { fontSize: '0.85rem', fontFamily: 'monospace' } }}
                />
              </Box>
              {slugError && (
                <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
                  ⚠️ {slugError}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Sau khi lưu: <code>photo.giauco.vn/{sanitizeSlug(slugDraft) || '...'}</code>
              </Typography>
              <Button
                variant="outlined"
                fullWidth
                size="small"
                onClick={handleSaveSlug}
                disabled={slugSaving || !slugDraft.trim() || sanitizeSlug(slugDraft) === profile?.slug}
              >
                {slugSaving ? 'Đang kiểm tra...' : 'Lưu slug'}
              </Button>
            </Paper>

            {/* Actions */}
            <Paper sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  startIcon={saveMutation.isPending ? <CircularProgress size={18} /> : <SaveIcon />}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<PreviewIcon />}
                  onClick={() => window.open('/dashboard/website/preview', '_blank')}
                >
                  Xem trước
                </Button>
                <Button
                  variant={profile?.is_published ? 'outlined' : 'contained'}
                  color={profile?.is_published ? 'warning' : 'success'}
                  fullWidth
                  startIcon={<PublishIcon />}
                  onClick={() => publishMutation.mutate()}
                  disabled={!profile || publishMutation.isPending}
                >
                  {profile?.is_published ? 'Huỷ xuất bản' : 'Xuất bản'}
                </Button>

                {/* Public link panel — chỉ show khi đã xuất bản */}
                {profile?.is_published && (() => {
                  if (!profile.slug) {
                    // Migration 012 chưa chạy → slug NULL → public URL không hoạt động
                    return (
                      <Alert
                        severity="warning"
                        icon={<WarningIcon fontSize="small" />}
                        sx={{ mt: 1 }}
                      >
                        <Typography fontWeight={700} fontSize="0.85rem">
                          Cần chạy migration để tạo link
                        </Typography>
                        <Typography fontSize="0.78rem" sx={{ mt: 0.5 }}>
                          File: <code>supabase/migrations/012_website_fix.sql</code> chưa được chạy
                          trên Supabase. Vào SQL Editor → paste → Run.
                        </Typography>
                      </Alert>
                    );
                  }
                  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/${profile.slug}`;
                  return (
                    <Box sx={{
                      mt: 1, p: 1.5, borderRadius: 1.5,
                      bgcolor: 'success.50', border: '1px solid', borderColor: 'success.light',
                    }}>
                      <Typography fontSize="0.78rem" fontWeight={700} color="success.dark" sx={{ mb: 0.5 }}>
                        ✅ Website đang xuất bản tại:
                      </Typography>
                      <Box sx={{
                        display: 'flex', alignItems: 'center', gap: 0.5,
                        bgcolor: 'background.paper', borderRadius: 1, p: 0.75,
                        border: '1px solid', borderColor: 'divider',
                      }}>
                        <Typography sx={{
                          flex: 1, fontSize: '0.78rem', fontFamily: 'monospace',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {url}
                        </Typography>
                        <Button
                          size="small" variant="text" startIcon={<CopyIcon sx={{ fontSize: 14 }} />}
                          onClick={() => {
                            navigator.clipboard.writeText(url);
                            showSnackbar('Đã copy link website', 'success');
                          }}
                          sx={{ minWidth: 0, fontSize: '0.7rem' }}
                        >
                          Copy
                        </Button>
                        <Button
                          size="small" variant="text" startIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                          onClick={() => window.open(url, '_blank')}
                          sx={{ minWidth: 0, fontSize: '0.7rem' }}
                        >
                          Mở
                        </Button>
                      </Box>
                    </Box>
                  );
                })()}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </form>
      )}
    </Box>
  );
}
