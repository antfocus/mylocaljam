/**
 * POST /api/admin/llm-diag  (admin only)
 *
 * Raw LLM provider diagnostic. Bypasses src/lib/llmRouter entirely and
 * hits each provider's REST API directly, reporting the full HTTP status,
 * selected headers, and response-body snippet.
 *
 * Why this exists: the router collapses all non-429 failures into a single
 * "failures" bucket and discards error info. Probe v3 told us Perplexity
 * is failing consistently and Gemini gets rate-limited after one call, but
 * not WHY. This endpoint returns the raw status line + body so we can tell
 * if it's a bad key (401), a plan/model mismatch (403), an upstream 5xx,
 * a timeout, or non-JSON content the router silently dropped.
 *
 * Body: { name?: string }  (defaults to a canary test name if omitted)
 *
 * Returns:
 *   {
 *     name,
 *     perplexity: { configured, status, headers, bodySnippet, elapsedMs, error? },
 *     gemini:     { configured, status, headers, bodySnippet, elapsedMs, error? },
 *     openai:     { configured, ... } | { configured: false }
 *   }
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const TIMEOUT_MS = 20000;
const BODY_SNIPPET_MAX = 2000; // Cap body-echo at ~2KB to keep the response readable.

// Small canary prompt — keeps token use minimal.
const SYSTEM_PROMPT = 'You are a music listings bot. Return strict JSON only: {"ok": true}. No prose, no markdown.';
const USER_PROMPT_TEMPLATE = (name) => `Ping test for "${name}". Return the JSON object.`;

function checkAuth(request) {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${process.env.ADMIN_PASSWORD}`;
}

// Extract headers that matter for debugging rate limits / auth / quota.
// Google, Perplexity, and xAI each surface useful hints in these headers.
function pickHeaders(res) {
  const interesting = [
    'content-type',
    'retry-after',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'x-ratelimit-limit-requests',
    'x-ratelimit-remaining-requests',
    'x-ratelimit-reset-requests',
    'x-goog-api-client',
  ];
  const out = {};
  for (const h of interesting) {
    const v = res.headers.get(h);
    if (v !== null) out[h] = v;
  }
  return out;
}

async function rawFetch(url, init, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text(); // read body regardless of content-type
    const elapsedMs = Date.now() - t0;
    return {
      status: res.status,
      headers: pickHeaders(res),
      bodySnippet: text.length > BODY_SNIPPET_MAX
        ? text.slice(0, BODY_SNIPPET_MAX) + '…[truncated]'
        : text,
      bodyLength: text.length,
      elapsedMs,
    };
  } catch (err) {
    return {
      status: null,
      headers: {},
      bodySnippet: null,
      elapsedMs: Date.now() - t0,
      error: err?.name === 'AbortError'
        ? `Timeout after ${TIMEOUT_MS}ms`
        : err?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probePerplexity(userPrompt) {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return { configured: false };
  return {
    configured: true,
    ...(await rawFetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 50,
        temperature: 0.1,
      }),
    }, 'perplexity')),
  };
}

async function probeGemini(userPrompt) {
  const key = process.env.GOOGLE_AI_KEY;
  if (!key) return { configured: false };
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  return {
    configured: true,
    model,
    ...(await rawFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 50,
          responseMimeType: 'application/json',
        },
      }),
    }, 'gemini')),
  };
}

async function probeOpenAI(userPrompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { configured: false };
  return {
    configured: true,
    ...(await rawFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Keep this in sync with PROVIDERS.openai.model in llmRouter.js if
        // the production model is swapped (e.g., to gpt-5.4-mini or gpt-5.5).
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 50,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    }, 'openai')),
  };
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }

  const name = (body?.name || 'canary').toString().trim();
  const userPrompt = USER_PROMPT_TEMPLATE(name);

  // Fire all three in parallel — they're independent APIs, we want the
  // full picture in one request and each one is rate-limited on its own
  // quota. Parallelism means total latency = slowest provider, not sum.
  const [perplexity, gemini, openai] = await Promise.all([
    probePerplexity(userPrompt),
    probeGemini(userPrompt),
    probeOpenAI(userPrompt),
  ]);

  return NextResponse.json({
    ok: true,
    name,
    perplexity,
    gemini,
    openai,
  });
}
