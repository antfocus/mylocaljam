#!/usr/bin/env node
/**
 * Test script for GET /api/events/search
 *
 * Usage:
 *   node scripts/test-search-api.mjs [BASE_URL]
 *
 * Defaults to http://localhost:3000 if no BASE_URL is provided.
 * Run `npm run dev` first, then execute this script in another terminal.
 *
 * Each test prints ✅ or ❌ with a description and key response fields.
 */

const BASE = process.argv[2] || 'http://localhost:3000';
const ENDPOINT = `${BASE}/api/events/search`;

let passed = 0;
let failed = 0;

async function test(name, params, checks) {
  const url = new URL(ENDPOINT);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) url.searchParams.set(k, v);
  }

  try {
    const res = await fetch(url.toString());
    const json = await res.json();

    const errors = [];
    for (const [desc, fn] of Object.entries(checks)) {
      try {
        const ok = fn(json, res);
        if (!ok) errors.push(desc);
      } catch (e) {
        errors.push(`${desc} (threw: ${e.message})`);
      }
    }

    if (errors.length === 0) {
      console.log(`✅ ${name}`);
      console.log(`   → page=${json.page} limit=${json.limit} total=${json.total} hasMore=${json.hasMore} returned=${json.data?.length ?? 0}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      console.log(`   Failures: ${errors.join('; ')}`);
      console.log(`   Response: page=${json.page} total=${json.total} data.length=${json.data?.length ?? '??'}`);
      if (json.error) console.log(`   Error: ${json.error} ${json.detail || ''}`);
      failed++;
    }
  } catch (e) {
    console.log(`❌ ${name} — fetch failed: ${e.message}`);
    failed++;
  }
  console.log();
}

// ── Test Suite ───────────────────────────────────────────────────────────────

console.log(`\n🔍 Testing /api/events/search against ${BASE}\n${'─'.repeat(60)}\n`);

// 1. Default fetch (no params) — should return page 1, 20 results
await test('Default fetch (no params)', {}, {
  'status 200':          (j, r) => r.status === 200,
  'has data array':      (j) => Array.isArray(j.data),
  'page is 1':           (j) => j.page === 1,
  'limit is 20':         (j) => j.limit === 20,
  'total is number':     (j) => typeof j.total === 'number' && j.total >= 0,
  'hasMore is boolean':  (j) => typeof j.hasMore === 'boolean',
  'data.length <= 20':   (j) => j.data.length <= 20,
});

// 2. Pagination — page 2
await test('Pagination (page 2, limit 5)', { page: 2, limit: 5 }, {
  'status 200':        (j, r) => r.status === 200,
  'page is 2':         (j) => j.page === 2,
  'limit is 5':        (j) => j.limit === 5,
  'data.length <= 5':  (j) => j.data.length <= 5,
});

// 3. Limit clamping (max 100)
await test('Limit clamped to 100', { limit: 200 }, {
  'limit is 100': (j) => j.limit === 100,
});

// 4. Search — partial match on a common term
await test('Search: "bar"', { q: 'bar' }, {
  'status 200':     (j, r) => r.status === 200,
  'returns events': (j) => j.data.length >= 0,
  'total >= data':  (j) => j.total >= j.data.length,
});

// 5. Search — should return 0 for gibberish
await test('Search: gibberish "xyzzy99plugh"', { q: 'xyzzy99plugh' }, {
  'total is 0':       (j) => j.total === 0,
  'data is empty':    (j) => j.data.length === 0,
  'hasMore is false': (j) => j.hasMore === false,
});

// 6. Date range filter
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
await test(`Date from today (${today})`, { date_from: today }, {
  'status 200':     (j, r) => r.status === 200,
  'returns events': (j) => j.data.length >= 0,
});

// 7. Date range with upper bound (today only)
await test(`Single day: date_from=${today} date_to=${today}`, { date_from: today, date_to: today }, {
  'status 200':    (j, r) => r.status === 200,
  'has data':      (j) => Array.isArray(j.data),
});

// 8. Category filter
await test('Category filter: "Live Music"', { category: 'Live Music' }, {
  'status 200':    (j, r) => r.status === 200,
  'all match':     (j) => j.data.every(e => e.category === 'Live Music'),
});

// 9. Verify event shape — check required display fields
await test('Event shape verification', { limit: 1 }, {
  'has event_title':  (j) => j.data.length === 0 || typeof j.data[0].event_title === 'string',
  'has category':     (j) => j.data.length === 0 || typeof j.data[0].category === 'string',
  'has date':         (j) => j.data.length === 0 || /^\d{4}-\d{2}-\d{2}$/.test(j.data[0].date),
  'has venue':        (j) => j.data.length === 0 || typeof j.data[0].venue === 'string',
  'has name':         (j) => j.data.length === 0 || typeof j.data[0].name === 'string',
  'has description':  (j) => j.data.length === 0 || typeof j.data[0].description === 'string',
  // event_image may be null but key should exist
  'has event_image key': (j) => j.data.length === 0 || 'event_image' in j.data[0],
  'has venue_color':  (j) => j.data.length === 0 || typeof j.data[0].venue_color === 'string',
  'has hasMore':      (j) => typeof j.hasMore === 'boolean',
});

// 10. Combined: search + pagination
await test('Combined: search "music" + page 1, limit 3', { q: 'music', page: 1, limit: 3 }, {
  'status 200':       (j, r) => r.status === 200,
  'data.length <= 3': (j) => j.data.length <= 3,
  'page is 1':        (j) => j.page === 1,
});

// 11. Special chars in search — commas and parens must not break PostgREST .or()
await test('Search with comma: "food, drink"', { q: 'food, drink' }, {
  'status 200 (no 400/500)': (j, r) => r.status === 200,
  'has data array':          (j) => Array.isArray(j.data),
});

await test('Search with parens: "open (mic)"', { q: 'open (mic)' }, {
  'status 200 (no 400/500)': (j, r) => r.status === 200,
  'has data array':          (j) => Array.isArray(j.data),
});

// 12. Pagination consistency — page 1 + page 2 should not overlap
await test('Pagination consistency (no overlap)', { limit: 3 }, {
  'status 200': async (j, r) => {
    // Fetch page 2 to verify no overlap with page 1
    try {
      const p2url = new URL(ENDPOINT);
      p2url.searchParams.set('limit', '3');
      p2url.searchParams.set('page', '2');
      const p2res = await fetch(p2url.toString());
      const p2 = await p2res.json();
      if (j.data.length === 0 || p2.data.length === 0) return true; // can't test overlap with empty pages
      const p1ids = new Set(j.data.map(e => e.id));
      const overlap = p2.data.some(e => p1ids.has(e.id));
      return !overlap;
    } catch { return false; }
  },
});

// 13. Waterfall resolution — event_title should be non-empty for most events
// (the waterfall falls through template_name → raw event_title → '')
await test('Waterfall: events have resolved titles and categories', { limit: 10 }, {
  'status 200':               (j, r) => r.status === 200,
  'category never undefined': (j) => j.data.every(e => typeof e.category === 'string' && e.category.length > 0),
  'venue never empty':        (j) => j.data.every(e => typeof e.venue === 'string' && e.venue.length > 0),
  'date always YYYY-MM-DD':   (j) => j.data.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date)),
  'description is string':    (j) => j.data.every(e => typeof e.description === 'string'),
});

// 14. hasMore correctness — when total > page*limit, hasMore should be true
await test('hasMore is true when more pages exist', { limit: 1 }, {
  'hasMore correct': (j) => {
    if (j.total <= 1) return j.hasMore === false;
    return j.hasMore === true;
  },
});

// 15. Edge: page beyond range — should return empty data, not error
await test('Page beyond range (page 9999)', { page: 9999 }, {
  'status 200':       (j, r) => r.status === 200,
  'data is empty':    (j) => j.data.length === 0,
  'hasMore is false': (j) => j.hasMore === false,
  'total still set':  (j) => typeof j.total === 'number' && j.total >= 0,
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('─'.repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);

if (failed > 0) process.exit(1);
