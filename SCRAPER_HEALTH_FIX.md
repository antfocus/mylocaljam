# Scraper Health Status Not Updating (Root Cause & Fix)

**Date:** April 19, 2026
**Symptom:** Admin panel Venues tab shows "FAIL" for scrapers that actually ran successfully. Status, event counts, and last_sync timestamps appear stale or frozen.

---

## Root Cause: Next.js Data Cache

Next.js automatically caches all `fetch()` calls made in server-side code (API routes, server components). The Supabase JS client uses `fetch()` internally for every query. This means:

1. Force-sync runs a scraper and writes "success" to `scraper_health` -- this **succeeds** in the database.
2. The admin panel calls `/api/admin/scraper-health` to read the table -- but Next.js returns a **cached response** from a previous `fetch()`, so the UI shows old data.
3. Even the force-sync route's own reads (e.g., checking if a row exists before updating) returned stale cached data, making the behavior unpredictable.

**The data was always correct in the database.** The problem was entirely in the read path -- Next.js served stale cached query results instead of hitting Supabase.

## The Fix

One line in `src/lib/supabase.js` -- disable the Next.js Data Cache on the admin Supabase client:

```javascript
export function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, serviceRoleKey, {
    global: {
      fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}
```

The key part is `cache: 'no-store'` -- this tells Next.js to never cache the Supabase client's internal fetch calls.

## If This Happens Again

**Symptoms to look for:**
- Admin panel shows stale data (old timestamps, wrong status) even after a successful sync
- Force-sync API response says `"ok": true` with correct event counts, but the UI doesn't reflect it
- Querying the database directly (via Supabase MCP or dashboard) shows the correct data

**Diagnostic steps:**

1. **Check the database directly.** Use the Supabase MCP or dashboard to query `scraper_health`:
   ```sql
   SELECT scraper_key, status, events_found, last_sync
   FROM scraper_health
   WHERE scraper_key = 'BakesBrewing'
   ORDER BY last_sync DESC;
   ```
   - Production project ID: `ugmyqucizialapfulens`
   - Staging project ID: `arjswrmsissnsqksjtht`
   - `.env.local` points to **staging**, deployed Vercel app uses **production**

2. **If the DB has correct data but the UI doesn't** -- it's a caching issue. Verify that `getAdminClient()` in `src/lib/supabase.js` still has `cache: 'no-store'` in its fetch config.

3. **If the DB also has stale data** -- check for missing columns. The `scraper_health` table must have all columns that the upsert payload includes. A missing column causes the entire upsert to silently fail. Current required columns: `scraper_key`, `venue_name`, `website_url`, `platform`, `events_found`, `status`, `error_message`, `last_sync`, `last_sync_count`.

## Related Gotchas

- **Supabase MCP `execute_sql` does NOT commit changes.** All INSERT/UPDATE/DELETE/ALTER operations run in a transaction that rolls back. Use `apply_migration` for DDL changes that need to persist.
- **`.env.local` points to staging.** Always use the production project ID (`ugmyqucizialapfulens`) when debugging prod issues via the Supabase MCP.
- **`scraper_health` has a unique index on `scraper_key`.** This prevents duplicate rows. The upsert uses `onConflict: 'scraper_key'`.
- **RLS is enabled on `scraper_health` with no policies.** Only the service_role key (used by `getAdminClient()`) can read/write. The anon key cannot.
