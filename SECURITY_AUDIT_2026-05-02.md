# myLocalJam Security Audit — May 2, 2026

> **Storage note:** this file lives in the project root for context, but be deliberate about whether you commit it. The audit references file:line locations of weaknesses; if the repo ever flips public, this document gives an attacker a roadmap. If you want to keep it as a working doc but not in version control, add `SECURITY_AUDIT_*.md` to `.gitignore`. If you want history, commit it but redact line numbers.

## Summary

- **22 findings** — 4 Critical, 6 High, 8 Medium, 4 Low
- Files inspected: ~70 (all 50 API routes, supabase client, auth callback, AuthModal, scrapers/martells, scrapers/proxyFetch, vercel.json, next.config.js, .env.local, .gitignore, all 3 migrations, key admin/page.js + components rendering URLs)
- `npm audit`: 5 vulnerabilities (1 critical, 2 high, 2 moderate)
- Audit performed: May 2, 2026

---

## Status as of end of day May 2

### ✅ Shipped today

- **C2** — Admin analytics auth moved from `?password=` URL query param to `Authorization: Bearer` header. Old query-param shape now rejected explicitly so a stale client fails loudly. Files: `src/app/api/admin/analytics/route.js`, `src/app/admin/page.js`.
- **C3 partial** — Per-IP rate limit + length caps + email/URL format validation added to all four unauthenticated POST endpoints. New shared library at `src/lib/publicPostGuards.js`. Files: `src/app/api/submissions/route.js`, `src/app/api/feedback/route.js`, `src/app/api/support/route.js`, `src/app/api/reports/route.js`. **Caveat:** the rate limiter is in-memory, resets per Vercel cold start, per-instance. Determined attackers can fan across instances and bypass. Full Upstash Redis fix is documented as a TODO in the lib.

### ✅ Shipped May 5, 2026 (afternoon session)

- **H4** — `safeHref()` helper at `src/lib/safeHref.js` (URL parse + protocol allowlist of http/https/mailto). Applied at every render-side `<a href>` binding for scraper-emitted URLs (EventCardV2, SiteEventCard, EventPageClient, SavedGigCard, AdminEventsTab, AdminTriageTab, AdminArtistsTab, AdminVenuesScrapers). Replaces the per-site inline `/^https?:\/\//i.test(...)` check pattern with a centralized helper, so future render sites can't forget the check. Also applied at write paths so bad data never enters the DB: `sync-events/route.js mapEvent`, `admin/force-sync/route.js`, `admin/route.js` (POST + PUT), `admin/queue/route.js`, `admin/venues/route.js` (`website` field). Closes the `javascript:` URL XSS class for `events.ticket_link`, `events.source`, and `venues.website`.
- **M1 Phase 1** — Five security headers added in `next.config.js`: `Strict-Transport-Security` (2-year HSTS without preload), `X-Frame-Options: DENY` (clickjacking), `X-Content-Type-Options: nosniff` (MIME-sniff defense for upload-image flow), `Referrer-Policy: strict-origin-when-cross-origin` (privacy on outbound clicks), `Permissions-Policy: camera=() microphone=() geolocation=(self)` (lock down browser APIs). Applied to every route via a second `headers()` entry. **Phase 2 (Content-Security-Policy) still pending** — will ship in `Content-Security-Policy-Report-Only` mode first to tune the third-party allowlist against PostHog, Supabase, Google Fonts, postimages, scraped CDN images, IPRoyal proxy.

### ⏳ Outstanding — requires Tony

- **C1** — Rotate every secret in `.env.local`. Most urgent, especially `ADMIN_PASSWORD` (currently a low-entropy English word, plus already leaked into Vercel access logs via the C2 query-param bug we just fixed). Rotation checklist below.
- **C4** — `npm audit fix --force` to address 1 critical (`protobufjs` RCE) + 2 high (`next` DoS CVEs, `picomatch` ReDoS). Bumps Next to 16.x — budget half a day to test app-router behavior.

