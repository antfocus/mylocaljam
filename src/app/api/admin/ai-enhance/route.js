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
  // handles provider selection + failover (Gemini → OpenAI → Perplexity). When
  // a provider returns insufficient_quota or rate-limits, the router
  // continues down the route automatically. As long as ONE provider's API
  // key is set, this endpoint stays alive.

  // Build context for the prompt
  const dateStr = event_date
    ? new Date(event_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  // ── Description tone contract (rewritten Apr 29, 2026) ─────────────────
  // SOURCE OF TRUTH for the "bio" field. Mirrors the artist-bio prompt's
  // ARTIST/VENUE classification fork (see aiLookup.js) so event copy stays
  // tight and on-brand. Old version capped at 2-4 sentences (loose), used
  // an 80-word example that anchored the model to verbose output, and
  // didn't ban repetition of the event name. New version: 200 char hard
  // cap, classification fork, explicit name-repetition ban, longer hype
  // word blacklist (added "high energy" per user request).
  //
  // If a future editor wants to tweak this, keep the structure intact:
  // (1) classify ARTIST vs VENUE, (2) apply the per-branch rules,
  // (3) two short examples — one per branch — that anchor the right length.
  const descriptionContract = `You are a professional listings writer for a local live-music and nightlife site. Follow these rules STRICTLY.

═══════════════════════════════════════════════════════
STEP 1 — CLASSIFY THE EVENT
═══════════════════════════════════════════════════════
Decide which of these two categories the event belongs to:

- ARTIST: a band, solo artist, DJ, duo, tribute act, or other named musical performer is the headliner.
    Examples: "Tony Pontari at Mott's Creek Bar", "DJ Bluiz", "ALL THAT REMAINS", "SongsByWeen".

- VENUE: a recurring or themed activity with no specific musical performer.
    Examples: "Trivia Night", "Karaoke Tuesday", "BOGO Burger", "Happy Hour", "Sunday Brunch".

If both an artist and a themed activity are present, prioritize ARTIST.

═══════════════════════════════════════════════════════
STEP 2 — WRITE THE BIO
═══════════════════════════════════════════════════════

UNIVERSAL RULES (both branches):
- MAXIMUM 200 CHARACTERS. Count every character including spaces and punctuation. If you exceed 200, rewrite shorter.
- 1 to 2 complete sentences. End on a period.
- DO NOT repeat the event name, artist name, or venue name in the bio. The card already shows them.
- AVOID hype words and generic filler: "high energy", "amazing", "incredible", "electrifying", "unforgettable", "world-class", "legendary", "captivating", "mesmerizing", "powerhouse", "showstopping", "breathtaking", "soul-stirring", "mind-blowing", "vibrant", "immersive", "thrill", "savor", "dive into", "moody glow", "flickering".
- DO NOT call the reader to action: no "come out", "don't miss", "you won't want to miss", or any second-person address.
- Tone: neutral, informative, professional — like an encyclopedia entry, not marketing copy.

IF kind === "ARTIST":
- Describe the artist's musical style, genre, instrumentation, or sound.
- DO NOT mention any venues they have played at — past, present, or current.
- DO NOT mention tour history, awards, chart positions, or famous collaborators.
- If the data is insufficient to describe the music, return exactly: "NEEDS_MANUAL_REVIEW".

IF kind === "VENUE":
- Describe the activity itself, the venue's atmosphere, and what attendees can expect.
- DO NOT invent musical genres or performer details for food/trivia/drink events. The event has no "sound".
- If the data is insufficient to describe the activity, return exactly: "NEEDS_MANUAL_REVIEW".

═══════════════════════════════════════════════════════
STEP 3 — EXAMPLES (target this length and density)
═══════════════════════════════════════════════════════

ARTIST example:
  Input: "Tony Pontari at Mott's Creek Bar"
  Output: "Solo acoustic singer-songwriter blending classic rock and country covers with finger-picked originals." (104 chars)

VENUE example:
  Input: "Tuesday Trivia Night at River Rock"
  Output: "Weekly Quizzoholics-style trivia at a marina-side sports bar. Teams compete for prizes during the dinner-to-late-evening shift." (128 chars)

Now write the bio for the provided event using this exact tone and length.`;

  const prompt = `${descriptionContract}

You will return a JSON object with the following fields. ONLY the "bio" field is governed by the tone contract above — the other fields remain classification tasks.

1. "bio" — The event description. Follow the rules in the description contract above to the letter. 200 char max. 1-2 sentences. ARTIST branch describes music; VENUE branch describes activity/atmosphere. No banned words. No name repetition. No reader address.
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
    // Web-grounded routing → Gemini first (highest quota, cheapest), OpenAI
    // second (reliable pay-per-token fallback), Perplexity third (web access
    // for niche local acts). Returns parsed JSON or null if every provider
    // failed.
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
    // Full error to Vercel runtime logs; generic message in prod response
    // (security audit M8). Dev mode keeps err.message for fast debugging.
    console.error('[AI Enhance] Error:', err);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message },
      { status: 500 }
    );
  }
}
