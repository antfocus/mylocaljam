import { NextResponse } from 'next/server';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
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

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: 'You are an expert music journalist who specializes in the New Jersey and Jersey Shore live music scene. You always respond with valid JSON and nothing else — no markdown, no commentary, no code fences.',
          },
          {
            role: 'user',
            content: `Research the band or musical artist named: "${artistName.trim()}". They may perform in the New Jersey / Jersey Shore area, or they may be a nationally known act. Search broadly. Return your response STRICTLY as a JSON object with the following keys:
- "bio": A highly concise, punchy description of the band's sound and history. STRICT MAXIMUM of 150 characters. It must fit perfectly inside a small mobile UI card without wrapping too many lines. Do not exceed this length.
- "genres": An array of 1 to 3 broad musical genres (e.g., ["Rock", "Cover Band"]).
- "vibes": An array of 1 to 2 vibe keywords that describe the energy of their live shows (e.g., ["High-Energy", "Party"]).
- "instagram_url": Search thoroughly for their official Instagram account. Try searching "[artist name] instagram" and "[artist name] official instagram". Return the full URL like https://www.instagram.com/handle. Only return null if you truly cannot find any Instagram presence after searching.
Do NOT include any markdown formatting, code fences, or conversational text outside the JSON object.`,
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Perplexity API error:', response.status, errText);
      return NextResponse.json(
        { error: `Perplexity API returned ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 502 });
    }

    // Strip any markdown code fences the model might add despite instructions
    const cleaned = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse Perplexity response:', cleaned);
      return NextResponse.json(
        { error: 'AI returned invalid format', raw: cleaned },
        { status: 502 }
      );
    }

    // Normalize the response to ensure consistent shape
    const result = {
      bio: typeof parsed.bio === 'string' ? parsed.bio : null,
      genres: Array.isArray(parsed.genres) ? parsed.genres : [],
      vibes: Array.isArray(parsed.vibes) ? parsed.vibes : [],
      instagram_url: typeof parsed.instagram_url === 'string' ? parsed.instagram_url : null,
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
