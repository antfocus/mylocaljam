/**
 * artistSweep.js — Retroactive event-to-artist linker.
 *
 * Why this exists:
 *   Auto-linking on event INSERT only catches events scraped AFTER the artist
 *   row + its alias_names exist. If an admin later (a) creates an artist row
 *   for a name that's been floating around in events.artist_name with
 *   artist_id=null, or (b) adds an alias to an existing artist that matches
 *   pre-existing event rows, those orphan events stay unlinked forever
 *   without an explicit sweep.
 *
 *   This helper does that sweep: given an artist row's id, it stamps
 *   events.artist_id on every artist_id=null event whose artist_name matches
 *   either the artist's canonical name or any entry in alias_names. Runs in
 *   one UPDATE so it's atomic from the caller's perspective.
 *
 * Where it's called:
 *   • POST /api/admin/artists (artist created) — catches events that already
 *     existed with the new artist's exact name.
 *   • PUT  /api/admin/artists (artist updated) — catches the alias-add case
 *     and any rename. Cheap to run on every PUT; the WHERE clause filters out
 *     anything already linked.
 *   • POST /api/admin/artists/promote (Promote-to-Artist button) — picks up
 *     sibling events sharing the artist_name beyond the one being promoted.
 *
 * Non-fatal:
 *   The caller's primary job is the artist row. Sweep failures should log,
 *   not block the response. Logged via the second arg's logger if provided.
 *
 * Returns: { swept, error }
 *   swept: number of events updated. Useful for the admin toast / debug logs.
 *   error: an error object or null. Caller decides how loud to be about it.
 */

export async function sweepEventsForArtist(supabase, artistId) {
  if (!supabase || !artistId) {
    return { swept: 0, error: new Error('sweepEventsForArtist: supabase and artistId required') };
  }

  // Pull the artist's canonical name + aliases. We don't trust the caller to
  // hand them in — fewer args, single source of truth, and we always sweep
  // against the row's CURRENT state (in case the caller's PUT just changed
  // the name or aliases mid-request).
  const { data: artist, error: fetchErr } = await supabase
    .from('artists')
    .select('id, name, alias_names')
    .eq('id', artistId)
    .single();

  if (fetchErr || !artist) {
    return { swept: 0, error: fetchErr || new Error('Artist not found for sweep') };
  }

  // Build the candidate name list (lowercased, trimmed). Always includes the
  // canonical name plus every entry in alias_names (if present). Filtered to
  // non-empty strings so a stray null/blank in the array doesn't match every
  // artist_name with extra whitespace.
  const candidates = new Set();
  const canon = (artist.name || '').trim().toLowerCase();
  if (canon) candidates.add(canon);
  if (Array.isArray(artist.alias_names)) {
    for (const a of artist.alias_names) {
      if (typeof a === 'string') {
        const lc = a.trim().toLowerCase();
        if (lc) candidates.add(lc);
      }
    }
  }
  if (candidates.size === 0) {
    return { swept: 0, error: null };
  }

  // Find unlinked upcoming events whose artist_name matches a candidate.
  // We use a two-step (select then update) instead of an .update().filter()
  // chain because supabase-js doesn't expose a clean way to do the lowercased
  // IN match server-side without RPC. Round-trip cost is fine — sweeps are
  // rare (only on artist save) and the candidate list is tiny.
  //
  // Past events deliberately excluded: re-linking a show that's already
  // happened mostly affects history pages and is lower-value than focusing
  // on the live feed. If we ever want to backfill history, drop the date
  // filter.
  const { data: orphans, error: findErr } = await supabase
    .from('events')
    .select('id, artist_name')
    .is('artist_id', null)
    .gte('event_date', new Date().toISOString());

  if (findErr) {
    return { swept: 0, error: findErr };
  }

  const matchedIds = (orphans || [])
    .filter(e => e.artist_name && candidates.has(e.artist_name.trim().toLowerCase()))
    .map(e => e.id);

  if (matchedIds.length === 0) {
    return { swept: 0, error: null };
  }

  const { error: updateErr } = await supabase
    .from('events')
    .update({ artist_id: artist.id })
    .in('id', matchedIds);

  if (updateErr) {
    return { swept: 0, error: updateErr };
  }

  return { swept: matchedIds.length, error: null };
}