### 📋 Outstanding — needs implementation

H1, H2, H3, H4, H5, H6 + 8 mediums + 4 lows. Listed below in full detail.

---

## Rotation checklist (do this tomorrow morning)

For each secret, the pattern is:

1. Go to the service's console, regenerate the key.
2. Copy the new value.
3. Vercel → project → Settings → Environment Variables → edit → paste → save (apply to all environments).
4. Locally: `vercel env pull .env.local` to sync.
5. Restart dev server (`npm run dev`).
6. Redeploy: `vercel --prod` or push a commit.
7. Verify the old key is revoked (most services revoke on rotation; some require manual delete).

### Generate a strong ADMIN_PASSWORD locally:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

Run that in your own terminal — never paste the result into chat or any other ephemeral surface. Use it as the new `ADMIN_PASSWORD`.

### The 12 secrets, ordered by priority

#### 🔴 Highest blast radius

1. **`ADMIN_PASSWORD`** — was a low-entropy word, leaked into access logs. Just update Vercel env (no service to rotate at). Clear browser sessionStorage on `/admin` after.
2. **`SUPABASE_SERVICE_ROLE_KEY`** — full DB bypass. Console: https://supabase.com/dashboard/project/ugmyqucizialapfulens/settings/api. Click "Reveal" on `service_role` → "Regenerate". Old key revoked immediately. Don't paste into `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. **`POSTHOG_PERSONAL_API_KEY`** — account-level scope. Console: https://us.posthog.com/settings/user-api-keys. Delete + recreate as a **Project API Key** (not Personal) with read-only scope.

#### 🟠 High-value automation keys

4. **`CRON_SECRET`** — anyone with this can manually trigger sync-events + global notification purge. No service to rotate at; just generate another `openssl rand -hex 32` and update Vercel.
5. **`VERCEL_OIDC_TOKEN`** — auto-rotated by Vercel on deploys. Will refresh on the next production deploy after the other rotations.

#### 🟡 Paid API keys

6. **`PERPLEXITY_API_KEY`** — https://www.perplexity.ai/settings/api
7. **`GOOGLE_AI_KEY`** — https://aistudio.google.com/apikey
8. **`RESEND_API_KEY`** — https://resend.com/api-keys (one-shot, save it on creation)
9. **`SERPER_API_KEY`** — https://serper.dev/api-key
10. **`TICKETMASTER_API_KEY`** — https://developer.ticketmaster.com/user/me/apps → "Reset Consumer Key/Secret"
11. **`IPROYAL_PROXY_PASS`** — https://dashboard.iproyal.com/proxies → "Change credentials"
12. **`LASTFM_API_KEY`** — https://www.last.fm/api/accounts (lower priority — read-only on public artist data)

### After all 12 are done

```bash
cd ~/Documents/mylocaljam
vercel env pull .env.local
git status                  # confirm .env.local is gitignored
npm run dev                 # restart to pick up new vars
vercel --prod               # ship a fresh deploy
```

### Verify

- Visit `/admin` → log in with the new ADMIN_PASSWORD → it should work.
- Trigger a sync manually or wait for the next cron → check logs for any 401/403 from Supabase or third parties (would mean an old key is still wired up).

### Defensive followups

- Run `gitleaks` over the full repo + history once to confirm nothing else slipped:
  ```bash
  brew install gitleaks
  gitleaks detect --source ~/Documents/mylocaljam --verbose
  ```
- Don't keep `.env.local` long-term. Pull only when you need to test locally; delete after. Vercel env is the source of truth.

---

## All 22 findings, in full detail

### 🔴 CRITICAL

#### C1: `.env.local` contains live secrets, plus the admin password is a low-entropy English word

