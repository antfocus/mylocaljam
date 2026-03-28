import { NextResponse } from 'next/server';

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

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

  const prompt = `Write a short, exciting event description (2-3 sentences max) for a live music event. Keep it punchy, engaging, and suitable for a local music discovery app. Do NOT use generic hype language. Focus on what makes this act worth seeing.

Artist: ${artist_name}
${venue_name ? `Venue: ${venue_name}` : ''}
${dateStr ? `Date: ${dateStr}` : ''}
${genre ? `Genre: ${genre}` : ''}
${current_description ? `Current description to improve: ${current_description}` : ''}

Write ONLY the description text — no quotes, no labels, no preamble.`;

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
          { role: 'system', content: 'You are a copywriter for a local live music discovery app called myLocalJam. Write concise, authentic event descriptions that make people want to attend. Avoid clichés and generic hype. No fluff words like "vibrant tapestry," "captivating," "sonic journey," or "mesmerizing."' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[AI Enhance] Perplexity error:', res.status, errText.slice(0, 300));
      return NextResponse.json({ error: 'AI service error' }, { status: 502 });
    }

    const data = await res.json();
    const enhanced = data.choices?.[0]?.message?.content?.trim() || '';

    if (!enhanced) {
      return NextResponse.json({ error: 'No content generated' }, { status: 500 });
    }

    return NextResponse.json({ enhanced });
  } catch (err) {
    console.error('[AI Enhance] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
