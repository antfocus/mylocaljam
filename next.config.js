/** @type {import('next').NextConfig} */

// Security headers — Phase 1 of SECURITY_AUDIT_2026-05-02.md M1.
// Applied to every response (HTML, API, static). The browser caches the
// HSTS policy from any response, so applying it broadly is the right shape.
//
// Phase 2 (Content-Security-Policy) will ship separately in
// `Content-Security-Policy-Report-Only` mode first so we can tune the
// allowlist against real third-party loads (PostHog, Supabase, Google
// Fonts, postimages, scraped CDN images, IPRoyal proxy) before enforcing.
//
// `preload` intentionally NOT set on HSTS — preloading commits the domain
// to never serving HTTP, which is hard to unwind. Easy to add later when
// we're certain the entire surface is HTTPS-only.
const SECURITY_HEADERS = [
  // Lock the browser to HTTPS for 2 years; covers all subdomains.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Block any site from iframing mylocaljam (clickjacking defense).
  { key: 'X-Frame-Options', value: 'DENY' },
  // Force the browser to trust the declared Content-Type. Defends against
  // MIME-sniffing attacks via the upload-image flow.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Outbound clicks send origin only ("https://mylocaljam.com") instead of
  // the full URL with /event/<id> or /artist/<id> in the path. Privacy.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Declare we don't use camera/mic. geolocation=(self) keeps the
  // distance filter working while denying any embed from triggering it.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

const nextConfig = {
  reactStrictMode: true,
  headers: async () => [
    {
      // HTML pages — always revalidate with the server
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      ],
    },
    {
      // Security headers — applied to every route.
      source: '/(.*)',
      headers: SECURITY_HEADERS,
    },
  ],
  // Reverse proxy for PostHog — routes /ingest/* through your own domain
  // so ad-blockers (Brave, Safari ITP, uBlock) don't strip analytics requests
  rewrites: async () => [
    {
      source: '/ingest/static/:path*',
      destination: 'https://us-assets.i.posthog.com/static/:path*',
    },
    {
      source: '/ingest/:path*',
      destination: 'https://us.i.posthog.com/:path*',
    },
    {
      source: '/ingest/decide',
      destination: 'https://us.i.posthog.com/decide',
    },
  ],
};

module.exports = nextConfig;
