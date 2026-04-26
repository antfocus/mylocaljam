import { NextResponse } from 'next/server';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// Must stay in sync with VIBES in src/lib/utils.js
// This route enhances EVENTS, so all 4 vibes apply (including Outdoor / Patio).
// For ARTIST-only vibes, see ARTIST_VIBES in utils.js (excludes Outdoor / Patio).
const ALLOWED_VIBES = ['Chill / Low Key', 'Energetic / Party', 'Outdoor / Patio', 'Family-Friendly'];

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { artist_name, venue_name, event_date, genre, current_description } = await request.json();

  if (!artist_name) {
    return NextResponse.json({ error: 'Artist name is required' }, { status: 400 });
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Perplexity API key not configured' }, { status: 500 });
  }

  // Build context for the prompt
  const dateStr = event_date
    ? new Date(event_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  // ── Description tone contract (user-authored, April 14, 2026) ──────────
  // This block is the SOURCE OF TRUTH for the "bio" field. If a future
  // editor wants to tweak it, keep the banned-word list and the example
  // intact — they're what keeps the model off the flowery-marketing rails.
  const descriptionContract = `You are a local event data curator. Your job is to write clear, factual, and informative event descriptions. You are writing for locals who want to know what the vibe is, what is happening, and what to expect.

STRICT CONSTRAINTS:
- NO marketing hyperbole or flowery language.
- NEVER use words like: 'Dive into', 'vibrant', 'savor', 'thrill', 'immersive', 'moody glow', 'flickering', 'dance'.
- Focus on facts: Crowd type, venue style (e.g., sports bar, acoustic, dive), event sequence, and atmosphere.
- Keep it strictly between 2 to 4 sentences.

EXAMPLE OF PERFECT OUTPUT:
Input: Tuesday BOGO Burger night at River Rock
Output: The Tuesday BOGO burger night at River Rock is a high-energy, social event that draws a large local crowd for dining and competitive trivia. The atmosphere is lively and casual, blending a classic sports bar vibe with scenic marina views from the indoor dining area. As the night progresses, the energy shifts from a busy dinner rush to an engaging Quizzoholics Trivia session where teams fill the bar to compete for prizes.

Now, write the description for the provided event using this exact factual, grounded tone.`;

  const prompt = `${descriptionContract}

You will return a JSON object with the following fields. ONLY the "bio" field is governed by the tone contract above — the other fields remain classification tasks.

1. "bio" — The event description. Follow the STRICT CONSTRAINTS above to the letter. 2 to 4 sentences. No banned words. Facts over feelings.
2. "genre" — The artist's primary genre. Pick ONE from this list: Rock / Alternative, Yacht Rock / Surf, R&B / Soul / Funk, Country / Americana, Pop / Top 40, Acoustic / Singer-Songwriter, Jazz / Blues, Reggae / Island, Jam / Psych, Metal / Hardcore, Punk / Ska, Hip-Hop / Rap, Electronic / DJ, Latin / World, Tributes / Covers. If unsure, use the closest match.
3. "vibe" — The likely event atmosphere. Pick ONE from: ${ALLOWED_VIBES.join(', ')}. "Vibe" describes the venue experience (energy level, crowd atmosphere), NOT the artist's genre. A jazz trio at a wine bar is "Chill / Low Key". A jazz trio at a street festival is "Energetic / Party".
4. "image_search_query" — A Google Image search query that would find a photo of this specific artist or band. Use the artist name plus terms like "band", "live", or "musician" to get relevant results. Example: "The Wallflowers band" or "DJ Jazzy Jeff live".

Artist: ${artist_name}
${venue_name ? `Venue: ${venue_name}` : ''}
${dateStr ? `Date: ${dateStr}` : ''}
${genre ? `Known Genre: ${genre}` : ''}
${current_description ? `Current description to improve: ${current_description}` : ''}

Respond with ONLY the JSON object — no markdown, no code fences, no preamble.`;

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: 'You are a metadata enrichment API for a local live music discovery app. Always respond with valid JSON only. No markdown formatting.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[AI Enhance] Perplexity error:', res.status, errText.slice(0, 300));
      // Admin-only endpoint, so surface the actual upstream error to the
      // client. Without this the front-end alert just says "AI service
      // error" and there's no way to tell auth/rate-limit/billing/model
      // problems apart without digging into Vercel function logs.
      return NextResponse.json({
        error: `AI service error (${res.status}): ${errText.slice(0, 300)}`,
      }, { status: 502 });
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';

    if (!raw) {
      return NextResponse.json({ error: 'No content generated' }, { status: 500 });
    }

    // Parse structured JSON — strip markdown fences if the model wraps them
    let parsed;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: if JSON parsing fails, treat the entire response as a bio (backward compat)
      console.warn('[AI Enhance] JSON parse failed, falling back to raw text:', raw.slice(0, 200));
      return NextResponse.json({ enhanced: raw, bio: raw });
    }

    // Validate vibe is from the allowed set
    if (parsed.vibe && !ALLOWED_VIBES.includes(parsed.vibe)) {
      // Try case-insensitive match
      const match = ALLOWED_VIBES.find(v => v.toLowerCase() === parsed.vibe.toLowerCase());
      parsed.vibe = match || null;
    }

    // Return structured response — also include "enhanced" for backward compat with EventFormModal
    return NextResponse.json({
      enhanced: parsed.bio || raw,
      bio: parsed.bio || raw,
      genre: parsed.genre || null,
      vibe: parsed.vibe || null,
      image_search_query: parsed.image_search_query || null,
    });
  } catch (err) {
    console.error('[AI Enhance] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
