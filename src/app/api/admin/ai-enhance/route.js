import { NextResponse } from 'next/server';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// Must stay in sync with VIBES in src/lib/utils.js
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

  const prompt = `You are enriching metadata for a live music event on the app myLocalJam. Return a JSON object with the following fields:

1. "bio" — A short, exciting event description (2-3 sentences max). Keep it punchy and authentic. Focus on what makes this act worth seeing. No generic hype, no clichés, no fluff words like "vibrant tapestry," "captivating," "sonic journey," or "mesmerizing."
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
        temperature: 0.5,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[AI Enhance] Perplexity error:', res.status, errText.slice(0, 300));
      return NextResponse.json({ error: 'AI service error' }, { status: 502 });
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
