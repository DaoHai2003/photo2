/**
 * Admin Studios — page chính list users/studios. Server component fetch RPC,
 * pass xuống client table component để xử lý interactive.
 */
import { Box, Typography } from '@mui/material';
import { fetchAdminStudiosList } from '@/lib/admin/fetch-admin-data';
import AdminStudiosTable from '@/components/admin/admin-studios-table';

const PAGE_SIZE = 50;

export default async function AdminStudiosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const search = sp.q ?? '';
  const filterRaw = sp.status;
  const filter: 'active' | 'suspended' | null =
    filterRaw === 'active' || filterRaw === 'suspended' ? filterRaw : null;
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, totalCount } = await fetchAdminStudiosList({
    search,
    filterStatus: filter,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <Box>
      <Box mb={3}>
        <Typography fontSize="1.7rem" fontWeight={800} color="#E8E6E3">
          Studios
        </Typography>
        <Typography fontSize="0.9rem" color="text.secondary" mt={0.5}>
          Tất cả tài khoản studio đăng ký trong hệ thống.
        </Typography>
      </Box>

      <AdminStudiosTable
        initialRows={rows}
        initialTotalCount={totalCount}
        initialPage={page}
        initialSearch={search}
        initialFilter={filter}
        pageSize={PAGE_SIZE}
      />
    </Box>
  );
}
