import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';

type AuthState = {
  user: User | null;
  studio: {
    id: string;
    name: string;
    slug: string;
    logo_path: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    bio?: string | null;
  } | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setStudio: (studio: AuthState['studio']) => void;
  setLoading: (loading: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  studio: null,
  loading: true,
  setUser: (user) => set({ user }),
  setStudio: (studio) => set({ studio }),
  setLoading: (loading) => set({ loading }),
}));
