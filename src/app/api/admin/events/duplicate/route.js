import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase';

/**
 * POST /api/admin/events/duplicate
 *
 * Clone an existing event row to N additional dates. Optionally creates a
 * parent `event_series` row and links source + new events to it, so a
 * multi-night theater run / residency / weekly recurring shows can be
 * created from a single source row in one click.
 *
 * Body shape:
 *   {
 *     source_event_id: 'uuid',
 *     performances: [
 *       { event_date: '2026-04-25T23:30:00.000Z' },  // ISO string, UTC
 *       ...
 *     ],
 *     // Optional — only honored when the source event has no series yet.
 *     series?: {
 *       create: true,            // when true, makes a new event_series row
 *       name?: string,           // default = source.artist_name
 *       slug?: string,           // default = slugify(name) + '-' + year
 *       category?: string,       // default = 'concert_series'
 *     }
 *   }
 *
 * Behavior:
 *   • If `source.series_id` is already set, all new events inherit it and
 *     the `series` block is ignored (you don't accidentally fork an
 *     existing series).
 *   • If `series.create` is true and source has no series, we INSERT a
 *     new event_series row, UPDATE source.series_id, then INSERT the
 *     N new events with the same series_id. Series start/end dates span
 *     all performances (source + new).
 *   • Otherwise the new events are independent rows (no grouping).
 *   • Every other field is copied verbatim from the source: artist,
 *     venue, image, bio, locked status, custom_genres/vibes, source.
 *     Only id / event_date / created_at / updated_at / verified_at /
 *     series_id are not copied (they're set fresh).
 *   • triage_status is forced to 'reviewed' since these are admin-
 *     authored copies that don't need re-triage.
 *
 * Response: { new_events: [{id, event_date}], series_id, series_created, source_id }
 */

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/['\u2018\u2019\u201C\u201D"]/g, '')   // strip smart + plain quotes
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled-series';
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { source_event_id, performances, series } = body || {};

  if (!source_event_id || !Array.isArray(performances) || performances.length === 0) {
    return NextResponse.json(
      { error: 'source_event_id and performances[] required' },
      { status: 400 },
    );
  }
  if (performances.length > 30) {
    return NextResponse.json(
      { error: 'Max 30 performances per request' },
      { status: 400 },
    );
  }

  // Validate + normalize each performance's date to a strict ISO timestamp.
  let isoDates;
  try {
    isoDates = performances.map((p, i) => {
      const ts = typeof p === 'string' ? p : p?.event_date;
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`Invalid event_date at performances[${i}]: ${JSON.stringify(ts)}`);
      }
      return d.toISOString();
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // Fetch the source event
  const { data: source, error: sourceErr } = await supabase
    .from('events')
    .select('*')
    .eq('id', source_event_id)
    .single();

  if (sourceErr || !source) {
    return NextResponse.json({ error: 'Source event not found' }, { status: 404 });
  }

  // Resolve which series_id the new rows should carry.
  let seriesId = source.series_id || null;
  let createdSeries = null;

  if (!seriesId && series?.create) {
    const seriesName = (series.name || source.artist_name || '').trim() || 'Untitled Series';
    const year = new Date(source.event_date || isoDates[0]).getUTCFullYear();
    const slug = (series.slug && series.slug.trim()) || `${slugify(seriesName)}-${year}`;
    const category = series.category || 'concert_series';

    // Span from earliest to latest of (source + new) dates
    const allDates = [source.event_date, ...isoDates]
      .map(d => new Date(d).toISOString().slice(0, 10))
      .sort();

    const { data: newSeries, error: seriesErr } = await supabase
      .from('event_series')
      .insert({
        name: seriesName,
        slug,
        category,
        venue_id: source.venue_id || null,
        description: source.custom_bio || source.artist_bio || null,
        banner_url: source.custom_image_url || source.image_url || source.event_image_url || null,
        start_date: allDates[0],
        end_date: allDates[allDates.length - 1],
      })
      .select()
      .single();

    if (seriesErr) {
      return NextResponse.json(
        { error: `Failed to create series: ${seriesErr.message}` },
        { status: 500 },
      );
    }

    seriesId = newSeries.id;
    createdSeries = newSeries;

    // Link the source event so it's part of the new series too
    const { error: linkErr } = await supabase
      .from('events')
      .update({ series_id: seriesId, updated_at: new Date().toISOString() })
      .eq('id', source_event_id);

    if (linkErr) {
      // Series exists but source didn't get linked — soft warn, continue.
      console.warn('[duplicate] Failed to link source to new series:', linkErr.message);
    }
  }

  // Build the new event rows. Strip fields that must be set fresh per row,
  // then overlay event_date / series_id / triage_status / verified_at.
  const SKIP_FIELDS = new Set([
    'id',
    'created_at',
    'updated_at',
    'verified_at',
    'event_date',
    'series_id',
    'triage_status',
  ]);
  const cloneFields = Object.keys(source).filter(k => !SKIP_FIELDS.has(k));

  const nowIso = new Date().toISOString();
  const newRows = isoDates.map((eventDate) => {
    const row = {};
    for (const k of cloneFields) row[k] = source[k];
    row.event_date = eventDate;
    row.series_id = seriesId;
    row.triage_status = 'reviewed';
    row.verified_at = nowIso;
    return row;
  });

  const { data: inserted, error: insertErr } = await supabase
    .from('events')
    .insert(newRows)
    .select('id, event_date');

  if (insertErr) {
    return NextResponse.json(
      { error: `Insert failed: ${insertErr.message}` },
      { status: 500 },
    );
  }

  // Bust the home page so the new events surface promptly.
  try { revalidatePath('/'); } catch {}

  return NextResponse.json({
    new_events: inserted,
    series_id: seriesId,
    series_created: createdSeries,
    source_id: source_event_id,
  });
}
