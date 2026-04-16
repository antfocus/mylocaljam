/**
 * AI Artist Lookup — Perplexity-backed bio/image lookup with strict constraints.
 *
 * Extracted from `src/app/api/admin/artists/ai-lookup/route.js` so the same
 * logic can serve three callers:
 *   1. Admin modal "AI Lookup" button → /api/admin/artists/ai-lookup
 *   2. Automatic enrichArtist waterfall → final fallback rung when
 *      MusicBrainz/Discogs/Last.fm all return null
 *   3. Magic Wand bulk enrich → /api/admin/enrich-date
 *
 * Prompt contract (STRICT — matches product spec 2026-04-15):
 *
 *   Bio:
 *     • Max 500 characters (hard cap, enforced both in prompt AND client-side
 *       post-trim — the LLM sometimes overshoots; we never write >500 chars).
 *     • Focus strictly on musical style, genre, and range.
 *     • NO past venues, NO tour history, NO place-name dropping.
 *     • NO hype words (legendary, world-class, amazing, soul-stirring,
 *       incredible, electrifying, unforgettable).
 *     • NO generic filler ("Come out for a night of music", "Don't miss...").
 *     • Tone: neutral, informative, professional.
 *
 *   Image:
 *     • Prefer official promotional image: artist website, primary social.
 *     • High-res direct image URLs only (.jpg/.jpeg/.png/.webp).
 *     • If Perplexity can't find one confidently, we fall back to Serper
 *       (Google Images) — same hotlink-safe filter as before.
 *
 *   Output:
 *     { bio, image_url, source_link, is_tribute } on Pass 1.
 *     genres + vibes come from a separate Pass 2 so admin UI shape is preserved.
 *
 * Why ONE place, not three prompt copies: the tone contract (no marketing
 * hyperbole, 500-char cap, banned-word list, context framing) CANNOT be
 * allowed to drift between manual admin use and automated enrichment.
 *
 * Env vars:
 *   - PERPLEXITY_API_KEY (required — without it, aiLookupArtist returns null)
 *   - SERPER_API_KEY     (optional — image fallback; admin UI falls back to
 *                         premium placeholder carousel, auto mode refuses)
 */

// Keep in lockstep with ALLOWED_GENRES in src/lib/utils.js and the admin
// route's local copy. 'Latin' was added after the utils.js migration to
// cover legacy 'Latin / Reggaeton' and 'Latin / World' rows.
export const ALLOWED_GENRES = [
  'Rock', 'Pop', 'Country', 'Acoustic', 'Cover Band', 'DJ', 'Electronic',
  'Jazz', 'Blues', 'Reggae', 'R&B', 'Hip Hop', 'Latin', 'Emo', 'Punk', 'Metal',
  'Indie', 'Folk',
];

export const ALLOWED_VIBES = [
  'Chill / Low Key', 'Energetic / Party', 'Outdoor / Patio', 'Family-Friendly',
];

// Hard cap on bio length. The prompt asks the LLM to stay under 500 chars,
// but we ALSO enforce this client-side because sonar-pro occasionally runs
// long. Trimming on a sentence boundary is handled in normalizeBio below.
const BIO_MAX_CHARS = 500;

// Banned "hype" words — the system prompt asks the LLM not to use them, but
// we also scrub the response client-side before accepting it. If a bio comes
// back containing any of these, we flag it for review rather than storing
// marketing-speak. Case-insensitive match.
const HYPE_WORDS = [
  'legendary', 'world-class', 'world class', 'amazing', 'soul-stirring',
  'soul stirring', 'incredible', 'electrifying', 'unforgettable',
  'mind-blowing', 'mind blowing', 'jaw-dropping', 'jaw dropping',
];

// Premium placeholder fallback images — abstract music visuals.
// Used ONLY for the admin UI carousel when Serper returns nothing, so the
// admin still has something to pick from. The auto-enrich path (passed
// `autoMode: true`) treats a placeholder result as "no image" because
// stamping random Unsplash art onto a real artist's profile would be worse
// than leaving the field empty.
const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80', // microphone on stage
  'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=400&q=80', // guitar strings close-up
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80', // concert stage lights
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&q=80', // crowd at concert
  'https://images.unsplash.com/photo-1501612780327-45045538702b?w=400&q=80', // neon music venue
  'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&q=80', // stage with colored lights
  'https://images.unsplash.com/photo-1508854710579-5cecc3a9ff17?w=400&q=80', // drum kit silhouette
  'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=400&q=80', // concert crowd hands
];

