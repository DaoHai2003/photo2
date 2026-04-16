'use client';

import { QRCodeSVG } from 'qrcode.react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  TextField,
  IconButton,
  InputAdornment,
  Typography,
  Divider,
  Switch,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  OpenInNew as OpenInNewIcon,
  Close as CloseIcon,
  Lock as LockIcon,
  Download as DownloadIcon,
  Comment as CommentIcon,
  QrCode as QrCodeIcon,
} from '@mui/icons-material';
import { useSnackbar } from '@/components/providers/SnackbarProvider';

interface Album {
  id: string;
  title: string;
  slug: string;
  password_hash?: string | null;
  allow_download: boolean;
  allow_comments: boolean;
}

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  album: Album;
}

export default function ShareDialog({ open, onClose, album }: ShareDialogProps) {
  const { showSnackbar } = useSnackbar();

  const publicUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/album/${album.slug}`
      : `/album/${album.slug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      showSnackbar('Đã copy link vào clipboard', 'success');
    } catch {
      showSnackbar('Không thể copy link', 'error');
    }
  };

  const handleOpenAlbum = () => {
    window.open(publicUrl, '_blank');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box component="span" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
          Chia sẻ Album
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Public Link */}
        <Typography variant="subtitle2" gutterBottom>
          Link công khai
        </Typography>
        <TextField
          fullWidth
          value={publicUrl}
          InputProps={{
            readOnly: true,
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={handleCopy} edge="end">
                  <CopyIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
          size="small"
          sx={{ mb: 3 }}
        />

        {/* QR Code */}
        <Typography variant="subtitle2" gutterBottom>
          Mã QR
        </Typography>
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            p: 2,
            mb: 3,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: '#fff',
          }}
        >
          <QRCodeSVG
            value={publicUrl}
            size={180}
            level="M"
            includeMargin
            bgColor="#FFFFFF"
            fgColor="#1A1A2E"
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Settings Quick Toggles */}
        <Typography variant="subtitle2" gutterBottom>
          Cài đặt nhanh
        </Typography>
        <List disablePadding>
          <ListItem disableGutters>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <LockIcon color={album.password_hash ? 'warning' : 'disabled'} />
            </ListItemIcon>
            <ListItemText
              primary="Bảo vệ mật khẩu"
              secondary={album.password_hash ? 'Đã bật' : 'Chưa bật'}
            />
            <ListItemSecondaryAction>
              <Switch checked={!!album.password_hash} disabled />
            </ListItemSecondaryAction>
          </ListItem>
          <ListItem disableGutters>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <DownloadIcon color={album.allow_download ? 'primary' : 'disabled'} />
            </ListItemIcon>
            <ListItemText
              primary="Cho phép tải ảnh"
              secondary={album.allow_download ? 'Đã bật' : 'Chưa bật'}
            />
            <ListItemSecondaryAction>
              <Switch checked={album.allow_download} disabled />
            </ListItemSecondaryAction>
          </ListItem>
          <ListItem disableGutters>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <CommentIcon color={album.allow_comments ? 'primary' : 'disabled'} />
            </ListItemIcon>
            <ListItemText
              primary="Cho phép bình luận"
              secondary={album.allow_comments ? 'Đã bật' : 'Chưa bật'}
            />
            <ListItemSecondaryAction>
              <Switch checked={album.allow_comments} disabled />
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          Đóng
        </Button>
        <Button
          variant="contained"
          startIcon={<OpenInNewIcon />}
          onClick={handleOpenAlbum}
        >
          Xem album
        </Button>
      </DialogActions>
    </Dialog>
  );
}