**File:** `.env.local` (lines 1-22)
**Why it's a problem:** The local file holds live credentials in plaintext for: `SUPABASE_SERVICE_ROLE_KEY` (full DB bypass), `ADMIN_PASSWORD` (single shared admin auth), `CRON_SECRET`, `GOOGLE_AI_KEY`, `IPROYAL_PROXY_PASS`, `LASTFM_API_KEY`, `PERPLEXITY_API_KEY`, `RESEND_API_KEY`, `SERPER_API_KEY`, `TICKETMASTER_API_KEY`, `POSTHOG_PERSONAL_API_KEY`, and a long-lived `VERCEL_OIDC_TOKEN` JWT. `.gitignore` does protect `.env.local` (verified — `git log` shows no commits ever included it), but the file is permission `600` and on macOS may be syncing through other tools. The current `ADMIN_PASSWORD` is a low-entropy English word, brute-forceable in <1 day. Anyone with the local file = total control.
**Fix:** Rotate every secret per the checklist above. Use a 32-byte random `ADMIN_PASSWORD`. Treat Vercel env as the source of truth; pull `.env.local` only when needed for local dev.

#### C2: Admin password sent as URL query parameter — leaks into Vercel access logs, browser history, Referer

**Status:** ✅ Fixed today.
**Files:** `src/app/api/admin/analytics/route.js`, `src/app/admin/page.js`.

#### C3: Submissions / feedback / support / reports are unauthenticated, unrate-limited, and use the service-role client

**Status:** ✅ Partial fix shipped today (per-IP rate limit + length caps + format validation). In-memory limiter; bypassable across Vercel cold-starts/instances.
**Files:** `src/app/api/submissions/route.js`, `src/app/api/feedback/route.js`, `src/app/api/support/route.js`, `src/app/api/reports/route.js`, plus new shared lib `src/lib/publicPostGuards.js`.
**Remaining work:** Move to Upstash Redis-backed rate limiter (`@upstash/ratelimit`) for cross-instance protection. Add captcha (Cloudflare Turnstile or hCaptcha) on each form for bot resistance.

#### C4: Critical `protobufjs` RCE + High `next` DoS — `npm audit` reports 1 critical, 2 high

**Files:** `package.json` deps; `npm audit` output
**Why it's a problem:** `protobufjs <7.5.5` has GHSA-xq3m-2v4x-88gg (CVSS 9.8 arbitrary code execution, transitive). `next ^14.2.0` is missing several CVEs including GHSA-q4gf-8mx6-v5v3 (DoS via Server Components, CVSS 7.5) and GHSA-h25m-26qc-wcjf (HTTP request deserialization DoS, CVSS 7.5). `picomatch` ReDoS (high). `dompurify` four moderate XSS bypasses. `postcss` XSS via stringify.
**Fix:** `npm audit fix --force` will bump Next to 16.x (semver-major; budget a half-day to test app-router behavior); manually `npm i protobufjs@latest` in any path that pulls it. Test build before deploying. Do this within the week.

---

### 🟠 HIGH

#### H1: Admin gate is a single shared password with no rotation, no per-user attribution, persisted in `sessionStorage`

**Files:** `src/app/admin/page.js:73-80, 85`; every `src/app/api/admin/**/route.js` checks `Authorization: Bearer ${process.env.ADMIN_PASSWORD}`
**Why it's a problem:** If the password leaks once (file access, network sniffing, accidentally shared screenshot), there's no way to rotate without coordinating across every admin who has it. No audit trail of which admin did what. `sessionStorage` access is XSS-readable — any XSS on `/admin` fully owns the system.
**Fix:** Move admin auth to Supabase Auth + a `profiles.role = 'admin'` flag. Every admin endpoint validates `session.user.id` is in an admin allowlist. As a stopgap until then, raise the password to 32-byte random (✅ done if you complete C1 rotation), stop persisting in sessionStorage (force re-entry per session), and add Cloudflare/Vercel WAF rate-limiting on `/api/admin/*`.

#### H2: SSRF via admin upload-image endpoint — fetches arbitrary URL with no host allowlist

