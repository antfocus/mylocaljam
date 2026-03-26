#!/usr/bin/env node
/**
 * Test script: Run the Sea.Hear.Now poster (or any poster URL) through Gemini OCR.
 *
 * Usage:
 *   GOOGLE_AI_KEY=your_key node test-ocr-poster.mjs [image_url]
 *
 * If no image_url is provided, uses the Sea.Hear.Now 2026 poster from their site.
 */

// Load .env.local
import { readFileSync } from 'fs';
try {
  const envFile = readFileSync('.env.local', 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([A-Z_]+)="?(.+?)"?$/);
    if (match) process.env[match[1]] = match[2];
  });
} catch {}

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_INSTRUCTION = `You are an expert data extractor for a live music event database. I will provide an image of a concert or festival poster. Your job is to extract the event details and return a strict JSON array of objects.

Extraction Rules:
1. Identify the Event/Festival Name: (e.g., Sea.Hear.Now).
2. Identify the Venue/City: (e.g., Asbury Park, NJ).
3. Date Mapping: If the poster lists multiple days (e.g., Saturday vs. Sunday) and a general weekend date (e.g., Sept 19 & 20, 2026), you MUST map the correct specific date to the corresponding artists. Saturday artists get the first date; Sunday artists get the second date.
4. Filter Non-Musical Acts: Ignore sponsors, vendors, or specific non-music categories. For example, if there is a "SURF" section, DO NOT extract those names as bands.
5. JSON Schema: Return an array of objects matching this exact structure: [{"event_name": "string", "venue": "string", "date": "YYYY-MM-DD", "artist_name": "string"}]. Do not include any markdown formatting or explanations outside of the JSON array.`;

async function main() {
  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) {
    console.error('❌ GOOGLE_AI_KEY not set. Run with: GOOGLE_AI_KEY=xxx node test-ocr-poster.mjs');
    process.exit(1);
  }

  const imageUrl = process.argv[2] || 'https://seahearnowfestival.com/wp-content/uploads/2025/03/SHN2026_Lineup_1080x1350.jpg';
  console.log(`🎤 Testing OCR with: ${imageUrl}\n`);

  // Download image
  console.log('📥 Downloading image...');
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
  const buffer = await imgRes.arrayBuffer();
  const base64Data = Buffer.from(buffer).toString('base64');
  const mimeType = imageUrl.includes('.png') ? 'image/png' : 'image/jpeg';
  console.log(`   ${Math.round(base64Data.length * 0.75 / 1024)}KB, ${mimeType}`);

  // Call Gemini
  console.log('🤖 Calling Gemini 2.5 Flash...');
  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{
        role: 'user',
        parts: [
          { text: 'The current month is March 2026. Extract all live music events from this poster.' },
          { inline_data: { mime_type: mimeType, data: base64Data } },
        ],
      }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              event_name: { type: 'STRING' },
              venue: { type: 'STRING' },
              date: { type: 'STRING' },
              artist_name: { type: 'STRING' },
            },
            required: ['artist_name', 'date'],
          },
        },
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`❌ Gemini error ${res.status}:`, body.slice(0, 500));
    process.exit(1);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const events = JSON.parse(content);

  console.log(`\n✅ Extracted ${events.length} events:\n`);

  // Group by date
  const byDate = {};
  events.forEach(e => {
    const d = e.date || 'unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(e);
  });

  for (const [date, evts] of Object.entries(byDate).sort()) {
    console.log(`📅 ${date} (${evts.length} artists)`);
    evts.forEach(e => console.log(`   🎵 ${e.artist_name}${e.event_name ? ` [${e.event_name}]` : ''}${e.venue ? ` @ ${e.venue}` : ''}`));
    console.log();
  }

  // Check for surf athletes (should be filtered out)
  const surfNames = ['Sam Hammer', 'Cassidy McClain', 'Cam Richards', 'Balaram Stack', 'Rob Kelly', 'Pat Schmidt'];
  const leaks = events.filter(e => surfNames.some(s => e.artist_name.toLowerCase().includes(s.toLowerCase())));
  if (leaks.length > 0) {
    console.log('⚠️  SURF section leaked through:');
    leaks.forEach(e => console.log(`   ❌ ${e.artist_name}`));
  } else {
    console.log('✅ SURF section correctly filtered out');
  }

  // Output raw JSON
  console.log('\n📋 Raw JSON:');
  console.log(JSON.stringify(events, null, 2));
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
