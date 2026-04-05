'use client';

import { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
  Save as SaveIcon,
  Visibility as PreviewIcon,
  Publish as PublishIcon,
  Language as WebIcon,
} from '@mui/icons-material';

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
  theme: 'minimal' | 'classic' | 'modern';
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
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  youtube_url: string;
  theme: 'minimal' | 'classic' | 'modern';
}

export default function WebsitePage() {
  const supabase = createClient();
  const { user } = useAuthStore();
  const { showSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [albumToggles, setAlbumToggles] = useState<Record<string, boolean>>({});

  const { control, handleSubmit, reset, watch } = useForm<FormValues>({
    defaultValues: {
      hero_title: '',
      hero_subtitle: '',
      about_text: '',
      contact_email: '',
      contact_phone: '',
      address: '',
      facebook_url: '',
      instagram_url: '',
      tiktok_url: '',
      youtube_url: '',
      theme: 'minimal',
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
        facebook_url: profile.facebook_url || '',
        instagram_url: profile.instagram_url || '',
        tiktok_url: profile.tiktok_url || '',
        youtube_url: profile.youtube_url || '',
        theme: profile.theme || 'minimal',
      });
    }
  }, [profile, reset]);

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
        const { data, error } = await supabase
          .from('website_profiles')
          .insert({
            studio_id: user.id,
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
                  name="facebook_url"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Facebook URL" fullWidth placeholder="https://facebook.com/..." />
                  )}
                />
                <Controller
                  name="instagram_url"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="Instagram URL" fullWidth placeholder="https://instagram.com/..." />
                  )}
                />
                <Controller
                  name="tiktok_url"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="TikTok URL" fullWidth placeholder="https://tiktok.com/@..." />
                  )}
                />
                <Controller
                  name="youtube_url"
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

            {/* Album Toggle List */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" mb={2}>
                Album hiển thị
              </Typography>
              {albums.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Chưa có album nào
                </Typography>
              ) : (
                <List dense>
                  {albums.map((album) => (
                    <ListItem key={album.id} sx={{ px: 0 }}>
                      <ListItemText
                        primary={album.title}
                        secondary={`${album.photo_count} ảnh`}
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          edge="end"
                          checked={albumToggles[album.id] || false}
                          onChange={(e) =>
                            setAlbumToggles((prev) => ({
                              ...prev,
                              [album.id]: e.target.checked,
                            }))
                          }
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
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
                  onClick={() => window.open('/preview', '_blank')}
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
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
}
