import { NextResponse } from 'next/server';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// ── Allowed tags — AI output is strictly validated against these lists. ─────
// Any value returned outside these lists is silently discarded (no coercion).

// Canonical event categories — single-value field, pick one.
const ALLOWED_CATEGORIES = [
  'Live Music',
  'Drink/Food Special',
  'Trivia/Games',
  'DJ/Nightlife',
  'Sports / Watch Party',
  'Festival',
  'Other / Special Event',
];

// Final-4 canonical vibes. Must stay in sync with VIBES in src/lib/utils.js.
const ALLOWED_VIBES = [
  'Chill / Low Key',
  'Energetic / Party',
  'Outdoor / Patio',
  'Family-Friendly',
];

// Premium placeholder fallback images — moody venue/atmosphere visuals.
// Used when all three Serper tiers return zero usable results.
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
 * Search Serper.dev Google Image Search for a single query.
 * Returns an array of up to 5 valid image URLs (filtered).
 */
async function searchTemplateImages(query) {
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
        q: query,
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
      if (!url) continue;
      if (/\.svg$/i.test(url)) continue;
      if (url.includes('placeholder') || url.includes('default-avatar')) continue;
      // Blacklist Meta CDNs — they block hotlinking with CORS/403 errors.
      if (/instagram\.com|lookaside|scontent|facebook\.com/i.test(url)) continue;
      valid.push(url);
    }
    return valid;
  } catch {
    return [];
  }
}

/**
 * Call Perplexity with a system + user prompt pair.
 * Returns parsed JSON or null on failure.
 */
async function callPerplexity(systemPrompt, userPrompt, apiKey) {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 600,
      temperature: 0.1,
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  // Strip markdown fences defensively.
  const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const templateName = typeof body.templateName === 'string' ? body.templateName.trim() : '';
  const venueName = typeof body.venueName === 'string' ? body.venueName.trim() : '';

  if (!templateName) {
    return NextResponse.json({ error: 'templateName is required' }, { status: 400 });
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Perplexity API key not configured' }, { status: 500 });
  }

  try {
    // ── Pass 1: Single Perplexity call — bio + category + vibes ─────────────
    // When a venue is specified, we inject an extra clause that tells the model
    // to write a bio rooted in THAT specific venue's branding — not a generic
    // description of the event type. This is the difference between
    // "Wonder Bar Music Bingo" and just "Music Bingo".
    const venueSpecificClause = venueName
      ? `\n- IMPORTANT: This event runs specifically at "${venueName}" (Jersey Shore area). The bio MUST reflect THAT location's particular character, crowd, and branding — not a generic description of the event type. If "${venueName}" has a known reputation (dive bar, upscale lounge, brewery, beach club, listening room, etc.), lean into it. Mention distinguishing details that would make a regular nod in recognition.`
      : '';

    const systemPrompt = `Act as a professional event curator and local guide. Write a three-sentence bio for "${templateName}". Describe the physical atmosphere, the crowd, and what a guest can expect to experience while attending.

Constraints:
- Strictly three sentences long.
- Do NOT mention past venues or history.
- Use evocative, high-energy language suitable for a discovery app.
- Use a 'Dark Mode' aesthetic in your descriptions — think moody, vibrant, and immersive.${venueSpecificClause}

Additionally classify with:
- category: MUST be exactly one of these canonical values: ${JSON.stringify(ALLOWED_CATEGORIES)}
- vibes: array chosen ONLY from Final-4 canonical values: ${JSON.stringify(ALLOWED_VIBES)}

CRITICAL RULES:
- 'category' is a single string, NOT an array. Pick the single best fit.
- Any category or vibe not in the allowed lists will be discarded.
- Select 1-2 vibes that best fit the event's described atmosphere.
- If insufficient information to write a meaningful bio, return exactly: { "bio": "NEEDS_MANUAL_REVIEW", "category": null, "vibes": [] }

Return the response as a strict JSON object containing 'bio', 'category' (string), and 'vibes' (array of strings). No markdown, no commentary, no code fences.`;

    const userPrompt = venueName
      ? `Event Template: "${templateName}"\nVenue: "${venueName}" (Jersey Shore area)\n\nGenerate the bio, category, and vibes for this recurring event.`
      : `Event Template: "${templateName}" (Jersey Shore area)\n\nGenerate the bio, category, and vibes for this recurring event.`;

    const aiResult = await callPerplexity(systemPrompt, userPrompt, apiKey);

    // ── Normalize text results ──────────────────────────────────────────────
    const rawBio = typeof aiResult?.bio === 'string' ? aiResult.bio.trim() : '';
    const needsReview = !rawBio || rawBio === 'NEEDS_MANUAL_REVIEW';
    const bio = needsReview ? null : rawBio;

    // Category — single string, must be in allowlist; null otherwise (triggers "Needs Review" in UI).
    const rawCategory = typeof aiResult?.category === 'string' ? aiResult.category : null;
    const category = rawCategory && ALLOWED_CATEGORIES.includes(rawCategory) ? rawCategory : null;

    // Vibes — filter against Final-4 allowlist, cap at 2.
    const rawVibes = Array.isArray(aiResult?.vibes) ? aiResult.vibes : [];
    const vibes = rawVibes.filter(v => ALLOWED_VIBES.includes(v)).slice(0, 2);

    // ── Pass 2: Serper image search — 3-tier hierarchy ──────────────────────
    let imageCandidates = [];
    let imageSource = null;

    const tiers = [];
    if (venueName) tiers.push(`${templateName} ${venueName} live action photo`);
    tiers.push(`${templateName} official promo photo`);
    if (venueName) tiers.push(`${venueName} interior atmosphere photo`);

    try {
      for (const query of tiers) {
        const results = await searchTemplateImages(query);
        if (results.length > 0) {
          imageCandidates = results;
          imageSource = 'Serper';
          break;
        }
      }

      if (imageCandidates.length === 0) {
        // All tiers empty — fall back to 3 random Unsplash placeholders.
        const shuffled = [...FALLBACK_IMAGES].sort(() => Math.random() - 0.5);
        imageCandidates = shuffled.slice(0, 3);
        imageSource = 'placeholder';
      }
    } catch {
      const shuffled = [...FALLBACK_IMAGES].sort(() => Math.random() - 0.5);
      imageCandidates = shuffled.slice(0, 3);
      imageSource = 'placeholder';
    }

    // ── Response ────────────────────────────────────────────────────────────
    const result = {
      bio,
      category,
      vibes,
      image_url: imageCandidates[0] || null,
      image_candidates: imageCandidates,
      bio_source: 'Perplexity',
      image_source: imageSource,
      needs_review: needsReview || category === null,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('AI lookup error (event-templates):', err);
    return NextResponse.json(
      { error: 'Failed to reach AI service' },
      { status: 502 }
    );
  }
}
