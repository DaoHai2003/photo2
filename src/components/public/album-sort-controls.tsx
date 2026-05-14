/**
 * Album Sort Controls — toolbar cho owner sắp xếp album hiển thị trên public page.
 * 3 modes:
 *   - date-desc: ngày tạo mới nhất trước
 *   - date-asc:  ngày tạo cũ nhất trước
 *   - manual:    enable drag-and-drop, owner kéo thả tự do
 * Mỗi lần đổi mode hoặc drop → ghi sort_order mới vào website_albums.
 */
'use client';

import { Box, ToggleButton, ToggleButtonGroup, Chip, Stack } from '@mui/material';
import SortIcon from '@mui/icons-material/Sort';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

export type SortMode = 'date-desc' | 'date-asc' | 'manual';

interface Props {
  mode: SortMode;
  onChange: (m: SortMode) => void;
  saving?: boolean;
  textColor: string;
  accentColor: string;
}

export default function AlbumSortControls({ mode, onChange, saving, textColor, accentColor }: Props) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{
        px: 2, py: 1, borderRadius: 2,
        bgcolor: 'rgba(201,169,110,0.06)',
        border: `1px solid ${accentColor}33`,
      }}>
        <SortIcon sx={{ color: accentColor, fontSize: 18 }} />
        <ToggleButtonGroup
          value={mode}
          exclusive
          size="small"
          onChange={(_, v) => v && onChange(v)}
          sx={{
            '& .MuiToggleButton-root': {
              color: textColor, fontSize: '0.75rem', px: 1.5, py: 0.5, border: 0,
              textTransform: 'none', fontWeight: 600,
              '&.Mui-selected': {
                bgcolor: accentColor, color: '#fff',
                '&:hover': { bgcolor: accentColor },
              },
            },
          }}
        >
          <ToggleButton value="date-desc">Mới nhất</ToggleButton>
          <ToggleButton value="date-asc">Cũ nhất</ToggleButton>
          <ToggleButton value="manual">
            <DragIndicatorIcon sx={{ fontSize: 16, mr: 0.5 }} />
            Tự sắp xếp
          </ToggleButton>
        </ToggleButtonGroup>
        {saving && <Chip label="Đang lưu..." size="small" sx={{ fontSize: '0.65rem', height: 20 }} />}
      </Stack>
    </Box>
  );
}
