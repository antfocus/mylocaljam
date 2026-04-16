/**
 * POST /api/admin/artists/ai-lookup
 * Body: { artistName: string }
 *
 * Thin adapter around `src/lib/aiLookup.js`. The heavy lifting (Perplexity
 * prompts, Serper image search, validation against ALLOWED_GENRES /
 * ALLOWED_VIBES, placeholder carousel) all lives in the lib module so the
 * automatic enrichArtist pipeline and the Magic Wand bulk enrich share one
 * source of truth.
 *
 * This route remains admin-only. `aiLookupArtist` is a pure async function;
 * it does no auth of its own — the gate is here.
 */

import { NextResponse } from 'next/server';
import { aiLookupArtist } from '@/lib/aiLookup';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { artistName } = body || {};

  if (!artistName || !artistName.trim()) {
    return NextResponse.json({ error: 'Artist name is required' }, { status: 400 });
  }

  if (!process.env.PERPLEXITY_API_KEY) {
    return NextResponse.json({ error: 'Perplexity API key not configured' }, { status: 500 });
  }

  try {
    // `autoMode: false` keeps the admin-facing behavior (placeholder carousel
    // when Serper returns nothing) — the auto pipeline overrides to true.
    const result = await aiLookupArtist({ artistName, autoMode: false });
    if (!result) {
      return NextResponse.json({ error: 'AI lookup returned no result' }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('AI lookup error:', err);
    return NextResponse.json(
      { error: 'Failed to reach AI service' },
      { status: 502 }
    );
  }
}
