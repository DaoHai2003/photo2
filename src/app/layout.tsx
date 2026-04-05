import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import ThemeProvider from '@/components/providers/ThemeProvider';
import QueryProvider from '@/components/providers/QueryProvider';
import AuthProvider from '@/components/providers/AuthProvider';
import SnackbarProvider from '@/components/providers/SnackbarProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'] });

export const metadata: Metadata = {
  title: 'PhotoShare - Quản lý album ảnh cho studio',
  description: 'Nền tảng quản lý album ảnh, chia sẻ và chọn ảnh cho studio chụp ảnh chuyên nghiệp',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={inter.className} style={{ minHeight: '100vh' }} suppressHydrationWarning>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <SnackbarProvider>
                {children}
              </SnackbarProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
