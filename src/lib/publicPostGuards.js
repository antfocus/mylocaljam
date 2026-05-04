/**
 * publicPostGuards.js — defensive utilities for unauthenticated POST endpoints.
 *
 * Background (security audit, May 2 2026):
 *   The four public POST endpoints — /api/submissions, /api/feedback,
 *   /api/support, /api/reports — accept arbitrary JSON bodies, use the
 *   service-role Supabase client (bypassing RLS), and previously had NO
 *   rate limit and NO length caps on user-supplied strings. A single
 *   attacker could fill the database with multi-MB rows or millions of
 *   short rows in a single afternoon. Audit findings C3 / M4 / M8.
 *
 * What this module provides:
 *   1. enforceRateLimit(request) — per-IP, per-route counter with a
 *      sliding window. Returns null when the request is allowed, or a
 *      NextResponse 429 when the cap is exceeded. Caller short-circuits
 *      by `return rateLimited;`.
 *   2. capString(input, max) — string normalizer. Trims, returns null
 *      for empty / non-string, slices to max chars. Caps every user-
 *      supplied field rather than letting the DB column take whatever
 *      bytes arrive.
 *   3. capEmail(input) — extra validation: format regex + 320-char cap
 *      (the RFC 5321 max for an email address).
 *   4. capUrl(input) — http(s)-only, 1000-char cap. Caller can pass
 *      `optional: true` to allow null.
 *
 * Limitations (be honest):
 *   The rate-limit map is in-memory. On Vercel, each cold-start spawns
 *   a fresh instance with its own map. A determined attacker who notices
 *   this can fan out across N instances and bypass the limit. This is
 *   the "C3 partial" trade-off from the audit — full protection requires
 *   Upstash Redis (`@upstash/ratelimit`). The in-memory version is
 *   defense in depth: enough to stop the casual abuse case, not the
 *   determined attacker. The TODO at the bottom flags the upgrade path.
 */

const WINDOW_MS = 60 * 60 * 1000; // 1 hour rolling window per IP
const ROUTE_CAPS = {
  // Per-IP, per-route POST cap per WINDOW_MS. Tuned generously — a real
  // user submitting feedback after their second show won't trip these,
  // but a script POSTing in a loop will.
  '/api/submissions': 10,
  '/api/feedback':    20,
  '/api/support':     20,
  '/api/reports':     30,
  // Default for anything else that adopts this helper without an entry.
  default:            10,
};

/**
 * Per-(route, ip) hit counter. Map<key, [{at: ms}, ...]>. Each entry is
 * an array of timestamps; we prune entries older than WINDOW_MS at read
 * time. Memory grows linearly with active IPs but the prune keeps the
 * working set bounded.
 */
const hits = new Map();

function clientIpFromRequest(request) {
  // Vercel sets x-forwarded-for; fall back to x-real-ip; final fallback
  // is the literal string "unknown" so the rate-limit still buckets
  // these together rather than using an empty key.
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/**
 * Returns null when the request is within the rate limit. Returns a
 * NextResponse 429 when the cap is exceeded. Designed for direct
 * `return rateLimited;` from the route handler:
 *
 *   const limited = enforceRateLimit(request);
 *   if (limited) return limited;
 *
 * The window is sliding: we count timestamps within the last
 * WINDOW_MS and reject when count >= cap.
 */
export function enforceRateLimit(request, NextResponseModule) {
  const url = new URL(request.url);
  const route = url.pathname;
  const ip = clientIpFromRequest(request);
  const key = `${route}::${ip}`;
  const cap = ROUTE_CAPS[route] ?? ROUTE_CAPS.default;
  const now = Date.now();

  // Read + prune
  const list = hits.get(key) || [];
  const fresh = list.filter(t => now - t < WINDOW_MS);
  if (fresh.length >= cap) {
    // Use the caller's NextResponse (avoids cross-package import quirks).
    return NextResponseModule.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }
  fresh.push(now);
  hits.set(key, fresh);
  return null;
}

/**
 * Trim, validate type, slice to max chars. Returns null for empty or
 * non-string input so callers can safely `|| null` into nullable DB
 * columns without re-checking.
 */
export function capString(input, max = 2000) {
  if (input == null) return null;
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Email format check + 320-char cap (RFC 5321 max). Returns null for
 * anything that doesn't look like an email address.
 */
export function capEmail(input) {
  const s = capString(input, 320);
  if (!s) return null;
  // Deliberately permissive — rejects only the obviously-broken cases.
  // The DB and downstream mailer (Resend) do stricter validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

/**
 * http(s)-only URL with 1000-char cap. Returns null for anything that
 * doesn't parse or uses an unsafe scheme (javascript:, data:, file:,
 * etc.).
 */
export function capUrl(input, max = 1000) {
  const s = capString(input, max);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return s;
}

// TODO (security audit follow-up): replace the in-memory `hits` Map with
// `@upstash/ratelimit` backed by Upstash Redis. The current map resets
// per Vercel cold-start and per-instance, so a determined attacker fan-
// ning across instances can bypass the cap. The full-protection upgrade
// is single-file: swap enforceRateLimit's body to call ratelimit.limit()
// and return 429 on failure.
