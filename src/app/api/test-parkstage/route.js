// Temporary diagnostic — find ParkStage Discovery API venue ID
// Visit: https://mylocaljam.com/api/test-parkstage
// Delete after use

export async function GET() {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return Response.json({ error: 'No TICKETMASTER_API_KEY set' });

  const results = {};

  // 1. Search venues by keyword to find the Discovery API ID
  try {
    const searchUrl = `https://app.ticketmaster.com/discovery/v2/venues.json?keyword=ParkStage&stateCode=NJ&apikey=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const searchJson = await searchRes.json();
    results.venueSearch = (searchJson._embedded?.venues || []).map(v => ({
      id: v.id,
      name: v.name,
      city: v.city?.name,
      state: v.state?.stateCode,
      address: v.address?.line1,
      url: v.url,
    }));
  } catch (e) {
    results.venueSearchError = e.message;
  }

  // 2. Try fetching events with the current numeric ID (237860)
  try {
    const legacyUrl = `https://app.ticketmaster.com/discovery/v2/events.json?venueId=237860&size=5&apikey=${apiKey}`;
    const legacyRes = await fetch(legacyUrl);
    const legacyJson = await legacyRes.json();
    const items = legacyJson._embedded?.events || [];
    results.legacyIdEvents = {
      count: items.length,
      events: items.map(e => ({
        name: e.name,
        date: e.dates?.start?.localDate,
        hasImages: (e.images?.length || 0) > 0,
        imageCount: e.images?.length || 0,
      })),
    };
  } catch (e) {
    results.legacyIdError = e.message;
  }

  // 3. If we found a Discovery API ID, try that too
  const discoveryId = results.venueSearch?.[0]?.id;
  if (discoveryId && discoveryId !== '237860') {
    try {
      const discUrl = `https://app.ticketmaster.com/discovery/v2/events.json?venueId=${discoveryId}&size=5&apikey=${apiKey}`;
      const discRes = await fetch(discUrl);
      const discJson = await discRes.json();
      const items = discJson._embedded?.events || [];
      results.discoveryIdEvents = {
        discoveryId,
        count: items.length,
        events: items.map(e => ({
          name: e.name,
          date: e.dates?.start?.localDate,
          hasImages: (e.images?.length || 0) > 0,
          imageCount: e.images?.length || 0,
          sampleImage: e.images?.find(i => i.ratio === '16_9' && i.width > 500)?.url || e.images?.[0]?.url,
        })),
      };
    } catch (e) {
      results.discoveryIdError = e.message;
    }
  }

  return Response.json(results, { status: 200 });
}