**File:** `src/app/api/admin/upload-image/route.js:49-61`
**Why it's a problem:** Admin POSTs `{image: "https://attacker.com/..."}` (or `http://169.254.169.254/latest/meta-data/`, `http://127.0.0.1:8080`, etc.) and the server `fetch()`es it from inside Vercel's runtime, then re-hosts the response bytes in your Supabase storage bucket. The 10s timeout and 10MB cap are mitigations but an attacker who steals admin password also gets inside-network fetches. Also no `redirect: 'manual'` — a redirect from `https://evil.com` → `http://169.254.169.254/...` would bypass an `https`-only check.
**Fix:** Resolve the hostname, reject any IP in private ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, fc00::/7, ::1, link-local). Set `redirect: 'manual'` and re-validate after each hop. Optionally restrict to a venue/Postimages allowlist.

#### H3: Service-role client used in public, unauthenticated GETs — bypassing all RLS for read paths

**Files:** `src/app/api/events/route.js:9` (public hero); `src/app/api/events/search/route.js`; `src/app/api/spotlight/route.js:61` (public GET branch); `src/app/api/submissions/mine/route.js:12` (mislabeled — returns globally-recent, not user-scoped); `src/app/api/geocode-venues/route.js:83` (public GET); `src/app/api/feedback/route.js:20`; `src/app/api/reports/route.js:7`
**Why it's a problem:** Read paths written against `getAdminClient()` ignore RLS, meaning any future migration that depends on RLS to gate a column is silently bypassed. `submissions/mine` is mislabeled — it pulls the 10 most recent submissions for ANY user; submitter emails could appear in public response if a future SELECT change widens the column list.
**Fix:** Use the anon client for public reads and rely on RLS policies. Audit each table to ensure SELECT policies are explicit (e.g. `status='published'`). Rename `submissions/mine` to `submissions/recent` (or actually filter by `auth.uid()` if it's meant to be per-user).

#### H4: `events.ticket_link` / `events.source` originate from scrapers and are rendered as `<a href>` — `javascript:` URL XSS feasible

**Status:** ✅ Fixed May 5, 2026.
**Helper:** `src/lib/safeHref.js` (URL parse + http/https/mailto allowlist).
**Render sites updated:** `EventCardV2.js`, `SiteEventCard.js`, `EventPageClient.js`, `SavedGigCard.js`, `AdminEventsTab.js`, `AdminTriageTab.js`, `AdminArtistsTab.js`, `AdminVenuesScrapers.js`.
**Write sites updated:** `sync-events/route.js mapEvent`, `admin/force-sync/route.js`, `admin/route.js` POST + PUT, `admin/queue/route.js`, `admin/venues/route.js` (`website` field).
**Original finding:** `validateUrl()` in `src/app/api/admin/route.js` only ran on image fields. The scraper pipeline wrote `ticket_link` / `source` directly via `mapEvent()` with no scheme validation, so a malicious venue page publishing `<a href="javascript:fetch(...)">` could be scraped and rendered. `target="_blank" rel="noopener noreferrer"` doesn't block `javascript:` execution.

#### H5: `flag-event` is in-memory rate-limited per Vercel instance — trivially bypassed

**File:** `src/app/api/flag-event/route.js:14-39`
**Why it's a problem:** Vercel scales horizontally; `flagLog` Map resets on every cold start AND each instance has its own. A bot pinging from N IPs across M instances bypasses the limit. Also no daily cap — an attacker can crank `cancel_flag_count` over time to make legitimate events appear cancelled in admin's review queue.
**Fix:** Move to Upstash Redis-backed rate limiter keyed on `(ip, event_id)`. Add a hard cap on `cover_flag_count` / `cancel_flag_count` at the DB level, and require auth on flag-event (logged-in users only) to anchor to a user_id rather than IP.

#### H6: Supabase session in `localStorage` — XSS reads the user's auth token

**Files:** `src/lib/supabase.js:7` uses default `createClient` config; `src/lib/posthog.js:37`
**Why it's a problem:** Supabase JS defaults to `localStorage` for the session. Any XSS on `mylocaljam.com` (and there's no CSP — see M1) exfiltrates the JWT, allowing the attacker to act as that user from anywhere until token expiry (1h default, but refresh token in same store extends it indefinitely).
**Fix:** Switch to Supabase server-side auth with cookies (`@supabase/ssr` package, sets `httpOnly` cookies), or at minimum add a strict CSP (M1). The existing `getAuthClient(request)` pattern in API routes already supports cookie-based session retrieval.

