/**
 * Edge Runtime proxy for fetching pages blocked by Cloudflare.
 *
 * Vercel Edge Functions run on Cloudflare's edge network, which has
 * different IP ranges and TLS characteristics than Vercel's Node.js
 * serverless functions. Some sites that block serverless IPs (403)
 * will allow Edge requests through.
 *
 * Usage: POST /api/fetch-proxy { url: "https://..." }
 * Auth:  Bearer <SYNC_SECRET>
 */
export const runtime = 'edge';

export async function POST(request) {
  // Auth check — same secret as sync-events
  const secret = process.env.SYNC_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const { url } = await request.json();
    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing url' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const html = await res.text();

    return new Response(JSON.stringify({
      status: res.status,
      html,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
