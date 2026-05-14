/**
 * Admin email check helper.
 *
 * Source of truth: env var `SUPER_ADMIN_EMAILS` (comma-separated list).
 * Đặt trong `.env.local` (dev) và Cloud Run env (prod).
 *
 * Ví dụ: SUPER_ADMIN_EMAILS=Dhreview2003@gmail.com,otheradmin@x.com
 *
 * Dùng case-insensitive match — email Supabase có thể normalize lowercase.
 */

const ADMIN_EMAILS_RAW = process.env.SUPER_ADMIN_EMAILS || '';

const ADMIN_EMAILS_SET = new Set(
  ADMIN_EMAILS_RAW
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

/**
 * Returns true nếu email nằm trong whitelist admin.
 * Empty string / null / undefined → false.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS_SET.has(email.toLowerCase());
}

/**
 * Trả tổng số admin email được cấu hình.
 * Dùng để debug / log boot-time.
 */
export function getAdminEmailCount(): number {
  return ADMIN_EMAILS_SET.size;
}
