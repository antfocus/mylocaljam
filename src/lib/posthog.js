'use client';

import posthog from 'posthog-js';

// Singleton init — safe to call multiple times
let initialized = false;

export function initPostHog() {
  if (initialized || typeof window === 'undefined') return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!key) {
    console.warn('[PostHog] Missing NEXT_PUBLIC_POSTHOG_KEY — analytics disabled');
    return;
  }

  posthog.init(key, {
    // Route through Next.js reverse proxy to bypass ad-blockers
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    // Auto-capture clicks, etc.
    autocapture: true,
    // Session recording for UX review
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: false,        // We don't collect passwords — Supabase handles auth
      maskTextSelector: '[data-ph-mask]', // Opt-in masking via data attribute
    },
    // Disable SDK auto-pageview — PostHogProvider handles SPA route changes manually
    capture_pageview: false,
    capture_pageleave: true,
    // Do NOT respect DNT — it hides real traffic from our own analytics dashboard
    respect_dnt: false,
    // Persist across sessions
    persistence: 'localStorage+cookie',
    // Don't load toolbar in prod
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development') {
        ph.debug();
      }
    },
  });

  initialized = true;
}

export { posthog };
