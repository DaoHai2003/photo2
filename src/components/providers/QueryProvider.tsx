'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // OPTIMIZE: tăng stale time → ít refetch → giảm lag.
            // 5 phút stale: data hiển thị instant từ cache, fetch nền chỉ
            // khi user thực sự cần fresh data.
            staleTime: 5 * 60 * 1000,
            // Cache giữ trong memory 10 phút sau khi không còn observer.
            gcTime: 10 * 60 * 1000,
            retry: 1,
            // Tắt auto refetch khi user focus tab (gây lag khi switch tab).
            refetchOnWindowFocus: false,
            // Vẫn refetch khi mount (để load mới cho first paint).
            refetchOnMount: true,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
