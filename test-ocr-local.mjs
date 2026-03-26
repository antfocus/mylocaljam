#!/usr/bin/env node
/**
 * Test Gemini OCR with a local image file (base64 encoded).
 * Usage: node test-ocr-local.mjs /path/to/image.jpg
 */
import { readFileSync } from 'fs';

// Load .env.local from current working directory
import { resolve } from 'path';
try {
  const envPath = resolve(process.cwd(), '.env.local');
  const envFile = readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
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
    console.error('No GOOGLE_AI_KEY');
    process.exit(1);
  }

  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node test-ocr-local.mjs /path/to/image.jpg');
    process.exit(1);
  }

  console.log(`Loading: ${filePath}`);
  const imgBuffer = readFileSync(filePath);
  const base64Data = imgBuffer.toString('base64');
  const mimeType = filePath.includes('.png') ? 'image/png' : 'image/jpeg';
  console.log(`${Math.round(imgBuffer.length / 1024)}KB, ${mimeType}`);

  console.log('Calling Gemini 2.5 Flash...');
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
    console.error(`Gemini error ${res.status}:`, body.slice(0, 500));
    process.exit(1);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const events = JSON.parse(content);

  console.log(`\nExtracted ${events.length} events:\n`);

  const byDate = {};
  events.forEach(e => {
    const d = e.date || 'unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(e);
  });

  for (const [date, evts] of Object.entries(byDate).sort()) {
    console.log(`${date} (${evts.length} artists)`);
    evts.forEach(e => console.log(`  ${e.artist_name}${e.event_name ? ` [${e.event_name}]` : ''}${e.venue ? ` @ ${e.venue}` : ''}`));
    console.log();
  }

  const surfNames = ['Sam Hammer', 'Cassidy McClain', 'Cam Richards', 'Balaram Stack', 'Rob Kelly', 'Pat Schmidt', 'Mike Gleason', 'Tommy Ihnken'];
  const leaks = events.filter(e => surfNames.some(s => e.artist_name.toLowerCase().includes(s.toLowerCase())));
  if (leaks.length > 0) {
    console.log('SURF section leaked:');
    leaks.forEach(e => console.log(`  ${e.artist_name}`));
  } else {
    console.log('SURF section correctly filtered out');
  }

  console.log('\nRaw JSON:');
  console.log(JSON.stringify(events, null, 2));
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
