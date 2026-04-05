'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { createAlbum } from '@/actions/albums';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useSnackbar } from '@/components/providers/SnackbarProvider';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import InputAdornment from '@mui/material/InputAdornment';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import GoogleIcon from '@mui/icons-material/Google';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ImageIcon from '@mui/icons-material/Image';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import LinkIcon from '@mui/icons-material/Link';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import NoteIcon from '@mui/icons-material/Note';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
}

const albumSchema = z.object({
  title: z.string().min(1, 'Tên album là bắt buộc').max(200),
  customSlug: z.string().max(100).optional().or(z.literal('')),
  usePassword: z.boolean(),
  password: z.string().optional(),
  useMaxSelections: z.boolean(),
  maxSelections: z.number().int().min(1).optional(),
  allowDownload: z.boolean(),
  allowComments: z.boolean(),
  downloadQuality: z.string(),
  autoDelete: z.boolean(),
  autoDeleteDays: z.number().optional(),
  clientNote: z.string().max(500).optional().or(z.literal('')),
});

type FormValues = z.infer<typeof albumSchema>;

function extractFolderId(url: string): string | null {
  const patterns = [/\/folders\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{10,}$/.test(url.trim())) return url.trim();
  return null;
}

export default function NewAlbumPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuthStore();
  const { showSnackbar } = useSnackbar();

  const [activeTab, setActiveTab] = useState(0);

  // Drive state
  const [driveUrls, setDriveUrls] = useState<{ label: string; url: string }[]>([
    { label: 'Ảnh gốc', url: '' },
  ]);
  const [editDriveUrl, setEditDriveUrl] = useState('');
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveScanning, setDriveScanning] = useState(false);
  const [driveError, setDriveError] = useState('');
  const [driveUploading, setDriveUploading] = useState(false);
  const [driveProgress, setDriveProgress] = useState(0);
  const [useEditFolder, setUseEditFolder] = useState(false);

  const { control, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(albumSchema),
    defaultValues: {
      title: '',
      customSlug: '',
      usePassword: false,
      password: '',
      useMaxSelections: false,
      maxSelections: 20,
      allowDownload: true,
      allowComments: true,
      downloadQuality: 'original',
      autoDelete: false,
      autoDeleteDays: 30,
      clientNote: '',
    },
  });

  const usePassword = watch('usePassword');
  const useMaxSelections = watch('useMaxSelections');
  const autoDelete = watch('autoDelete');

  const handleScanDrive = async () => {
    setDriveError('');
    setDriveFiles([]);

    const allFiles: DriveFile[] = [];
    let hasError = false;

    setDriveScanning(true);
    for (const folder of driveUrls) {
      if (!folder.url.trim()) continue;
      const folderId = extractFolderId(folder.url);
      if (!folderId) {
        setDriveError(`Link không hợp lệ: ${folder.url}`);
        hasError = true;
        break;
      }
      try {
        const res = await fetch('/api/drive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setDriveError(data.error || 'Không thể quét thư mục');
          hasError = true;
          break;
        }
        allFiles.push(...(data.files || []));
      } catch {
        setDriveError('Lỗi kết nối. Vui lòng thử lại.');
        hasError = true;
        break;
      }
    }

    if (useEditFolder && editDriveUrl.trim()) {
      const folderId = extractFolderId(editDriveUrl);
      if (folderId) {
        try {
          const res = await fetch('/api/drive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId }),
          });
          const data = await res.json();
          if (res.ok) allFiles.push(...(data.files || []));
        } catch {}
      }
    }

    setDriveScanning(false);
    if (!hasError) {
      setDriveFiles(allFiles);
      if (allFiles.length === 0) {
        setDriveError('Không tìm thấy ảnh nào trong thư mục.');
      }
    }
  };

  const addDriveFolder = () => {
    setDriveUrls([...driveUrls, { label: `Thư mục ${driveUrls.length + 1}`, url: '' }]);
  };

  const removeDriveFolder = (index: number) => {
    if (driveUrls.length <= 1) return;
    setDriveUrls(driveUrls.filter((_, i) => i !== index));
  };

  const updateDriveUrl = (index: number, url: string) => {
    const updated = [...driveUrls];
    updated[index].url = url;
    setDriveUrls(updated);
  };

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // Extract Drive folder ID from first URL
      let driveFolderId: string | undefined;
      let driveFolderUrl: string | undefined;
      if (activeTab === 0 && driveUrls[0]?.url) {
        driveFolderId = extractFolderId(driveUrls[0].url) || undefined;
        driveFolderUrl = driveUrls[0].url;
      }

      const result = await createAlbum({
        title: values.title,
        description: values.clientNote || undefined,
        password: values.usePassword ? values.password : undefined,
        maxSelections: values.useMaxSelections && values.maxSelections ? values.maxSelections : 0,
        allowDownload: values.allowDownload,
        allowComments: values.allowComments,
        driveFolderId,
        driveFolderUrl,
      });
      if (result.error) throw new Error(result.error);
      return result.data!;
    },
    onSuccess: async (data) => {
      if (activeTab === 0 && driveFiles.length > 0) {
        setDriveUploading(true);
        setDriveProgress(0);
        let uploaded = 0;

        // Drive files are already on Drive — just save metadata with drive_file_id
        for (const file of driveFiles) {
          try {
            await supabase.from('photos').insert({
              album_id: data.id,
              studio_id: user?.id,
              original_filename: file.name,
              normalized_filename: file.name.toLowerCase().trim(),
              storage_path: null,
              drive_file_id: file.id,
              drive_thumbnail_link: file.thumbnailLink || null,
              file_size: parseInt(file.size || '0') || 0,
              mime_type: file.mimeType,
            });

            uploaded++;
          } catch {}
          setDriveProgress(Math.round((uploaded / driveFiles.length) * 100));
        }

        setDriveUploading(false);
        showSnackbar(`Đã tạo album với ${uploaded}/${driveFiles.length} ảnh!`, 'success');
      } else {
        showSnackbar('Đã tạo album thành công!', 'success');
      }
      router.push(`/dashboard/albums/${data.id}`);
    },
    onError: (error: Error) => {
      showSnackbar(error.message || 'Không thể tạo album', 'error');
    },
  });

  const onSubmit = (values: FormValues) => {
    if (activeTab === 0 && driveFiles.length === 0) {
      const hasUrl = driveUrls.some(f => f.url.trim());
      if (hasUrl) {
        showSnackbar('Vui lòng quét thư mục trước khi tạo album', 'warning');
        return;
      }
    }
    createMutation.mutate(values);
  };

  const isSubmitting = createMutation.isPending || driveUploading;

  return (
    <Dialog open fullScreen sx={{ '& .MuiDialog-paper': { bgcolor: 'background.default' } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box component="span" sx={{ fontWeight: 700, fontSize: '1.3rem' }}>Tạo Album Mới</Box>
        <IconButton onClick={() => router.push('/dashboard/albums')}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ maxWidth: 700, mx: 'auto', p: { xs: 2, sm: 3 }, pb: 10 }}>
          {/* Tab selection */}
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{ mb: 3, '& .MuiTab-root': { fontWeight: 600, fontSize: '0.95rem' } }}
          >
            <Tab icon={<GoogleIcon />} iconPosition="start" label="Từ Link Drive" />
            <Tab icon={<CloudUploadIcon />} iconPosition="start" label="Upload Trực Tiếp" />
          </Tabs>

          <form onSubmit={handleSubmit(onSubmit)}>
            {/* === DRIVE TAB === */}
            {activeTab === 0 && (
              <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                  <LinkIcon color="primary" />
                  <Typography variant="subtitle1" fontWeight={600}>Liên kết Google Drive</Typography>
                </Stack>

                {/* Drive folder inputs */}
                {driveUrls.map((folder, index) => (
                  <Box key={index} sx={{ mb: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                      <FolderOpenIcon fontSize="small" color="action" />
                      <Typography variant="body2" fontWeight={600}>
                        {folder.label} {index === 0 && <span style={{ color: 'red' }}>*</span>}
                      </Typography>
                      {index > 0 && (
                        <IconButton size="small" onClick={() => removeDriveFolder(index)}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Stack>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="https://drive.google.com/drive/folders/..."
                      value={folder.url}
                      onChange={(e) => updateDriveUrl(index, e.target.value)}
                    />
                  </Box>
                ))}

                <Button size="small" startIcon={<AddIcon />} onClick={addDriveFolder} sx={{ mb: 2 }}>
                  Thêm thư mục ảnh gốc
                </Button>

                <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                  Đảm bảo các folder được chia sẻ &quot;Anyone with the link&quot;. Thêm nhiều thư mục để phân loại ảnh gốc (VD: Pre-wedding, PSC).
                </Typography>

                {/* Edit folder toggle */}
                <FormControlLabel
                  control={<Switch checked={useEditFolder} onChange={(e) => setUseEditFolder(e.target.checked)} />}
                  label={<Typography variant="body2" fontWeight={500}>Thêm thư mục ảnh chỉnh sửa</Typography>}
                />
                {useEditFolder && (
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="https://drive.google.com/drive/folders/..."
                    value={editDriveUrl}
                    onChange={(e) => setEditDriveUrl(e.target.value)}
                    sx={{ mt: 1, mb: 2 }}
                  />
                )}

                <Divider sx={{ my: 2 }} />

                <Button
                  variant="contained"
                  startIcon={driveScanning ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
                  onClick={handleScanDrive}
                  disabled={driveScanning || !driveUrls.some(f => f.url.trim())}
                  fullWidth
                >
                  {driveScanning ? 'Đang quét...' : 'Quét thư mục'}
                </Button>

                {driveError && <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>{driveError}</Alert>}
                {driveFiles.length > 0 && (
                  <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>
                    Tìm thấy <strong>{driveFiles.length}</strong> ảnh
                  </Alert>
                )}
              </Paper>
            )}

            {/* === UPLOAD TAB === */}
            {activeTab === 1 && (
              <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  Tạo album trước, sau đó upload ảnh trực tiếp từ trang chi tiết album.
                </Alert>
              </Paper>
            )}

            {/* === COMMON SETTINGS === */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} mb={2}>Tên Album</Typography>
              <Controller
                name="title"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    placeholder="Ví dụ: Đám cưới Nguyễn Văn A"
                    error={!!errors.title}
                    helperText={errors.title?.message}
                    size="small"
                  />
                )}
              />
            </Paper>

            <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
              <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                <Typography variant="subtitle1" fontWeight={600}>Link chia sẻ tùy chỉnh</Typography>
                <Chip label="Tùy chọn" size="small" />
              </Stack>
              <Controller
                name="customSlug"
                control={control}
                render={({ field }) => (
                  <Stack direction="row" alignItems="center" spacing={0}>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', pr: 1 }}>
                      photoshare.app/album/
                    </Typography>
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      placeholder="vd: dam-cuoi-2024"
                    />
                  </Stack>
                )}
              />
              <Typography variant="caption" color="text.secondary" mt={0.5}>
                Để trống để tự động tạo
              </Typography>
            </Paper>

            {/* Password */}
            <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <LockOutlinedIcon color="action" />
                  <Box>
                    <Typography variant="body1" fontWeight={600}>Bảo vệ album bằng mật khẩu</Typography>
                    <Typography variant="caption" color="text.secondary">Khách hàng cần nhập mật khẩu để xem</Typography>
                  </Box>
                </Stack>
                <Controller name="usePassword" control={control} render={({ field }) => (
                  <Switch checked={field.value} onChange={field.onChange} />
                )} />
              </Stack>
              {usePassword && (
                <Controller name="password" control={control} render={({ field }) => (
                  <TextField {...field} fullWidth size="small" type="password" placeholder="Nhập mật khẩu" sx={{ mt: 2 }} error={!!errors.password} helperText={errors.password?.message} />
                )} />
              )}
            </Paper>

            {/* Max selections */}
            <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <PhotoLibraryIcon color="action" />
                  <Box>
                    <Typography variant="body1" fontWeight={600}>Giới hạn số lượng ảnh được chọn</Typography>
                    <Typography variant="caption" color="text.secondary">Đặt số ảnh tối đa khách hàng có thể chọn</Typography>
                  </Box>
                </Stack>
                <Controller name="useMaxSelections" control={control} render={({ field }) => (
                  <Switch checked={field.value} onChange={field.onChange} />
                )} />
              </Stack>
              {useMaxSelections && (
                <Controller name="maxSelections" control={control} render={({ field }) => (
                  <TextField {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} fullWidth size="small" type="number" placeholder="20" sx={{ mt: 2 }} inputProps={{ min: 1 }} />
                )} />
              )}
            </Paper>

            {/* Download */}
            <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <DownloadIcon color="action" />
                  <Box>
                    <Typography variant="body1" fontWeight={600}>Cho phép tải xuống</Typography>
                    <Typography variant="caption" color="text.secondary">Khách hàng có thể tải ảnh về máy</Typography>
                  </Box>
                </Stack>
                <Controller name="allowDownload" control={control} render={({ field }) => (
                  <Switch checked={field.value} onChange={field.onChange} />
                )} />
              </Stack>

              <Controller name="downloadQuality" control={control} render={({ field }) => (
                <FormControl sx={{ mt: 2 }}>
                  <FormLabel sx={{ fontSize: '0.85rem', fontWeight: 500 }}>Chất lượng tải về</FormLabel>
                  <RadioGroup {...field}>
                    <FormControlLabel value="original" control={<Radio size="small" />} label="Chất lượng gốc (Full size)" />
                    <FormControlLabel value="2048" control={<Radio size="small" />} label="2048px (Chất lượng cao)" />
                    <FormControlLabel value="1000" control={<Radio size="small" />} label="1000px (Tiết kiệm dung lượng)" />
                  </RadioGroup>
                </FormControl>
              )} />
            </Paper>

            {/* Auto delete */}
            <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <DeleteOutlineIcon color="action" />
                  <Box>
                    <Typography variant="body1" fontWeight={600}>Tự động xóa album</Typography>
                    <Typography variant="caption" color="text.secondary">Album sẽ tự động xóa sau thời gian</Typography>
                  </Box>
                </Stack>
                <Controller name="autoDelete" control={control} render={({ field }) => (
                  <Switch checked={field.value} onChange={field.onChange} />
                )} />
              </Stack>
              {autoDelete && (
                <Controller name="autoDeleteDays" control={control} render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                    fullWidth size="small" type="number" sx={{ mt: 2 }}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">ngày</InputAdornment> } }}
                  />
                )} />
              )}
            </Paper>

            {/* Client note */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
              <Stack direction="row" alignItems="center" spacing={1.5} mb={1}>
                <NoteIcon color="action" />
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="body1" fontWeight={600}>Ghi chú cho khách hàng</Typography>
                  <Chip label="Tùy chọn" size="small" />
                </Stack>
              </Stack>
              <Controller name="clientNote" control={control} render={({ field }) => (
                <TextField {...field} fullWidth multiline rows={2} size="small" placeholder="Nhập ghi chú hiển thị trong album..." />
              )} />
            </Paper>

            {/* Upload progress */}
            {driveUploading && (
              <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
                <Typography variant="body2" mb={1}>Đang tải ảnh từ Google Drive... {driveProgress}%</Typography>
                <LinearProgress variant="determinate" value={driveProgress} sx={{ height: 8, borderRadius: 4 }} />
              </Paper>
            )}

            {/* Submit */}
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={isSubmitting}
              sx={{
                py: 1.5, fontWeight: 700, fontSize: '1rem', borderRadius: 2,
                background: 'linear-gradient(135deg, #1A1A2E 0%, #2D2D44 100%)',
              }}
            >
              {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Tạo Album'}
            </Button>
          </form>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
