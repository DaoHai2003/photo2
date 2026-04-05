'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setStudio, setLoading } = useAuthStore();

  useEffect(() => {
    const supabase = createClient();

    const fetchStudio = async (userId: string) => {
      const { data } = await supabase
        .from('studios')
        .select('id, name, slug, logo_path, email, phone, address, bio')
        .eq('id', userId)
        .single();
      if (data) setStudio(data);
    };

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) fetchStudio(user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setUser(user);
      if (user) fetchStudio(user.id);
      else setStudio(null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [setUser, setStudio, setLoading]);

  return <>{children}</>;
}
