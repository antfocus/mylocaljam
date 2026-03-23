import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, buildEmailHtml } from '@/lib/sendEmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel function timeout

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get today's date in Eastern time as YYYY-MM-DD */
function todayEastern() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Insert a notification row (admin client — bypasses RLS) */
async function insertNotification(supabase, { user_id, title, body, target_url, trigger }) {
  const { error } = await supabase.from('notifications').insert({
    user_id, title, body, target_url, trigger,
  });
  if (error) console.error(`[notify] Insert notification error:`, error.message);
}

/** Log email sent (dedup index prevents duplicates) */
async function logEmailSent(supabase, { user_id, event_id, trigger, email, subject }) {
  const { error } = await supabase.from('notification_emails_sent').insert({
    user_id, event_id, trigger, email, subject,
  });
  // Unique constraint violation = already sent → not an error
  if (error && !error.message.includes('duplicate')) {
    console.error(`[notify] Log email error:`, error.message);
  }
  return !error || error.message.includes('duplicate');
}

/** Check if user has email notifications enabled */
async function userWantsEmail(supabase, userId) {
  const { data } = await supabase
    .from('user_notification_preferences')
    .select('email_enabled')
    .eq('user_id', userId)
    .single();
  // Default to true if no row exists (new users get emails by default)
  return data?.email_enabled !== false;
}

/** Check if user has in-app notifications enabled */
async function userWantsInApp(supabase, userId) {
  const { data } = await supabase
    .from('user_notification_preferences')
    .select('in_app_enabled')
    .eq('user_id', userId)
    .single();
  return data?.in_app_enabled !== false;
}

/** Fetch user email by ID */
async function getUserEmail(supabase, userId) {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email || null;
}

// ── Trigger A: Tracked Show Reminder (10 AM daily) ──────────────────────────

async function triggerTrackedShowReminder(supabase) {
  const today = todayEastern();
  console.log(`[Trigger A] Running Tracked Show Reminder for ${today}`);

  // Find all saved events happening today, with user + event details
  const { data: savedEvents, error } = await supabase
    .from('user_saved_events')
    .select('user_id, event_id, events(id, artist_name, venue_name, event_date, status)')
    .not('events', 'is', null);

  if (error) {
    console.error('[Trigger A] Query error:', error.message);
    return { trigger: 'tracked_show', sent: 0, error: error.message };
  }

  // Filter to today's published events
  const todaysTracked = (savedEvents || []).filter(row => {
    if (!row.events || row.events.status !== 'published') return false;
    const eventDate = new Date(row.events.event_date)
      .toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return eventDate === today;
  });

  console.log(`[Trigger A] Found ${todaysTracked.length} tracked events for today`);

  let sent = 0;
  for (const row of todaysTracked) {
    const ev = row.events;
    const artistName = ev.artist_name || 'Live Music';
    const venueName = ev.venue_name || 'a local venue';
    const timeStr = new Date(ev.event_date).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
    });

    const title = `Today! ${artistName} @ ${venueName}`;
    const body = `Don\u2019t forget\u2014you\u2019re tracking ${artistName} tonight. Doors at ${timeStr}. See you there!`;
    const target_url = `/events/${ev.id}`;

    // In-app notification
    if (await userWantsInApp(supabase, row.user_id)) {
      await insertNotification(supabase, {
        user_id: row.user_id, title, body, target_url, trigger: 'tracked_show',
      });
    }

    // Email
    if (await userWantsEmail(supabase, row.user_id)) {
      const email = await getUserEmail(supabase, row.user_id);
      if (email) {
        const html = buildEmailHtml({ title, body, linkUrl: target_url, linkLabel: 'View Your Show' });
        const result = await sendEmail({ to: email, subject: title, html });
        if (result.success) {
          await logEmailSent(supabase, {
            user_id: row.user_id, event_id: ev.id, trigger: 'tracked_show', email, subject: title,
          });
          sent++;
        }
      }
    }
  }

  return { trigger: 'tracked_show', matched: todaysTracked.length, emailsSent: sent };
}

// ── Trigger B: New Show Added (called from sync pipeline) ───────────────────

