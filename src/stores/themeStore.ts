import { create } from 'zustand';

type ThemeMode = 'light' | 'dark';

type ThemeState = {
  mode: ThemeMode;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  mode: (typeof window !== 'undefined' ? (localStorage.getItem('ps_theme') as ThemeMode) : null) || 'light',
  toggleMode: () =>
    set((state) => {
      const newMode = state.mode === 'light' ? 'dark' : 'light';
      if (typeof window !== 'undefined') localStorage.setItem('ps_theme', newMode);
      return { mode: newMode };
    }),
  setMode: (mode) => {
    if (typeof window !== 'undefined') localStorage.setItem('ps_theme', mode);
    set({ mode });
  },
}));
