'use client';

import { Avatar, Box, Card, CardContent, Stack, Typography } from '@mui/material';

const steps = [
  {
    title: 'Tạo album mới',
    description:
      'Bắt đầu bằng cách tạo một album mới cho buổi chụp hình. Đặt tên album và thêm mô tả để dễ quản lý.',
  },
  {
    title: 'Upload ảnh vào album',
    description:
      'Tải lên các bức ảnh đã chụp vào album. Hỗ trợ kéo thả nhiều ảnh cùng lúc để tiết kiệm thời gian.',
  },
  {
    title: 'Chia sẻ album cho khách hàng',
    description:
      'Tạo liên kết chia sẻ và gửi cho khách hàng. Khách có thể xem album mà không cần đăng nhập.',
  },
  {
    title: 'Khách chọn ảnh yêu thích',
    description:
      'Khách hàng duyệt qua các bức ảnh và chọn những bức yêu thích. Quá trình chọn ảnh đơn giản và trực quan.',
  },
  {
    title: 'Xem danh sách ảnh đã chọn',
    description:
      'Xem lại tất cả ảnh mà khách hàng đã chọn. Xuất danh sách ảnh để xử lý hậu kỳ nhanh chóng.',
  },
  {
    title: 'Sử dụng công cụ lọc ảnh',
    description:
      'Dùng bộ lọc để sắp xếp ảnh theo trạng thái: đã chọn, chưa chọn hoặc tất cả. Giúp quản lý ảnh hiệu quả hơn.',
  },
];

export default function GuidePage() {
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} mb={1}>
        Hướng dẫn sử dụng
      </Typography>
      <Typography variant="body1" color="text.secondary" mb={4}>
        Làm theo các bước dưới đây để bắt đầu sử dụng San San cho studio của bạn.
      </Typography>

      <Stack spacing={2}>
        {steps.map((step, index) => (
          <Card
            key={index}
            sx={{
              borderRadius: 3,
              boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              transition: 'box-shadow 0.2s',
              '&:hover': {
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              },
            }}
          >
            <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 2.5, p: 3 }}>
              <Avatar
                sx={{
                  bgcolor: 'primary.main',
                  width: 44,
                  height: 44,
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  flexShrink: 0,
                }}
              >
                {index + 1}
              </Avatar>
              <Box>
                <Typography variant="subtitle1" fontWeight={600} mb={0.5}>
                  {step.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {step.description}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
