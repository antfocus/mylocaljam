#!/usr/bin/env node
/**
 * Diagnostic script: Isolate the "Could not find a relationship" error.
 *
 * This script bypasses Next.js entirely and hits the Supabase PostgREST
 * API directly with the service-role key — same as getAdminClient().
 *
 * Usage:
 *   node scripts/diagnose-fk.mjs
 *
 * Requires .env.local to be loaded (or env vars set):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* no .env.local — rely on environment */ }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const REST_URL = `${SUPABASE_URL}/rest/v1`;

console.log(`\n🔍 FK Diagnostic — ${SUPABASE_URL}\n${'─'.repeat(60)}\n`);

// ── Helper: raw PostgREST fetch ──────────────────────────────────────────────
async function pgrest(path, key, label) {
  const url = `${REST_URL}${path}`;
  console.log(`  URL: ${url.substring(0, 120)}...`);
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }

    if (res.ok) {
      const count = Array.isArray(json) ? json.length : '??';
      console.log(`  ✅ ${label}: HTTP ${res.status}, ${count} rows`);
      if (Array.isArray(json) && json.length > 0) {
        const first = json[0];
        console.log(`     Has event_templates key: ${'event_templates' in first}`);
        if (first.event_templates) {
          console.log(`     event_templates value: ${JSON.stringify(first.event_templates).substring(0, 100)}`);
        }
      }
      return { ok: true, status: res.status, data: json };
    } else {
      console.log(`  ❌ ${label}: HTTP ${res.status}`);
      console.log(`     Error: ${json?.message || json?.error || text.substring(0, 200)}`);
      return { ok: false, status: res.status, error: json?.message || text };
    }
  } catch (e) {
    console.log(`  ❌ ${label}: fetch failed — ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// ── Test 1: Basic select without join (sanity check) ─────────────────────────
console.log('TEST 1: Basic select (no join) — service role key');
await pgrest(
  '/events?select=id,event_title,template_id&status=eq.published&limit=3',
  SERVICE_KEY,
  'Basic select'
);
console.log();

// ── Test 2: Join event_templates — service role key ──────────────────────────
console.log('TEST 2: Join event_templates — service role key');
await pgrest(
  '/events?select=*,event_templates(template_name,bio,image_url,category,start_time,genres)&status=eq.published&limit=3',
  SERVICE_KEY,
  'Service-role join'
);
console.log();

// ── Test 3: Join event_templates — anon key ──────────────────────────────────
console.log('TEST 3: Join event_templates — anon key');
await pgrest(
  '/events?select=*,event_templates(template_name,bio,image_url,category,start_time,genres)&status=eq.published&limit=3',
  ANON_KEY,
  'Anon-key join'
);
console.log();

// ── Test 4: Full select (matching /api/events/route.js exactly) ──────────────
console.log('TEST 4: Full select matching /api/events/route.js');
const eventsSelect = encodeURIComponent('*, venues(name, address, color), artists(name, bio, image_url, genres, vibes, is_tribute), event_templates(template_name, bio, image_url, category, start_time, genres)');
await pgrest(
  `/events?select=${eventsSelect}&status=eq.published&limit=2`,
  SERVICE_KEY,
  'Full /api/events select'
);
console.log();

// ── Test 5: Full select (matching /api/events/search/route.js) ───────────────
console.log('TEST 5: Full select matching /api/events/search/route.js');
const searchSelect = encodeURIComponent('*, venues(name, address, color, photo_url, latitude, longitude, venue_type, tags), artists(name, bio, genres, vibes, is_tribute, image_url), event_templates(template_name, bio, image_url, category, start_time, genres)');
await pgrest(
  `/events?select=${searchSelect}&status=eq.published&limit=2`,
  SERVICE_KEY,
  'Full /api/events/search select'
);
console.log();

// ── Test 6: Check if event_templates table is accessible ─────────────────────
console.log('TEST 6: Direct query on event_templates table');
await pgrest(
  '/event_templates?select=id,template_name,bio,category&limit=3',
  SERVICE_KEY,
  'Direct event_templates query'
);
console.log();

// ── Test 7: Check FK via information_schema ──────────────────────────────────
console.log('TEST 7: Check FK constraint via information_schema');
const fkQuery = encodeURIComponent("constraint_name,table_name,constraint_type");
await pgrest(
  `/information_schema/table_constraints?select=${fkQuery}&table_name=eq.events&constraint_type=eq.FOREIGN KEY`,
  SERVICE_KEY,
  'FK constraints on events table'
);
console.log();

// ── Test 8: Alternative — RPC to check FK ────────────────────────────────────
console.log('TEST 8: Check FK via direct SQL (rpc if available, otherwise skip)');
try {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  console.log(`  RPC endpoint status: ${res.status} (if 404, that's fine — no custom RPCs)`);
} catch (e) {
  console.log(`  RPC check skipped: ${e.message}`);
}
console.log();

// ── Test 9: Use Supabase JS client directly (same path as route.js) ─────────
console.log('TEST 9: Supabase JS client — same code path as search route');
try {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data, error } = await supabase
    .from('events')
    .select('*, venues(name, address, color, photo_url, latitude, longitude, venue_type, tags), artists(name, bio, genres, vibes, is_tribute, image_url), event_templates(template_name, bio, image_url, category, start_time, genres)')
    .eq('status', 'published')
    .order('event_date', { ascending: true })
    .limit(3);

  if (error) {
    console.log(`  ❌ Supabase JS client: ${error.message}`);
    console.log(`     Code: ${error.code}, Details: ${error.details || 'none'}`);
    console.log(`     Hint: ${error.hint || 'none'}`);
  } else {
    console.log(`  ✅ Supabase JS client: ${data.length} rows returned`);
    if (data.length > 0) {
      console.log(`     Has event_templates: ${'event_templates' in data[0]}`);
      console.log(`     event_templates: ${JSON.stringify(data[0].event_templates).substring(0, 100)}`);
    }
  }
} catch (e) {
  console.log(`  ❌ Supabase JS import failed: ${e.message}`);
}
console.log();

// ── Test 10: Check schema cache reload ───────────────────────────────────────
console.log('TEST 10: Trigger schema cache reload via PostgREST');
try {
  // PostgREST exposes a schema cache reload via the /rpc endpoint or
  // we can check the server header for the PostgREST version
  const res = await fetch(`${REST_URL}/`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  });
  const serverHeader = res.headers.get('server') || 'unknown';
  const pgrstVersion = res.headers.get('content-profile') || 'unknown';
  console.log(`  PostgREST server header: ${serverHeader}`);
  console.log(`  HTTP status: ${res.status}`);
} catch (e) {
  console.log(`  Skipped: ${e.message}`);
}

console.log(`\n${'─'.repeat(60)}`);
console.log('\n📋 INTERPRETATION GUIDE:');
console.log('  • If Tests 2-5 ALL fail → PostgREST schema cache issue (FK not detected)');
console.log('  • If Test 2 fails but Test 3 works → Role-specific schema cache issue');
console.log('  • If Tests 2-5 pass but Test 9 fails → Supabase JS client version issue');
console.log('  • If Tests 2-9 ALL pass → The FK and join work. Problem is in Next.js routing.');
console.log('  • If Test 6 fails → event_templates table not accessible (permissions?)');
console.log('  • If Test 1 shows template_id is NULL for all rows → FK exists but no data linked');
console.log();
