import { useState, useEffect, useRef, useCallback } from 'react';

const BATCH_SIZE = 40;

/**
 * Progressive rendering hook - renders items in batches as user scrolls.
 * Returns visibleItems (subset to render) and a sentinelRef to attach to a
 * bottom-of-list element that triggers loading more.
 */
export function useInfiniteScroll<T>(items: T[], batchSize = BATCH_SIZE) {
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Reset visible count when items change (filter/search/tab switch)
  useEffect(() => {
    setVisibleCount(batchSize);
  }, [items, batchSize]);

  const sentinelCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (!node) return;
      sentinelRef.current = node;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            setVisibleCount((prev) => {
              const next = prev + batchSize;
              return next >= items.length ? items.length : next;
            });
          }
        },
        { rootMargin: '600px' } // Start loading before user reaches bottom
      );
      observerRef.current.observe(node);
    },
    [items.length, batchSize]
  );

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  return { visibleItems, sentinelRef: sentinelCallback, hasMore, totalCount: items.length };
}
