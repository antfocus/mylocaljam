// lib/scrapers/reefAndBoatyard.js
// Reef & Barrel + Boatyard 401 — best-effort scrapers
// These sites lack structured event data. Community submissions recommended.

export async function scrapeReefAndBarrel() {
  const events = [];
  let error = null;

  try {
    const res = await fetch('https://www.reefandbarrel.com/events', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const timePattern = /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\b/g;
    const blockRegex = /<(?:div|section|article)[^>]*>([\s\S]{20,400}?)<\/(?:div|section|article)>/gi;
    const seen = new Set();
    let blockMatch;

    while ((blockMatch = blockRegex.exec(html)) !== null) {
      const text = blockMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const dateMatch = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?/i);
      if (!dateMatch) continue;

      const titleMatch = text.match(/^([A-Z][^.!?\n]{5,60})/);
      if (!titleMatch) continue;

      const title = titleMatch[1].trim();
      if (seen.has(title)) continue;
      seen.add(title);

      const parsed = new Date(dateMatch[0]);
      if (isNaN(parsed.getTime()) || parsed < new Date()) continue;

      const date = parsed.toISOString().split('T')[0];
      const timeMatch = text.match(timePattern);
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);

      events.push({
        title,
        venue: 'Reef & Barrel',
        date,
        time: timeMatch ? timeMatch[0].toUpperCase() : null,
        end_time: null,
        description: null,
        image_url: null,
        ticket_url: 'https://www.reefandbarrel.com/events',
        price: null,
        source_url: 'https://www.reefandbarrel.com/events',
        external_id: `reefandbarrel-${date}-${slug}`,
        approved: true,
      });
    }

    console.log(`[ReefAndBarrel] Found ${events.length} events (best-effort)`);
  } catch (err) {
    error = err.message;
    console.error('[ReefAndBarrel] Scraper error:', err.message);
  }

  return { events, error };
}

// Boatyard 401 has no events calendar — returns empty.
// Check @boatyard401 on Instagram or use community submissions.
export async function scrapeBoatyard401() {
  console.log('[Boatyard401] No events calendar found — skipping.');
  return { events: [], error: null };
}