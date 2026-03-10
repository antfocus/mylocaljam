// Temporary cleanup — delete duplicate ParkStage events from HTML scraper
// Visit: https://mylocaljam.com/api/test-parkstage
// Delete this file after use

import { getAdminClient } from '@/lib/supabase';

export async function GET() {
  const supabase = getAdminClient();

  // Find all ParkStage events from the HTML scraper (external_id starts with "parkstage-")
  const { data: dupes, error: fetchErr } = await supabase
    .from('events')
    .select('id, artist_name, external_id, event_date')
    .like('external_id', 'parkstage-%');

  if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 });

  if (!dupes?.length) {
    return Response.json({ ok: true, message: 'No HTML scraper ParkStage duplicates found', count: 0 });
  }

  // Delete them
  const ids = dupes.map(d => d.id);
  const { error: delErr } = await supabase
    .from('events')
    .delete()
    .in('id', ids);

  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

  return Response.json({
    ok: true,
    deleted: dupes.length,
    events: dupes.map(d => ({ name: d.artist_name, date: d.event_date, external_id: d.external_id })),
  });
}