/**
 * Validate an image URL against the same filters searchArtistImages applies.
 * Returns the URL if safe to hotlink, else null.
 *
 * Rejects:
 *   - Non-http(s)
 *   - SVG (often vector logos / placeholders)
 *   - URLs containing "placeholder" or "default-avatar"
 *   - Meta CDNs (instagram/facebook/scontent/lookaside) — they 403 on hotlink
 *   - Non-image paths (no recognized image extension in path)
 *
 * The extension check is lenient: it allows query strings and CDN paths
 * without extensions IF the URL is on a trusted image host. Since we can't
 * enumerate those, we accept any https URL that isn't in the blacklist and
 * defer final validation to the rendering layer (the admin UI shows a
 * broken-image icon rather than crashing).
 */
export function validateImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (!/^https?:\/\//i.test(url)) return null;
  if (/\.svg($|\?)/i.test(url)) return null;
  if (/placeholder|default-avatar/i.test(url)) return null;
  if (/instagram\.com|lookaside|scontent|facebook\.com/i.test(url)) return null;
  return url;
}

/**
 * Trim a bio to a hard character limit, preferring a sentence boundary.
 * Also scrubs common LLM preamble ("Here is a bio for…").
 * Returns null if the input is empty after cleaning.
 */
export function normalizeBio(raw, maxChars = BIO_MAX_CHARS) {
  if (!raw || typeof raw !== 'string') return null;

  let bio = raw.trim();
  // Strip LLM preamble.
  bio = bio.replace(/^(here\s+is\s+a?\s*bio[^:]*:\s*)/i, '');
  bio = bio.replace(/^bio:\s*/i, '');
  // Collapse whitespace.
  bio = bio.replace(/\s+/g, ' ').trim();
  if (!bio) return null;
  if (bio === 'NEEDS_MANUAL_REVIEW') return null;

  if (bio.length <= maxChars) return bio;

  // Trim on the last sentence boundary that fits.
  const truncated = bio.substring(0, maxChars);
  const lastPeriod = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  if (lastPeriod > Math.floor(maxChars * 0.4)) {
    return truncated.substring(0, lastPeriod + 1);
  }
  // No good boundary — cut at last space and add ellipsis.
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '…';
}

/**
 * Detect whether a bio contains banned hype words. Returns true if clean.
 */
export function isHypeFree(bio) {
  if (!bio) return true;
  const lower = bio.toLowerCase();
  return !HYPE_WORDS.some(w => lower.includes(w));
}

/**
 * Serper.dev Google Image Search. Returns up to 5 hotlink-safe URLs.
 * Returns [] if SERPER_API_KEY is missing or the call fails.
 */
export async function searchArtistImages(artistName) {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) return [];

  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: `${artistName} band live music`,
        num: 10,
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const images = data.images || [];

    const valid = [];
    for (const img of images) {
      if (valid.length >= 5) break;
      const url = img.imageUrl || img.link;
      const safe = validateImageUrl(url);
      if (safe) valid.push(safe);
    }
    return valid;
  } catch {
    return [];
  }
}

/**
 * Low-level Perplexity chat completion.
 * Returns parsed JSON or null on any failure (network, non-2xx, bad JSON).
 */
