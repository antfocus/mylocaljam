'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initPostHog, posthog } from '@/lib/posthog';

export default function PostHogProvider({ children }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize PostHog on mount
  useEffect(() => {
    initPostHog();
  }, []);

  // Track SPA page views on route change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = window.origin + pathname + (searchParams?.toString() ? `?${searchParams}` : '');
    posthog.capture?.('$pageview', { $current_url: url });
  }, [pathname, searchParams]);

  return children;
}
