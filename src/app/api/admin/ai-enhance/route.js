import { NextResponse } from 'next/server';
import { callLLMWebGrounded } from '@/lib/llmRouter';
import { GENRES, VIBES } from '@/lib/utils';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// Pull the canonical lists from utils.js so the AI prompt and the form
// stay in lockstep. Previous bug: the prompt used a DIFFERENT genre list
// ("Rock / Alternative", "Metal / Hardcore", etc.) — when the model
// returned "Metal / Hardcore" the form's Metal button didn't highlight
// because that string wasn't in GENRES. Symptom: bio + vibe filled,
// genre stayed empty even when the bio said "metal bands."
const ALLOWED_GENRES = GENRES;
const ALLOWED_VIBES = VIBES;

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { artist_name, venue_name, event_date, genre, current_description } = await request.json();

  if (!artist_name) {
    return NextResponse.json({ error: 'Artist name is required' }, { status: 400 });
  }

  // No more direct Perplexity fetch — the LLM router (callLLMWebGrounded)
  // handles provider selection + failover (Perplexity → Gemini → Grok). When
  // Perplexity returns insufficient_quota or rate-limits, the router
  // continues down the route automatically. As long as ONE provider's API
  // key is set, this endpoint stays alive.

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
2. "genre" — The artist's primary genre. Pick ONE EXACTLY from this list (case and spelling must match): ${ALLOWED_GENRES.join(', ')}. Use "Cover Band" for tribute/cover acts. Use "DJ" for DJ sets. Use "Metal" for any metal subgenre (metalcore, deathcore, hardcore). If unsure, pick the closest single match — never invent a new label.
3. "vibe" — The likely event atmosphere. Pick ONE from: ${ALLOWED_VIBES.join(', ')}. "Vibe" describes the venue experience (energy level, crowd atmosphere), NOT the artist's genre. A jazz trio at a wine bar is "Chill / Low Key". A jazz trio at a street festival is "Energetic / Party".
4. "image_search_query" — A Google Image search query that would find a photo of this specific artist or band. Use the artist name plus terms like "band", "live", or "musician" to get relevant results. Example: "The Wallflowers band" or "DJ Jazzy Jeff live".

Artist: ${artist_name}
${venue_name ? `Venue: ${venue_name}` : ''}
${dateStr ? `Date: ${dateStr}` : ''}
${genre ? `Known Genre: ${genre}` : ''}
${current_description ? `Current description to improve: ${current_description}` : ''}

Respond with ONLY the JSON object — no markdown, no code fences, no preamble.`;

  try {
    const systemPrompt = 'You are a metadata enrichment API for a local live music discovery app. Always respond with valid JSON only. No markdown formatting.';
    // Web-grounded routing → Perplexity first (fresh web context for bios),
    // Gemini second, Grok third. Returns parsed JSON or null if every
    // provider failed.
    const parsed = await callLLMWebGrounded(systemPrompt, prompt);

    if (!parsed) {
      // All providers exhausted — quota, key, or transient. Vercel logs
      // already capture the per-provider failure reasons via the router's
      // own [LLMRouter] console.error lines.
      return NextResponse.json({
        error: 'AI service unavailable — all providers failed (check Vercel logs for per-provider details)',
      }, { status: 502 });
    }

    // Validate vibe is from the allowed set (case-insensitive recovery for
    // small model misses like "chill / low key" → "Chill / Low Key").
    if (parsed.vibe && !ALLOWED_VIBES.includes(parsed.vibe)) {
      const match = ALLOWED_VIBES.find(v => v.toLowerCase() === parsed.vibe.toLowerCase());
      parsed.vibe = match || null;
    }

    // Same case-insensitive recovery for genre. Models occasionally return
    // "metal" or "rock & roll" or "hip-hop" — try to match before giving up
    // and dropping the field, so the form gets a usable value when the AI
    // identification was correct but the casing/spelling drifted.
    if (parsed.genre && !ALLOWED_GENRES.includes(parsed.genre)) {
      const lower = parsed.genre.toLowerCase().trim();
      // Exact case-insensitive match first
      let match = ALLOWED_GENRES.find(g => g.toLowerCase() === lower);
      // If still no match, try common subgenre → canonical mapping. Models
      // often return more specific labels than our flat list supports.
      if (!match) {
        const subgenreMap = {
          'metalcore': 'Metal', 'deathcore': 'Metal', 'hardcore': 'Metal',
          'death metal': 'Metal', 'heavy metal': 'Metal', 'metal/hardcore': 'Metal',
          'hip-hop': 'Hip Hop', 'hiphop': 'Hip Hop', 'rap': 'Hip Hop',
          'r&b/soul': 'R&B', 'soul': 'R&B', 'funk': 'R&B',
          'alternative': 'Rock', 'alt rock': 'Rock', 'punk rock': 'Punk', 'ska': 'Punk',
          'tribute': 'Cover Band', 'cover': 'Cover Band', 'tributes': 'Cover Band',
          'electronic/dj': 'DJ', 'edm': 'Electronic', 'house': 'Electronic',
          'singer-songwriter': 'Acoustic', 'folk rock': 'Folk',
          'americana': 'Country', 'bluegrass/folk': 'Bluegrass',
          'jazz/blues': 'Jazz', 'blues rock': 'Blues',
          'reggae/island': 'Reggae', 'island': 'Reggae',
          'latin/world': 'Latin', 'world': 'Latin',
          'jam/psych': 'Jam', 'psych': 'Jam', 'jam band': 'Jam',
          'pop/top 40': 'Pop',
        };
        match = subgenreMap[lower];
      }
      parsed.genre = match || null;
    }

    // Return structured response — also include "enhanced" for backward
    // compat with the EventFormModal handler which checks data.enhanced.
    return NextResponse.json({
      enhanced: parsed.bio || '',
      bio: parsed.bio || '',
      genre: parsed.genre || null,
      vibe: parsed.vibe || null,
      image_search_query: parsed.image_search_query || null,
    });
  } catch (err) {
    console.error('[AI Enhance] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