export async function callPerplexity(systemPrompt, userPrompt, { apiKey, model = 'sonar-pro' } = {}) {
  const key = apiKey || process.env.PERPLEXITY_API_KEY;
  if (!key) return null;

  let response;
  try {
    response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.1,
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let data;
  try {
    data = await response.json();
  } catch {
    return null;
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * AI-powered artist lookup. Performs up to 3 passes:
 *   Pass 1 — bio + image_url + source_link + is_tribute (Perplexity sonar-pro)
 *   Pass 2 — genres + vibes (Perplexity sonar-pro, bio-aware)
 *   Pass 3 — image fallback (Serper.dev Google Images) — only if Pass 1
 *            didn't return a usable image.
 *
 * Options:
 *   - artistName (required) — the band/artist to research.
 *   - venue (optional) — venue name the artist is playing at (e.g.
 *     "Wonder Bar"). Improves research precision for generic band names.
 *   - city (optional) — city/area (e.g. "Asbury Park"). Pairs with venue.
 *   - autoMode (bool, default false) — when true, caller is the automated
 *     pipeline (not a human admin). In autoMode we:
 *       * Refuse placeholder images (null instead of Unsplash fallbacks)
 *       * Reject hype-word bios (return bio: null rather than marketing copy)
 *
 * Returns:
 *   {
 *     bio,               // string (<=500 chars, no hype words) or null
 *     image_url,         // validated URL or null
 *     source_link,       // URL the LLM sourced the research from, or null
 *     genres,            // string[] ⊆ ALLOWED_GENRES
 *     vibes,             // string[] ⊆ ALLOWED_VIBES
 *     is_tribute,        // boolean
 *     image_candidates,  // string[] — all usable images (admin UI carousel)
 *     image_source,      // 'perplexity' | 'serper' | 'placeholder' | null
 *     needs_review,      // true if the LLM flagged the artist as unknown
 *   }
 *   or null if PERPLEXITY_API_KEY is missing (caller should degrade gracefully).
 */
export async function aiLookupArtist({ artistName, venue, city, autoMode = false } = {}) {
  if (!artistName || !artistName.trim()) return null;
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  const name = artistName.trim();
  const venueStr = (venue && typeof venue === 'string') ? venue.trim() : '';
  const cityStr = (city && typeof city === 'string') ? city.trim() : '';

  // ── Pass 1: Bio + image_url + source_link (STRICT spec) ───────────────
  //
  // The system prompt is deliberately verbose and repetitive about the
  // constraints. LLMs drift when rules are stated once; stating them twice
  // (once in BIO RULES, once in OUTPUT) reliably keeps sonar-pro on tone.
  const bioSystemPrompt = `You are a professional music writer producing neutral, factual bios for a local live-music listings site. Follow these rules STRICTLY.

BIO RULES:
- Maximum 500 characters (count every character including spaces and punctuation).
- Focus STRICTLY on the artist's musical style, genre, and range — what kind of music they play, their instrumentation, their sound.
- DO NOT list past venues, tour history, award history, or any places the band has performed. Not even one example.
- AVOID hype words: "legendary", "world-class", "amazing", "soul-stirring", "incredible", "electrifying", "unforgettable", "mind-blowing", "jaw-dropping". Never use promotional adjectives.
- DO NOT use generic filler sentences such as "Come out for a night of music" or "Don't miss this show" or "You won't want to miss…". Never address the reader or call them to action.
- Tone: neutral, informative, professional — like an encyclopedia entry, not marketing copy.
- Write 1–3 complete sentences. End on a period. If you would exceed 500 characters, rewrite shorter rather than truncating mid-sentence.
- If the data is insufficient to confidently identify the artist, return exactly: "NEEDS_MANUAL_REVIEW" for bio.

IMAGE RULES:
- Find the most likely OFFICIAL promotional image for this specific artist/band.
- Prefer high-resolution sources: the artist's official website, their primary social-media profile banner, or a press kit photo.
- The URL must point DIRECTLY to an image file (e.g. .jpg, .jpeg, .png, .webp). Not a webpage.
- If you cannot find a confident direct image URL, return null for image_url. Do not guess.

SOURCE LINK:
- Return the web page you used to source the bio/image (artist website, Wikipedia, primary social). Null if none.

OUTPUT — respond with valid JSON ONLY, no markdown, no code fences, no commentary:
{ "bio": "string or NEEDS_MANUAL_REVIEW", "image_url": "string or null", "source_link": "string or null", "is_tribute": boolean }`;

  const contextLines = [
    `Artist: "${name}"`,
    venueStr ? `Playing at: ${venueStr}` : '',
    cityStr ? `Location: ${cityStr}` : '',
  ].filter(Boolean).join('\n');

  const bioUserPrompt = `Research this artist for a local live-music listing.

${contextLines}

Use the venue and location context above to disambiguate generic band names. If the artist appears to be a local act tied to the Jersey Shore region, research accordingly; if they are a nationally known act, search broadly.

Return the strict JSON object defined in the system prompt. Obey every BIO RULE and IMAGE RULE.`;

  const bioResult = await callPerplexity(bioSystemPrompt, bioUserPrompt, { apiKey });

  // ── Pass 2: Genre & Vibe Tagger ───────────────────────────────────────
  const rawBio = typeof bioResult?.bio === 'string' ? bioResult.bio : '';
  const bioText = rawBio === 'NEEDS_MANUAL_REVIEW' ? '' : rawBio;

  const tagSystemPrompt = `You are a music categorization engine. Review the provided artist bio and assign up to 3 Genres and up to 2 Vibes.

CRITICAL RULE: You may ONLY select from the allowed lists. Do not invent new labels. If the artist is "Alternative Rock", output "Rock".

Allowed Genres: ${JSON.stringify(ALLOWED_GENRES)}
Allowed Vibes: ${JSON.stringify(ALLOWED_VIBES)}

Respond with strict JSON only, no markdown, no commentary, no code fences:
{ "genres": ["string"], "vibes": ["string"] }`;

  const tagUserPrompt = `Artist: "${name}"\nBio: "${bioText}"\n\nCategorize using ONLY the allowed lists.`;

  const tagResult = bioText
    ? await callPerplexity(tagSystemPrompt, tagUserPrompt, { apiKey })
    : null;

  // ── Normalize & validate the Pass 1 output ────────────────────────────

  // Bio: trim to 500 chars + reject NEEDS_MANUAL_REVIEW + scrub hype words
  // in autoMode (admin mode tolerates them since a human is reviewing).
  let bio = normalizeBio(rawBio);
  const needs_review = rawBio === 'NEEDS_MANUAL_REVIEW' || !bio;
  if (bio && autoMode && !isHypeFree(bio)) {
    // Autopipe refuses to write marketing-speak onto real artists. Humans
    // can still save hype bios via the admin modal; autoMode cannot.
    bio = null;
  }

  // Image: validate Perplexity's returned URL; fall through to Serper if
  // invalid or absent.
  const perplexityImage = validateImageUrl(bioResult?.image_url);
  const sourceLink = typeof bioResult?.source_link === 'string' && bioResult.source_link.trim()
    ? bioResult.source_link.trim()
    : null;

  // Validate genres against allowed list. Belt-and-suspenders against LLM
  // hallucinations — any tag the AI invents gets stripped before it reaches
  // the DB. Back-compat: flatten the legacy primary_genre / secondary_genres
  // shape into the flat `genres` array.
  const rawGenres = Array.isArray(tagResult?.genres)
    ? tagResult.genres
    : [tagResult?.primary_genre, ...(tagResult?.secondary_genres || [])].filter(Boolean);
  const genres = rawGenres.filter(g => ALLOWED_GENRES.includes(g)).slice(0, 3);

  const rawVibes = tagResult?.vibes || [];
  const vibes = rawVibes.filter(v => ALLOWED_VIBES.includes(v)).slice(0, 2);

  // ── Pass 3: Image fallback (Serper) ───────────────────────────────────
  // Only fires if Perplexity didn't give us a usable image_url. This keeps
  // the official-promo image preferred over a Google Images hit when both
  // are available.
  let image_candidates = [];
  let image_source = null;
  let image_url = null;

  if (perplexityImage) {
    image_url = perplexityImage;
    image_candidates = [perplexityImage];
    image_source = 'perplexity';
  } else {
    try {
      const serperHits = await searchArtistImages(name);
      if (serperHits.length > 0) {
        image_candidates = serperHits;
        image_url = serperHits[0];
        image_source = 'serper';
      } else if (!autoMode) {
        // Admin UI: fall back to premium placeholders so the carousel is
        // non-empty and the admin can still pick something. Auto mode
        // refuses placeholders (see docstring).
        const shuffled = [...FALLBACK_IMAGES].sort(() => Math.random() - 0.5);
        image_candidates = shuffled.slice(0, 5);
        image_url = image_candidates[0];
        image_source = 'placeholder';
      }
    } catch {
      if (!autoMode) {
        const shuffled = [...FALLBACK_IMAGES].sort(() => Math.random() - 0.5);
        image_candidates = shuffled.slice(0, 5);
        image_url = image_candidates[0];
        image_source = 'placeholder';
      }
    }
  }

  return {
    bio,
    image_url,
    source_link: sourceLink,
    genres,
    vibes,
    is_tribute: bioResult?.is_tribute === true,
    image_candidates,
    image_source,
    needs_review,
  };
}
