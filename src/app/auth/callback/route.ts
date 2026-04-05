import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      const user = data.session.user;
      const providerToken = data.session.provider_token;
      const refreshToken = data.session.provider_refresh_token;

      // Ensure studio record exists (trigger might have failed)
      const { data: existingStudio } = await supabase
        .from('studios')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!existingStudio) {
        // Create studio if missing
        const userName = user.user_metadata?.full_name
          || user.user_metadata?.name
          || user.email?.split('@')[0]
          || 'Studio';

        const slug = userName
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          || 'studio';

        await supabase.from('studios').insert({
          id: user.id,
          name: userName,
          slug: slug + '-' + user.id.substring(0, 4),
          email: user.email,
          google_drive_token: providerToken || null,
          google_refresh_token: refreshToken || null,
        });

        // Create subscription
        const { data: freePlan } = await supabase
          .from('plans')
          .select('id')
          .eq('name', 'free')
          .single();

        if (freePlan) {
          await supabase.from('subscriptions').insert({
            studio_id: user.id,
            plan_id: freePlan.id,
            status: 'active',
            billing_cycle: 'free',
          });
        }
      } else if (providerToken) {
        // Update existing studio with new Drive token
        await supabase
          .from('studios')
          .update({
            google_drive_token: providerToken,
            google_refresh_token: refreshToken || null,
          })
          .eq('id', user.id);
      }

      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
