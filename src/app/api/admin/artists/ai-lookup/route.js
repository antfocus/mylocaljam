import { NextResponse } from 'next/server';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// Allowed tags — the AI is restricted to ONLY these values.
// NOTE (2026-04-14): ALLOWED_GENRES is the canonical 18-item flat list.
// Mirrors GENRES in src/lib/utils.js — keep in lockstep. 'Latin' was added
// after the utils.js migration to cover legacy 'Latin / Reggaeton' and
// 'Latin / World' rows that had no other home.
const ALLOWED_GENRES = [
  'Rock', 'Pop', 'Country', 'Acoustic', 'Cover Band', 'DJ', 'Electronic',
  'Jazz', 'Blues', 'Reggae', 'R&B', 'Hip Hop', 'Latin', 'Emo', 'Punk', 'Metal',
  'Indie', 'Folk',
];
const ALLOWED_VIBES = ['Chill / Low Key', 'Energetic / Party', 'Outdoor / Patio', 'Family-Friendly'];

// Premium placeholder fallback images — abstract music visuals
// Used when image search returns zero results
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
 * Search for artist images via Serper.dev Google Image Search.
 * Returns an array of up to 5 valid image URLs.
 */
async function searchArtistImages(artistName) {
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

    // Filter and return up to 5 valid image URLs
    const valid = [];
    for (const img of images) {
      if (valid.length >= 5) break;
      const url = img.imageUrl || img.link;
      if (!url) continue;
      if (/\.svg$/i.test(url)) continue;
      if (url.includes('placeholder') || url.includes('default-avatar')) continue;
      // Blacklist Meta CDNs — they block hotlinking with CORS/403 errors
      if (/instagram\.com|lookaside|scontent|facebook\.com/i.test(url)) continue;
      valid.push(url);
    }
    return valid;
  } catch {
    return [];
  }
}

/**
 * Call Perplexity with a system prompt and user message.
 * Returns the parsed JSON or null on failure.
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

  // Strip markdown fences
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

  const { artistName } = await request.json();

  if (!artistName || !artistName.trim()) {
    return NextResponse.json({ error: 'Artist name is required' }, { status: 400 });
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Perplexity API key not configured' }, { status: 500 });
  }

  const name = artistName.trim();

  try {
    // ── Pass 1: Bio Writer ──────────────────────────────────────────────────
    const bioSystemPrompt = `You are an expert local music journalist writing bios for bands playing around the Jersey Shore. Your goal is to write engaging, punchy bios that get locals excited to see live music.

Follow these strict rules:
1. Strictly 2-3 sentences. Maximum 60 words. You MUST complete the final sentence. Focus on their musical style and origin.
2. Always identify the band's primary genre and overall vibe (e.g., 'high-energy jam band,' 'acoustic rock,' 'classic rock covers').
3. Keep the tone authentic to the local live music scene—avoid cheesy marketing speak.
4. If the band has influences like the Grateful Dead or classic shore rock, highlight that musical style.
5. Do not include introductory filler like 'Here is a bio for...'
6. If the provided data is completely insufficient to figure out who they are, return exactly: NEEDS_MANUAL_REVIEW
7. Also return: "is_tribute" (boolean — true if they are primarily a cover band or tribute act).

Respond with valid JSON only: { "bio": "string", "is_tribute": boolean }
No markdown, no commentary, no code fences.`;

    const bioUserPrompt = `Write a bio for the band: "${name}". They may perform in the New Jersey / Jersey Shore area, or they may be a nationally known act. Search broadly. Return the JSON object.`;

    const bioResult = await callPerplexity(bioSystemPrompt, bioUserPrompt, apiKey);

    // ── Pass 2: Genre & Vibe Tagger ─────────────────────────────────────────
    const bioText = bioResult?.bio || '';
    const tagSystemPrompt = `You are a music categorization engine. Review the provided artist bio and assign them up to 3 Genres and up to 2 Vibes.

CRITICAL RULE: You may only select up to 3 genres from this exact list. Do not invent new genres. If you think it is Alternative Rock, just output Rock.

Allowed Genres: ${JSON.stringify(ALLOWED_GENRES)}
Allowed Vibes: ${JSON.stringify(ALLOWED_VIBES)}

Output Format: You must respond in strict JSON format:
{ "genres": ["string", "string", "string"], "vibes": ["string", "string"] }
No markdown, no commentary, no code fences.`;

    const tagUserPrompt = `Artist: "${name}"\nBio: "${bioText}"\n\nCategorize this artist using ONLY the allowed genre and vibe lists.`;

    const tagResult = await callPerplexity(tagSystemPrompt, tagUserPrompt, apiKey);

    // ── Normalize & validate ────────────────────────────────────────────────
    const bio = (typeof bioResult?.bio === 'string' && bioResult.bio !== 'NEEDS_MANUAL_REVIEW')
      ? bioResult.bio
      : null;

    // Validate genres against allowed list. Belt-and-suspenders against LLM
    // hallucinations even with the CRITICAL RULE in the prompt — any tag the
    // AI invents gets stripped here before it ever reaches the DB.
    // Back-compat: if the AI emits the legacy primary_genre/secondary_genres
    // shape instead of the flat `genres` array, we still flatten it.
    const rawGenres = Array.isArray(tagResult?.genres)
      ? tagResult.genres
      : [tagResult?.primary_genre, ...(tagResult?.secondary_genres || [])].filter(Boolean);
    const genres = rawGenres.filter(g => ALLOWED_GENRES.includes(g)).slice(0, 3);

    // Validate vibes against allowed list
    const rawVibes = tagResult?.vibes || [];
    const vibes = rawVibes.filter(v => ALLOWED_VIBES.includes(v)).slice(0, 2);

    // ── Pass 3: Image Search via Serper.dev ──────────────────────────────────
    let image_candidates = [];
    let image_source = null;
    try {
      image_candidates = await searchArtistImages(name);
      if (image_candidates.length > 0) {
        image_source = 'serper';
      } else {
        // Fallback: pick 3 random placeholders so there's still a carousel
        const shuffled = [...FALLBACK_IMAGES].sort(() => Math.random() - 0.5);
        image_candidates = shuffled.slice(0, 3);
        image_source = 'placeholder';
      }
    } catch {
      const shuffled = [...FALLBACK_IMAGES].sort(() => Math.random() - 0.5);
      image_candidates = shuffled.slice(0, 3);
      image_source = 'placeholder';
    }

    const result = {
      bio,
      genres: genres.length > 0 ? genres : [],
      vibes: vibes.length > 0 ? vibes : [],
      is_tribute: bioResult?.is_tribute === true,
      image_url: image_candidates[0] || null,            // best pick (backward compat)
      image_candidates,                                   // top 5 for carousel
      image_source,                                       // 'serper' or 'placeholder'
      needs_review: bioResult?.bio === 'NEEDS_MANUAL_REVIEW',
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('AI lookup error:', err);
    return NextResponse.json(
      { error: 'Failed to reach AI service' },
      { status: 502 }
    );
  }
}
