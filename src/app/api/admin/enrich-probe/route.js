/**
 * POST /api/admin/enrich-probe  (admin only)
 *
 * Diagnostic shadow of the artist-enrichment Pass 1. Runs the same LLM call
 * as aiLookupArtist but returns every intermediate stage in the response
 * body instead of relying on Vercel logs (Hobby tier keeps them 1 hour).
 *
 * Why this exists: batch 2 of the production backfill enriched 0 / 10 and
 * wrote "AI returned no usable bio/image" errors for real artists (Broncho,
 * Duane Betts & Palmetto Motel). Prime suspect is aiLookup.js:570 —
 *
 *     if (bio && autoMode && !isHypeFree(bio)) bio = null;
 *
 * — because HYPE_WORDS includes "electrifying", "captivating", "powerhouse",
 * "high-energy", which are music-journalism staples that Perplexity grounds
 * on constantly. Nulling the bio also disables the Serper image fallback
 * (the bio-gate we added earlier today), so the endpoint writes sentinels
 * and moves on.
 *
 * This probe lets us see EXACTLY what the LLM returned, what normalizeBio
 * did to it, whether isHypeFree passed, and which specific words tripped
 * the filter. No write side-effects — nothing touches Supabase.
 *
 * Body: { name: string, venue?: string, city?: string }
 *
 * Returns:
 *   {
 *     ok: true,
 *     input: { name, venue, city },
 *     llm: { elapsedMs, raw },
 *     classification: { rawKind, kind },
 *     bio: {
 *       raw, normalized,
 *       hypeFree: boolean,
 *       hypeHits: string[],          // which banned words appeared
 *       autoModeBio: string|null,    // what autoMode=true would keep (null if scrubbed)
 *       adminModeBio: string|null,   // what autoMode=false would keep
 *     },
 *     image: {
 *       raw, validated,
 *       bioConfirmsEntity: boolean,
 *       wouldSkipSerperInAuto: boolean,
 *     },
 *     prediction: {
 *       autoMode: { wouldWriteBio, wouldWriteImage, errorMessage },
 *       adminMode: { wouldWriteBio, wouldWriteImage },
 *     },
 *   }
 *
 * Usage:
 *   curl -X POST https://mylocaljam.vercel.app/api/admin/enrich-probe \
 *     -H "Authorization: Bearer $ADMIN_PASSWORD" \
 *     -H "Content-Type: application/json" \
 *     -d '{"name":"Broncho"}'
 */

