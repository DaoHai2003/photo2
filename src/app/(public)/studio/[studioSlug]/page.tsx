/**
 * Backward-compat redirect: /studio/{slug} → /{slug}
 *
 * Route cũ giờ ở root level (`/(public)/[studioSlug]`). File này chỉ permanent
 * redirect để link external cũ chia sẻ vẫn hoạt động.
 */
import { redirect } from 'next/navigation';

export default async function StudioRedirect({
  params,
}: {
  params: Promise<{ studioSlug: string }>;
}) {
  const { studioSlug } = await params;
  redirect(`/${studioSlug}`);
}