---

### 🟡 MEDIUM

#### M1: No security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy, Referrer-Policy, CSP)

**Status:** ✅ Phase 1 shipped May 5, 2026 (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy in `next.config.js`). ⏳ Phase 2 (CSP) pending — needs Report-Only rollout.
**File:** `next.config.js:4-11` — previously only `Cache-Control`.
**Why it's a problem:** Site was clickjackable (any iframe), Referer leaked full URLs on every outbound click, no HSTS, MIME-sniffing, no CSP to mitigate H6.
**Fix:** Add a headers block in `next.config.js`:
```js
{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
{ key: 'X-Frame-Options', value: 'DENY' },
{ key: 'X-Content-Type-Options', value: 'nosniff' },
{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
{ key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
{ key: 'Content-Security-Policy', value: "default-src 'self'; img-src 'self' https: data:; ..." }
```

#### M2: PostHog `POSTHOG_PERSONAL_API_KEY` (server admin scope) used in admin analytics

**Files:** `.env.local:21`, `src/app/api/admin/analytics/route.js:9`
**Why it's a problem:** Personal API Key has account-level scope — can read every project, create exports, modify dashboards. The endpoint that uses it (`/api/admin/analytics`) was gated by C2's leakable password until today's fix.
**Fix:** Replace with a Project API Key scoped to the read-only project. Or proxy through the PostHog Insights API with a narrower token. Rotate the current personal key now.

#### M3: AI-enhance + image-search + ocr-flyer endpoints have no per-admin or per-IP rate limit — quota burn DoS

**Files:** `src/app/api/admin/ai-enhance/route.js`, `src/app/api/admin/venues/image-search/route.js`, `src/app/api/admin/ocr-flyer/route.js`
**Why it's a problem:** Each call hits paid APIs (Perplexity ~$5/1000 reqs, Gemini, Serper $0.30/1000, Resend). If admin password leaks, a script can burn the monthly budget in minutes. No `maxDuration` on ai-enhance either.
**Fix:** Add Upstash rate limit `5/min` per route; alert on quota exhaustion via Resend or PostHog event.

#### M4: Submissions / feedback `email` field — partly addressed today

**Status:** ✅ Format validation + length cap added today via `capEmail()`. M4 is now closed for these endpoints.
**Files:** `src/app/api/submissions/route.js`, `src/app/api/feedback/route.js`, `src/app/api/support/route.js`.

#### M5: `flag-event` race condition — read-then-update increment is non-atomic

**File:** `src/app/api/flag-event/route.js:75-91`
**Why it's a problem:** `SELECT count → UPDATE count+1` race: two concurrent flags both read `n`, both write `n+1` → off-by-one.
**Fix:** Use a Postgres function `increment_flag(event_id uuid, col text)` returning the new value, or `supabase.rpc('increment', ...)` with a `RETURNING` clause.

#### M6: `events/search` uses raw user query in `.or(...ilike...)` — escape function strips only `[,()*]`

