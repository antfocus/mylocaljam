// lib/scrapers/barAnticipation.js
// Bar Anticipation (Bar A) — HTML scraper
// Events at: bar-a.com/entertainment-calendar

const API_URL = 'https://bar-a.com/entertainment-calendar/';

function parseEvents(html) {
  const events = [];
  
  // Look for event containers - they appear as divs with event info
  // Pattern: event date/title blocks
  const eventPattern = /(?:MAR|JAN|FEB|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})[^\d]*?(\d{1,2}):(\d{2})\s*(AM|PM)[^\n]*?([A-Z][^\n]+?)(?=(?:MAR|JAN|FEB|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d|$)/gis;
  
  let match;
  const seen = new Set();
  
  while ((match = eventPattern.exec(html)) !== null) {
    const day = match[1];
    const hour = parseInt(match[2]);
    const min = match[3];
    const ampm = match[4].toUpperCase();
    const title = match[5].trim();
    
    if (seen.has(title)) continue;
    seen.add(title);
    
    // Build date - assume current year (2026)
    const monthMatch = html.substring(Math.max(0, match.index - 50), match.index).match(/(?:MAR|JAN|FEB|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i);
    if (!monthMatch) continue;
    
    const months = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
    const month = String(months[monthMatch[0].toUpperCase()]).padStart(2, '0');
    const date = `2026-${month}-${String(day).padStart(2, '0')}`;
    
    let h = hour;
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    const time = `${h % 12 || 12}:${min} ${ampm}`;
    
    events.push({
      title: title.replace(/[–—]/g, '-'),
      venue: 'Bar Anticipation',
      date,
      time,
      end_time: null,
      description: null,
      image_url: null,
      ticket_url: API_URL,
      price: null,
      source_url: API_URL,
      external_id: `baranticipation-${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
      approved: true,
    });
  }
  
  return events;
}

export async function scrapeBarAnticipation() {
  const events = [];
  let error = null;

  try {
    const res = await fetch(API_URL, {
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