// lib/scrapers/barAnticipation.js
// Bar Anticipation (Bar A) — HTML scraper using All-in-One Event Calendar plugin

const PAGE_URL = 'https://bar-a.com/entertainment-calendar/';

function parseEvents(html) {
  const events = [];
  
  // Find all event divs with class ailec-event-id-*
  const eventRegex = /class="ailec-event-id-(\d+)[^"]*"[^>]*>[\s\S]*?<span class="ailec-event-title">([^<]+)<\/span>[\s\S]*?<div class="ailec-event-time">([^<]+)<\/div>/g;
  
  let match;
  const seen = new Set();
  
  while ((match = eventRegex.exec(html)) !== null) {
    const eventId = match[1];
    const title = match[2].trim();
    const timeStr = match[3].trim(); // "Mar 9 @ 5:30 PM – 8:30 PM"
    
    if (seen.has(eventId)) continue;
    seen.add(eventId);
    
    // Parse date and time: "Mar 9 @ 5:30 PM – 8:30 PM"
    const dateMatch = timeStr.match(/(\w+)\s+(\d{1,2})\s+@\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!dateMatch) continue;
    
    const monthStr = dateMatch[1];
    const day = dateMatch[2];
    const hour = dateMatch[3];
    const min = dateMatch[4];
    const ampm = dateMatch[5].toUpperCase();
    
    const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
    const monthNum = months[monthStr.slice(0, 3)];
    if (!monthNum) continue;
    
    const date = `2026-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    let h = parseInt(hour);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    const time = `${h % 12 || 12}:${min} ${ampm}`;
    
    // Extract end time if present
    const endMatch = timeStr.match(/–\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    let endTime = null;
    if (endMatch) {
      let eh = parseInt(endMatch[1]);
      const eampm = endMatch[3].toUpperCase();
      if (eampm === 'PM' && eh !== 12) eh += 12;
      if (eampm === 'AM' && eh === 12) eh = 0;
      endTime = `${eh % 12 || 12}:${endMatch[2]} ${eampm}`;
    }
    
    events.push({
      title,
      venue: 'Bar Anticipation',
      date,
      time,
      end_time: endTime,
      description: null,
      image_url: null,
      ticket_url: PAGE_URL,
      price: null,
      source_url: PAGE_URL,
      external_id: `baranticipation-${eventId}`,
      approved: true,
    });
  }
  
  return events;
}

export async function scrapeBarAnticipation() {
  const events = [];
  let error = null;

  try {
    const res = await fetch(PAGE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyLocalJam/1.0)' },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    events.push(...parseEvents(html));

    console.log(`[BarAnticipation] Found ${events.length} events`);
  } catch (err) {
    error = err.message;
    console.error('[BarAnticipation] Scraper error:', err.message);
  }

  return { events, error };
}