**Files:** `src/app/api/admin/route.js:192`, `src/app/api/events/search/route.js`, `src/app/api/spotlight/route.js:283`
**Why it's a problem:** PostgREST `.or()` filter strings interpolate user input. The escape `searchTerm.replace(/[,()*]/g, ' ')` misses `\`, `:`, `.`, and unicode lookalike commas. Substring ILIKE is largely benign, but an attacker can craft a query that breaks PostgREST.
**Fix:** Use a parameterized Postgres function (`supabase.rpc('search_events', { query })`) or move to `tsquery`. At minimum add `:` and `\` to the strip-list and length-cap to 50.

#### M7: `submissions/mine` returns globally-recent submissions, no auth

**File:** `src/app/api/submissions/mine/route.js:11`
**Why it's a problem:** Endpoint name implies user-scoped data, but returns globally-recent submissions with no auth. Anyone can scrape recent submission contents.
**Fix:** Add Supabase session check, scope to `submitter_email = session.user.email`, or rename and confirm intent.

#### M8: Production stack traces leak via error responses

**Status:** ✅ Partial fix shipped today — submissions, feedback, support, reports POST now return generic messages (`'Submission failed'`) and only log details server-side.
**Files still leaking `err.message`:** `src/app/api/admin/upload-image/route.js:87`, `src/app/api/admin/ai-enhance/route.js:188`, `src/app/api/admin/migrate-base64/route.js:35`, `src/app/api/admin/analytics/route.js:255`, `src/app/api/sync-events/route.js` (multiple).
**Fix:** In production, return generic `{ error: 'Internal Server Error' }` and `console.error(err)` server-side. Drop the `?debug=1` mode in analytics or gate it on `process.env.NODE_ENV !== 'production'`.

---

### 🟢 LOW

#### L1: Hardcoded API key in scraper source

**File:** `src/lib/scrapers/martells.js:10` — `const API_KEY = '...';`
**Why it's a problem:** Timely calendar widget public API key is in source (and presumably git history). If this key has any rate quota or write permissions on the Timely side it's now public on GitHub. Comment says it's "embedded in the Timely calendar widget" — likely intended public, but worth confirming.
**Fix:** Move to env var if non-public; otherwise add a comment confirming it's a public widget key.

#### L2: `auth/callback` route logs full error message to redirect URL

**File:** `src/app/auth/callback/route.js:43-46`
**Why it's a problem:** `?auth_error=${err?.message}` may include internal Supabase error codes; reveals more than necessary to an attacker probing failure modes.
**Fix:** Map known error classes to user-friendly strings; log details server-side only.

#### L3: PKCE flow OK, but no app-level state validation on Google OAuth

**File:** `src/components/AuthModal.js:108-113`, `src/app/auth/callback/route.js:36-39`
**Why it's a problem:** Supabase JS handles PKCE state in the verifier cookie which is fine. No app-level CSRF token on the callback — relies entirely on Supabase's PKCE. Good enough for now; flagged so it's not forgotten if you ever switch to a manual OAuth flow.
**Fix:** Document the dependency on `@supabase/supabase-js` for PKCE in code comments.

#### L4: `purgeExpiredNotifications` deletes globally, no scope; admin client has full rights

**File:** `src/app/api/notify/route.js:18-30`
**Why it's a problem:** Wide-open `DELETE FROM notifications WHERE created_at < cutoff`. Not exploitable today but the cron secret is critical (C1) — anyone with the secret can invoke `?trigger=tracked_show` and trigger the global delete + email blast.
**Fix:** Defense in depth — wrap in a transaction with a row-count sanity cap (e.g., `LIMIT 100000`) so a misconfigured cutoff doesn't nuke active rows.

---

## Endpoint inventory

| Route | Methods | Auth | Input validation | Risk notes |
|---|---|---|---|---|
| `/api/admin/route.js` (events) | GET/POST/PUT/DELETE | Bearer ADMIN_PASSWORD | Bio capped 500, URLs validated http(s), .or escape | Service role; admin gated |
| `/api/admin/venues` | POST/PUT/DELETE | Bearer ADMIN_PASSWORD | Whitelisted fields, time regex, FK pre-check | Good shape |
| `/api/admin/ai-enhance` | POST | Bearer ADMIN_PASSWORD | Requires artist_name | M3 quota DoS |
| `/api/admin/ocr-flyer` | POST | Bearer ADMIN_PASSWORD | image_url required | M3 quota DoS |
| `/api/admin/upload-image` | POST | Bearer ADMIN_PASSWORD | base64 OR https URL, 10MB cap | H2 SSRF |
| `/api/admin/migrate-base64` | POST | Bearer ADMIN_PASSWORD | none on body | maxDuration 60s |
| `/api/admin/analytics` | GET | **Bearer ADMIN_PASSWORD** ✅ | range/env strings | C2 fixed today |
| `/api/admin/llm-diag` | POST | Bearer ADMIN_PASSWORD | name optional | M3 quota |
| `/api/admin/force-sync` | POST | Bearer ADMIN_PASSWORD | scraper_key allowlist | OK |
| `/api/admin/queue` | GET/POST | Bearer ADMIN_PASSWORD | submission_id required | OK |
| `/api/admin/pending-enrichments/[id]/approve` | POST | Bearer ADMIN_PASSWORD | Whitelisted FIELD_MAP | OK |
| `/api/admin/venues/image-search` | POST | Bearer ADMIN_PASSWORD | name req, host denylist | OK |
| `/api/admin/*` (others) | various | Bearer ADMIN_PASSWORD | varies | All hit service-role DB |
| `/api/sync-events` | POST | Bearer CRON_SECRET or SYNC_SECRET | shard/tier allowlist | OK |
| `/api/notify` | GET/POST | Bearer CRON_SECRET or SYNC_SECRET | trigger string | L4 wide delete |
| `/api/enrich-artists` | POST/GET | Bearer SYNC_SECRET | dry boolean | OK |
| `/api/follows` | GET/POST/DELETE/PATCH | Supabase session | artist_name required | Good — scoped to user.id |
| `/api/saved-events` | GET/POST/DELETE | Supabase session | event_id required | Good — scoped to user.id |
| `/api/notifications` | GET/PATCH/DELETE | Supabase session | ids array or all | Good |
| `/api/notification-prefs` | GET/PATCH | Supabase session | typeof boolean check | OK |
| `/api/auth/callback` | GET | Supabase exchangeCode | code from URL | L2 error leak |
| `/api/events` (public hero) | GET | None (service role) | none | H3 — uses admin client |
| `/api/events/search` | GET | None (service role) | q, page caps, .or escape | H3 + M6 |
| `/api/spotlight` | GET (public), POST/DELETE (admin) | none / Bearer | date required | H3 |
| `/api/geocode-venues` | GET (public), POST (admin) | none / Bearer | none | H3 |
| `/api/submissions` | POST | **None + rate limit + caps** ✅ | Length-capped, image_url validated | C3 partial fix today |
| `/api/submissions` | GET | Bearer ADMIN_PASSWORD | none | OK |
| `/api/submissions/mine` | GET | None | none | M7 mislabeled |
| `/api/feedback` | POST | **None + rate limit + caps** ✅ | type allowlist, email format | C3 partial fix today |
| `/api/feedback` | GET | Bearer ADMIN_PASSWORD | none | OK |
| `/api/support` | POST | **None + rate limit + caps** ✅ | rating-or-message, category allowlist | C3 partial fix today |
| `/api/reports` | POST | **None + rate limit + caps** ✅ | event_id, issue_type allowlist | C3 partial fix today |
| `/api/reports` | PUT/GET | Bearer ADMIN_PASSWORD | id + status enum | OK |
| `/api/flag-event` | POST | None + in-mem rate limit | event_id, flag_type enum | H5 race + bypass |

---

## Coverage notes

1. **Secrets and env vars:** 4 findings (C1, C2, M2, L1). Inspected: `.env.local`, `.env.local.example`, `.gitignore`, `vercel.json`, `next.config.js`, `git log --all --full-history -- .env*` (no historical commits). Verified `.env.local` is gitignored. Grepped for `eyJ`, `sk_`, `service_role` — only legitimate uses found.
2. **Authentication:** 4 findings (H1, H6, L2, L3). Inspected: `src/lib/supabase.js`, `src/components/AuthModal.js`, `src/app/auth/callback/route.js`, `src/app/admin/page.js`, all `getAuthClient` patterns in API routes (`follows`, `saved-events`, `notifications`, `notification-prefs`).
3. **Database / RLS:** 1 finding (H3). Inspected: 3 migration files in `supabase/migrations/`. Only `event_series` migration enables RLS — others rely on PostgREST defaults. **No live RLS policy dump performed** — would need MCP supabase access. All user-scoped endpoints (follows, saved-events, notifications) DO scope by `session.user.id` — verified.
4. **Scrapers:** 1 finding (H2 covers SSRF on admin upload). Other scrapers: hardcoded URLs in source files (no user-input fetching at scrape time). Cron throttled. URL allowlist is implicit per-scraper. No `dangerouslySetInnerHTML` rendering scraped HTML — sanitization is moot. Bio length capped at 500. Checked `martells.js`, `proxyFetch.js`.
5. **API endpoints:** Coverage matrix above.
6. **Client-side:** 1 finding (H4 — javascript: URL risk on `href`). 0 `dangerouslySetInnerHTML` instances anywhere. All `target="_blank"` audited — every one carries `rel="noopener noreferrer"`. Inspected: `EventCardV2.js`, `SiteEventCard.js`, `EventPageClient.js`, `SavedGigCard.js`, `AdminEventsTab.js`, `AdminTriageTab.js`, `AdminVenuesScrapers.js`, `AdminArtistsTab.js`, `admin/queue/page.js`.
7. **Dependencies:** 1 critical (`protobufjs`), 2 high (`next`, `picomatch`), 2 moderate (`dompurify`, `postcss`). See C4. `npm audit fix --force` resolves all but requires Next 16 major bump.
8. **Deployment:** 1 finding (M1 — no security headers). Configs: `next.config.js`, `vercel.json`. No middleware. HTTPS enforced by Vercel default. `?debug=1` query param on analytics leaks config (M8).

### Things the audit couldn't determine without live DB access

- Which Supabase tables actually have RLS enabled and what the policies look like. The migrations only show `event_series` getting RLS turned on. Recommend running the supabase MCP `list_tables` and `get_advisors` for a real RLS map before tackling H3.
- Whether `submissions.submitter_email` is exposed via any current SELECT path that would surface it to other users.

---

## Suggested action plan

### Tomorrow (you, manually): C1 rotations

Walk through the rotation checklist above. Highest-value/lowest-cost fix in the report.

### This week (1-2 days of work):

- **C4** — `npm audit fix --force` + test (Next 16.x upgrade is the risky bit)
- **H2** — SSRF allowlist on `/api/admin/upload-image`
- **H4** — `safeHref()` helper + apply to every scraper-output `<a href>` render
- **M1** — security headers in `next.config.js`
- **M8** — drop bare `err.message` from production responses

### Next 2 weeks:

- **C3 full** — Upstash Redis rate limit + captcha on the 4 public POSTs
- **H1** — Migrate admin auth to Supabase Auth + role allowlist (kills shared-password problem)
- **H3** — Switch public reads to anon client + audit RLS policies
- **H5** — Upstash for `flag-event` rate limit + DB-level cap on flag counts

### Defer / later:

- **H6** — Move Supabase session to httpOnly cookies via `@supabase/ssr`
- **M3** — Rate-limit AI/OCR endpoints + quota alerts
- **M5, M6, M7** — minor hardening
- **L1-L4** — cleanup pass

---

## Files changed during May 2 fix session

```
src/app/api/admin/analytics/route.js              C2 — Bearer auth
src/app/admin/page.js                             C2 — Bearer auth client
src/lib/publicPostGuards.js                       C3 — new shared lib
src/app/api/submissions/route.js                  C3 — rate limit + caps
src/app/api/feedback/route.js                     C3 — rate limit + caps
src/app/api/support/route.js                      C3 — rate limit + caps
src/app/api/reports/route.js                      C3 — rate limit + caps
```

---

*Generated as part of the May 2, 2026 security audit session.*