import { NextResponse } from 'next/server';
import { callLLMWebGrounded } from '@/lib/llmRouter';
import { normalizeBio, isHypeFree, validateImageUrl } from '@/lib/aiLookup';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Mirror aiLookup.js:118-124 so we can surface which specific word tripped
// the scrubber. Kept literal rather than imported because HYPE_WORDS is
// a private const — and if it drifts, we WANT the probe to show the drift.
const HYPE_WORDS = [
  'legendary', 'world-class', 'world class', 'amazing', 'soul-stirring',
  'soul stirring', 'incredible', 'electrifying', 'unforgettable',
  'mind-blowing', 'mind blowing', 'jaw-dropping', 'jaw dropping',
  'high-energy', 'high energy', 'captivating', 'mesmerizing',
  'powerhouse', 'showstopping', 'show-stopping', 'breathtaking',
];

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// Exact copy of the Pass 1 system prompt from aiLookup.js:422. Keeping it
// inline (rather than importing a shared constant) so this probe stays a
// TRUE shadow — if the real prompt changes without a mirror update, the
// probe will show different output and we'll know something drifted.
const BIO_SYSTEM_PROMPT = `You are a professional listings writer for a local live-music and nightlife site. Follow these rules STRICTLY.

═══════════════════════════════════════════════════════
STEP 1 — CATEGORIZATION (do this FIRST, before writing anything):
═══════════════════════════════════════════════════════
Analyze the provided name and decide which of these two categories it belongs to:

- MUSICIAN: a band, solo artist, DJ, duo, tribute act, or other live-music performer.
    Examples: "The Nerds", "Bruce Springsteen", "DJ Shadow", "Elton John Tribute".

- VENUE_EVENT: a recurring or themed venue activity that is NOT a specific performer.
    Examples: "Trivia Night", "Karaoke Tuesday", "BOGO Burger", "Taco & Margarita Night",
    "Open Mic", "Comedy Night", "Happy Hour", "Paint and Sip", "Brunch Bingo".

If the name clearly refers to a person or band playing music, it is MUSICIAN.
If the name describes an activity, food/drink special, or theme night, it is VENUE_EVENT.
If ambiguous, use the venue and city context to decide. When still unsure, default to
MUSICIAN only if the name reads like a proper noun for a performer; otherwise VENUE_EVENT.

Set the output field "kind" to exactly "MUSICIAN" or "VENUE_EVENT".

═══════════════════════════════════════════════════════
STEP 2 — CONDITIONAL WRITING RULES
═══════════════════════════════════════════════════════

IF kind === "MUSICIAN":
  BIO RULES (MUSICIAN):
  - Maximum 250 characters (count every character including spaces and punctuation).
  - Focus STRICTLY on the artist's musical style, genre, vocal range, and instrumentation — what kind of music they play and how they sound.
  - DO NOT list past venues, tour history, award history, or any places the band has performed. Not even one example.
  - AVOID hype words: "legendary", "world-class", "amazing", "soul-stirring", "incredible", "electrifying", "unforgettable", "mind-blowing", "jaw-dropping", "high-energy", "captivating", "mesmerizing", "powerhouse", "showstopping", "breathtaking". Never use promotional adjectives.
  - DO NOT use generic filler sentences such as "Come out for a night of music" or "Don't miss this show" or "You won't want to miss…". Never address the reader or call them to action.
  - Tone: neutral, informative, professional — like an encyclopedia entry, not marketing copy.
  - Write 1–3 complete sentences. End on a period. If you would exceed 250 characters, rewrite shorter rather than truncating mid-sentence.
  - DO NOT include citation markers like [1], [2], [3] in the bio text. Write clean prose with no references or footnotes.
  - If the data is insufficient to confidently identify the artist, return exactly: "NEEDS_MANUAL_REVIEW" for bio.

IF kind === "VENUE_EVENT":
  BIO RULES (VENUE_EVENT):
  - Maximum 250 characters (same hard cap).
  - Describe THE ACTIVITY, the venue's atmosphere, and what attendees can expect (e.g. trivia format and prize structure, karaoke vibe, food/drink special details, comedy lineup style).
  - Keep it informative and punchy. 1–3 complete sentences. End on a period.
  - DO NOT invent musical genres, vocal ranges, or performer details for food/trivia/drink events. This event has no "sound".
  - Same banned hype-word list applies: "legendary", "world-class", "amazing", "soul-stirring", "incredible", "electrifying", "unforgettable", "mind-blowing", "jaw-dropping", "high-energy", "captivating", "mesmerizing", "powerhouse", "showstopping", "breathtaking".
  - Same no-call-to-action rule: DO NOT write "Come out…", "Don't miss…", or address the reader.
  - Tone: neutral, informative, professional — a listings description, not marketing copy.
  - If the data is insufficient to describe the event meaningfully, return exactly: "NEEDS_MANUAL_REVIEW" for bio.

═══════════════════════════════════════════════════════
STEP 3 — CONDITIONAL IMAGE RULES
═══════════════════════════════════════════════════════

IF kind === "MUSICIAN":
  - Find the most likely OFFICIAL promotional image for this specific artist/band.
  - Prefer high-resolution sources: the artist's official website, their primary social-media profile banner, or a press kit photo.
  - The URL must point DIRECTLY to an image file (.jpg, .jpeg, .png, .webp). Not a webpage.
  - If you cannot find a confident direct image URL, return null for image_url. Do not guess.

IF kind === "VENUE_EVENT":
  - Find a high-quality photo of EITHER:
      (a) the venue's interior matching the event's atmosphere, OR
      (b) the specific food/drink item featured in the event, OR
      (c) a generic but high-quality lifestyle photo matching the event vibe
          (e.g. a real photo of a trivia night crowd, a photographed burger
          for a burger special, a candid karaoke shot).
  - Prefer the venue's own website or social media if they have a real photo.
  - DO NOT return clip-art, cartoon icons, generic silhouettes, stock vector
    illustrations, or Shutterstock-style watermarked thumbnails.
  - High-res direct image URLs only (.jpg, .jpeg, .png, .webp). Not a webpage.
  - If you cannot find a confident direct image URL, return null for image_url.

═══════════════════════════════════════════════════════
STEP 4 — SOURCE LINK
═══════════════════════════════════════════════════════
Return the web page you used to source the bio/image (artist website, venue website, Wikipedia, primary social). Null if none.

═══════════════════════════════════════════════════════
STEP 5 — OUTPUT
═══════════════════════════════════════════════════════
Respond with valid JSON ONLY, no markdown, no code fences, no commentary:
{ "kind": "MUSICIAN" or "VENUE_EVENT", "bio": "string or NEEDS_MANUAL_REVIEW", "image_url": "string or null", "source_link": "string or null", "is_tribute": boolean }

"is_tribute" only applies when kind === "MUSICIAN". For VENUE_EVENT, always set is_tribute to false.`;

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

  const name = (body?.name || '').trim();
  const venue = (body?.venue || '').trim();
  const city = (body?.city || '').trim();

  if (!name) {
    return NextResponse.json({ error: 'Missing `name` in body' }, { status: 400 });
  }

  // ── Build the Pass-1 user prompt (same as aiLookup.js:512) ───────────
  const contextLines = [
    `Name: "${name}"`,
    venue ? `Listed at venue: ${venue}` : '',
    city  ? `Location: ${city}` : '',
  ].filter(Boolean).join('\n');

  const userPrompt = `Research this listing for a local live-music and nightlife site.

${contextLines}

First, classify this name as either MUSICIAN or VENUE_EVENT per the CATEGORIZATION step in the system prompt. The venue/location context above is especially useful when the name alone is ambiguous — e.g. "Bingo" at a restaurant is a VENUE_EVENT; "Bingo Players" at a club is a MUSICIAN.

Then apply the conditional BIO RULES and IMAGE RULES for the chosen kind. If the name is MUSICIAN and appears to be a local act tied to the Jersey Shore region, research accordingly; if they are a nationally known act, search broadly.

Return the strict JSON object defined in STEP 5. Obey every rule for the chosen branch.`;

  // ── Pass 1: fire the LLM ───────────────────────────────────────────────
  const t0 = Date.now();
  let llmResult = null;
  let llmError = null;
  try {
    llmResult = await callLLMWebGrounded(BIO_SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    llmError = err?.message || String(err);
  }
  const elapsedMs = Date.now() - t0;

  if (!llmResult) {
    return NextResponse.json({
      ok: false,
      input: { name, venue, city },
      llm: { elapsedMs, error: llmError || 'callLLMWebGrounded returned null' },
      note: 'All LLM providers failed or unconfigured. Check GOOGLE_AI_KEY / PERPLEXITY_API_KEY / XAI_API_KEY.',
    }, { status: 502 });
  }

  // ── Classification ────────────────────────────────────────────────────
  const rawKind = typeof llmResult?.kind === 'string' ? llmResult.kind.trim().toUpperCase() : '';
  const kind = rawKind === 'VENUE_EVENT' ? 'VENUE_EVENT' : 'MUSICIAN';

  // ── Bio pipeline ──────────────────────────────────────────────────────
  const rawBio = typeof llmResult?.bio === 'string' ? llmResult.bio : '';
  const normalized = normalizeBio(rawBio);
  const hypeFree = isHypeFree(normalized);
  const lower = (normalized || '').toLowerCase();
  const hypeHits = HYPE_WORDS.filter(w => lower.includes(w));

  // autoMode (production backfill): null the bio if any hype word appears.
  // adminMode (manual triage): keep the bio regardless of hype content.
  const autoModeBio = normalized && hypeFree ? normalized : null;
  const adminModeBio = normalized;

  // Bio is "confirming the entity" when we actually have a kept bio AND the
  // LLM didn't signal NEEDS_MANUAL_REVIEW. Mirrors aiLookup.js:621.
  const needsReview = rawBio === 'NEEDS_MANUAL_REVIEW' || !normalized;

  // ── Image pipeline ────────────────────────────────────────────────────
  const rawImage = llmResult?.image_url || null;
  const validatedImage = validateImageUrl(rawImage);

  // autoMode: bioConfirmsEntity governs whether Serper fires at all.
  const autoBioConfirmsEntity = !!autoModeBio && !needsReview;
  const wouldSkipSerperInAuto = !autoBioConfirmsEntity;

  // ── Endpoint prediction ──────────────────────────────────────────────
  // If bio is null AND no validated perplexity image AND Serper is gated,
  // the endpoint logs: "AI returned no usable bio/image" and sentinels both
  // fields. This is the exact error message we've been seeing.
  const autoWouldWriteBio   = !!autoModeBio;
  const autoWouldWriteImage = !!validatedImage; // Serper is gated when bio empty
  let autoErrorMessage = null;
  if (!autoWouldWriteBio && !autoWouldWriteImage) {
    autoErrorMessage = `AI returned no usable bio/image${kind === 'VENUE_EVENT' ? ' (classified as VENUE_EVENT)' : ''}`;
  }

  const adminWouldWriteBio   = !!adminModeBio;
  const adminWouldWriteImage = !!validatedImage; // admin mode would also hit Serper if needed

  return NextResponse.json({
    ok: true,
    input: { name, venue, city },
    llm: {
      elapsedMs,
      raw: llmResult,
    },
    classification: { rawKind, kind },
    bio: {
      raw: rawBio,
      rawLength: rawBio.length,
      normalized,
      normalizedLength: normalized ? normalized.length : 0,
      hypeFree,
      hypeHits,
      autoModeBio,
      adminModeBio,
      needsReview,
    },
    image: {
      raw: rawImage,
      validated: validatedImage,
      bioConfirmsEntity: autoBioConfirmsEntity,
      wouldSkipSerperInAuto,
    },
    prediction: {
      autoMode: {
        wouldWriteBio: autoWouldWriteBio,
        wouldWriteImage: autoWouldWriteImage,
        errorMessage: autoErrorMessage,
      },
      adminMode: {
        wouldWriteBio: adminWouldWriteBio,
        wouldWriteImage: adminWouldWriteImage,
      },
    },
  });
}
