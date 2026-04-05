'use client';

import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  CancelOutlined as CancelOutlinedIcon,
  StarOutlined,
  WorkspacePremiumOutlined,
  DiamondOutlined,
} from '@mui/icons-material';
import { useAuthStore } from '@/stores/authStore';
import { useSnackbar } from '@/components/providers/SnackbarProvider';

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  icon: React.ReactNode;
  popular?: boolean;
  features: PlanFeature[];
}

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Miễn phí',
    price: '0 VND',
    icon: <StarOutlined sx={{ fontSize: 32 }} />,
    features: [
      { text: '3 albums', included: true },
      { text: '500 MB dung lượng', included: true },
      { text: 'Chia sẻ album cơ bản', included: true },
      { text: 'Hỗ trợ qua email', included: true },
      { text: 'Tên miền tuỳ chỉnh', included: false },
      { text: 'Xoá watermark', included: false },
      { text: 'Hỗ trợ ưu tiên', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '199.000 VND/tháng',
    icon: <WorkspacePremiumOutlined sx={{ fontSize: 32 }} />,
    popular: true,
    features: [
      { text: 'Không giới hạn albums', included: true },
      { text: '50 GB dung lượng', included: true },
      { text: 'Chia sẻ album nâng cao', included: true },
      { text: 'Hỗ trợ qua email', included: true },
      { text: 'Tên miền tuỳ chỉnh', included: true },
      { text: 'Xoá watermark', included: true },
      { text: 'Hỗ trợ ưu tiên', included: false },
    ],
  },
  {
    id: 'lifetime',
    name: 'Trọn đời',
    price: '4.990.000 VND',
    icon: <DiamondOutlined sx={{ fontSize: 32 }} />,
    features: [
      { text: 'Không giới hạn albums', included: true },
      { text: '200 GB dung lượng', included: true },
      { text: 'Chia sẻ album nâng cao', included: true },
      { text: 'Hỗ trợ qua email', included: true },
      { text: 'Tên miền tuỳ chỉnh', included: true },
      { text: 'Xoá watermark', included: true },
      { text: 'Hỗ trợ ưu tiên', included: true },
    ],
  },
];

export default function BillingPage() {
  const { studio } = useAuthStore();
  const { showSnackbar } = useSnackbar();

  const currentPlan: string = 'free';

  const handleUpgrade = (planId: string) => {
    if (planId === currentPlan) return;
    showSnackbar('Tính năng nâng cấp gói sẽ sớm được cập nhật!', 'info');
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} mb={1}>
        Gói dịch vụ
      </Typography>
      <Typography variant="body1" color="text.secondary" mb={4}>
        Chọn gói phù hợp với nhu cầu studio của bạn.
      </Typography>

      <Grid container spacing={3} alignItems="stretch">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;

          return (
            <Grid size={{"xs":12,"md":4}}key={plan.id}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 3,
                  boxShadow: plan.popular
                    ? '0 4px 24px rgba(0,0,0,0.12)'
                    : '0 2px 12px rgba(0,0,0,0.08)',
                  border: plan.popular ? '2px solid' : '1px solid',
                  borderColor: plan.popular ? 'primary.main' : 'grey.200',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {plan.popular && (
                  <Chip
                    label="Phổ biến nhất"
                    color="primary"
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: -12,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontWeight: 600,
                    }}
                  />
                )}
                <CardContent
                  sx={{
                    p: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    flexGrow: 1,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      mb: 1,
                      color: plan.popular ? 'primary.main' : 'text.primary',
                    }}
                  >
                    {plan.icon}
                    <Typography variant="h6" fontWeight={700}>
                      {plan.name}
                    </Typography>
                  </Box>

                  <Typography variant="h5" fontWeight={700} mb={2}>
                    {plan.price}
                  </Typography>

                  {isCurrent && (
                    <Chip
                      label="Gói hiện tại"
                      color="success"
                      variant="outlined"
                      size="small"
                      sx={{ mb: 2, alignSelf: 'flex-start', fontWeight: 600 }}
                    />
                  )}

                  <List dense sx={{ flexGrow: 1, mb: 2 }}>
                    {plan.features.map((feature, idx) => (
                      <ListItem key={idx} disableGutters sx={{ py: 0.3 }}>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {feature.included ? (
                            <CheckCircleIcon
                              sx={{ fontSize: 20, color: 'success.main' }}
                            />
                          ) : (
                            <CancelOutlinedIcon
                              sx={{ fontSize: 20, color: 'grey.400' }}
                            />
                          )}
                        </ListItemIcon>
                        <ListItemText
                          primary={feature.text}
                          primaryTypographyProps={{
                            variant: 'body2',
                            color: feature.included
                              ? 'text.primary'
                              : 'text.disabled',
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>

                  <Button
                    variant={isCurrent ? 'outlined' : 'contained'}
                    fullWidth
                    disabled={isCurrent}
                    onClick={() => handleUpgrade(plan.id)}
                    sx={{ borderRadius: 2, mt: 'auto' }}
                  >
                    {isCurrent ? 'Gói hiện tại' : 'Nâng cấp'}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