async function triggerNewShowAdded(supabase, { newEventIds } = {}) {
  console.log(`[Trigger B] Processing ${newEventIds?.length || 0} new events`);
  if (!newEventIds || newEventIds.length === 0) return { trigger: 'new_show', sent: 0 };

  // Fetch full event details
  const { data: events } = await supabase
    .from('events')
    .select('id, artist_name, venue_name, event_date')
    .in('id', newEventIds);

  if (!events || events.length === 0) return { trigger: 'new_show', sent: 0 };

  let totalNotifs = 0;
  let totalEmails = 0;

  for (const ev of events) {
    if (!ev.artist_name) continue;

    // Find all users following this artist (with notifications enabled)
    const { data: followers } = await supabase
      .from('user_followed_artists')
      .select('user_id')
      .eq('artist_name', ev.artist_name)
      .eq('receives_notifications', true);

    if (!followers || followers.length === 0) continue;

    const artistName = ev.artist_name;
    const venueName = ev.venue_name || 'a local venue';
    const eventDate = new Date(ev.event_date).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York',
    });
    const title = `Just Added: ${artistName} at ${venueName}`;
    const body = `Rock on! ${artistName} just added a new date on ${eventDate}. Check it out and track the show to get a reminder.`;
    const target_url = `/events/${ev.id}`;

    for (const follower of followers) {
      // In-app
      if (await userWantsInApp(supabase, follower.user_id)) {
        await insertNotification(supabase, {
          user_id: follower.user_id, title, body, target_url, trigger: 'new_show',
        });
        totalNotifs++;
      }

      // Email
      if (await userWantsEmail(supabase, follower.user_id)) {
        const email = await getUserEmail(supabase, follower.user_id);
        if (email) {
          const html = buildEmailHtml({ title, body, linkUrl: target_url, linkLabel: 'Check It Out' });
          const result = await sendEmail({ to: email, subject: title, html });
          if (result.success) {
            await logEmailSent(supabase, {
              user_id: follower.user_id, event_id: ev.id, trigger: 'new_show', email, subject: title,
            });
            totalEmails++;
          }
        }
      }
    }
  }

  return { trigger: 'new_show', events: events.length, notifications: totalNotifs, emailsSent: totalEmails };
}

// ── Trigger C: Followed Artist Discovery Nudge (12 PM daily) ────────────────

async function triggerArtistDiscovery(supabase) {
  const today = todayEastern();
  console.log(`[Trigger C] Running Followed Artist Discovery for ${today}`);

  // Find all published events happening today
  const startOfDay = `${today}T00:00:00-05:00`;
  const endOfDay = `${today}T23:59:59-05:00`;

  const { data: todaysEvents, error } = await supabase
    .from('events')
    .select('id, artist_name, venue_name, event_date')
    .eq('status', 'published')
    .gte('event_date', startOfDay)
    .lte('event_date', endOfDay)
    .not('artist_name', 'is', null);

  if (error) {
    console.error('[Trigger C] Query error:', error.message);
    return { trigger: 'artist_discovery', sent: 0, error: error.message };
  }

  console.log(`[Trigger C] Found ${todaysEvents?.length || 0} events today`);

  let sent = 0;

  for (const ev of (todaysEvents || [])) {
    // Find users who follow this artist
    const { data: followers } = await supabase
      .from('user_followed_artists')
      .select('user_id')
      .eq('artist_name', ev.artist_name)
      .eq('receives_notifications', true);

    if (!followers || followers.length === 0) continue;

    // Get users who are ALREADY tracking this event (to exclude them)
    const { data: trackers } = await supabase
      .from('user_saved_events')
      .select('user_id')
      .eq('event_id', ev.id);

    const trackerIds = new Set((trackers || []).map(t => t.user_id));

    const timeStr = new Date(ev.event_date).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
    });

    for (const follower of followers) {
      // Skip users already tracking this event
      if (trackerIds.has(follower.user_id)) continue;

      if (await userWantsInApp(supabase, follower.user_id)) {
        await insertNotification(supabase, {
          user_id: follower.user_id,
          title: `${ev.artist_name} is playing today!`,
          body: `Heads up: ${ev.artist_name} has a set at ${ev.venue_name || 'a local venue'} starting at ${timeStr}.`,
          target_url: `/events/${ev.id}`,
          trigger: 'artist_discovery',
        });
        sent++;
      }
      // NO email for Trigger C — in-app only
    }
  }

  return { trigger: 'artist_discovery', events: todaysEvents?.length || 0, notificationsSent: sent };
}

// ── HTTP Handlers ────────────────────────────────────────────────────────────

/**
 * GET /api/notify?trigger=tracked_show|artist_discovery
 * Called by Vercel Cron.
 *
 * POST /api/notify
 * Called internally from sync pipeline for Trigger B.
 * Body: { trigger: 'new_show', newEventIds: ['uuid1', 'uuid2'] }
 */

export async function GET(request) {
  // Optional auth check for cron
  const authHeader = request.headers.get('Authorization') || '';
  const secret = process.env.SYNC_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();
  const { searchParams } = new URL(request.url);
  const trigger = searchParams.get('trigger');

  let result;
  if (trigger === 'tracked_show') {
    result = await triggerTrackedShowReminder(supabase);
  } else if (trigger === 'artist_discovery') {
    result = await triggerArtistDiscovery(supabase);
  } else {
    return NextResponse.json({ error: 'Provide ?trigger=tracked_show or artist_discovery' }, { status: 400 });
  }

  return NextResponse.json(result);
}

export async function POST(request) {
  // Internal calls from sync pipeline — use admin auth
  const authHeader = request.headers.get('Authorization') || '';
  const secret = process.env.SYNC_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const supabase = getAdminClient();

  if (body.trigger === 'new_show' && body.newEventIds) {
    const result = await triggerNewShowAdded(supabase, { newEventIds: body.newEventIds });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Invalid trigger' }, { status: 400 });
}
