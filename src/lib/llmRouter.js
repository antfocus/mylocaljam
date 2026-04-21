/**
 * LLM Router — multi-provider abstraction with automatic failover.
 *
 * Provider priority (configurable per call):
 *   1. Gemini Pro (Google AI — user's $20/month plan, high quota)
 *   2. Perplexity sonar-pro (web-grounded specialist — best for research queries)
 *   3. Grok (xAI — user's $20/month plan, overflow backup)
 *
 * Features:
 *   - 429 rate-limit detection → automatic fallback to next provider
 *   - Timeout handling (provider-level, not global)
 *   - JSON-only response parsing (all providers)
 *   - Usage/cost tracking per provider (in-memory, logged)
 *   - Configurable provider order per call type
 *
 * Interface matches callPerplexity() signature:
 *   callLLM(systemPrompt, userPrompt, options?) → parsed JSON | null
 *
 * Env vars:
 *   - GOOGLE_AI_KEY       (Gemini Pro)
 *   - PERPLEXITY_API_KEY  (Perplexity sonar-pro)
 *   - XAI_API_KEY         (Grok / xAI)
 */

// ─── Provider Definitions ─────────────────────────────────────────────────────

const PROVIDERS = {
  gemini: {
    name: 'gemini',
    model: 'gemini-2.5-flash',
    envKey: 'GOOGLE_AI_KEY',
    timeout: 30000,
  },
  perplexity: {
    name: 'perplexity',
    model: 'sonar-pro',
    envKey: 'PERPLEXITY_API_KEY',
    timeout: 30000,
  },
  grok: {
    name: 'grok',
    model: 'grok-3-mini',
    envKey: 'XAI_API_KEY',
    timeout: 30000,
  },
};

// Default routing order — Gemini first (highest quota), Perplexity second
// (web-grounded), Grok third (overflow).
const DEFAULT_ROUTE = ['gemini', 'perplexity', 'grok'];

// For web-grounded queries (bio research, artist lookup), Gemini goes first.
//
// Historical note: this was ['perplexity', 'gemini', 'grok'] because
// Perplexity's sonar-pro has live web access built in, which is ideal for
// artist-bio research. Flipped on 2026-04-20 because the $5/month Perplexity
// Pro API credit gets exhausted well before draining our ~1800-artist
// queue, and every Perplexity-first attempt during exhaustion wastes ~2s
// on a guaranteed-fail call before falling through to Gemini.
//
// Paid-tier Gemini 2.5 Flash (~$0.0007/call, 1000 RPM) handles most of the
// workload cheaply and fast. Perplexity stays as fallback — when its $5
// credit refills monthly, it'll catch the obscure Jersey Shore locals
// Gemini may ambiguate on. Revisit this order if Perplexity gets topped up
// to cover the full queue, or if Gemini quality drops on specific genres.
const WEB_GROUNDED_ROUTE = ['gemini', 'perplexity', 'grok'];

// ─── Usage Tracking (in-memory, resets on cold start) ─────────────────────────

const usage = {
  gemini: { calls: 0, failures: 0, rateLimits: 0 },
  perplexity: { calls: 0, failures: 0, rateLimits: 0 },
  grok: { calls: 0, failures: 0, rateLimits: 0 },
};

export function getUsageStats() {
  return { ...usage };
}

export function resetUsageStats() {
  for (const key of Object.keys(usage)) {
    usage[key] = { calls: 0, failures: 0, rateLimits: 0 };
  }
}

// ─── Provider Call Implementations ────────────────────────────────────────────

/**
 * Call Gemini Pro via Google AI Studio REST API.
 * Uses generateContent endpoint with JSON response mode.
 */
async function callGemini(systemPrompt, userPrompt, apiKey, { model, timeout }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 800,
      responseMimeType: 'application/json',
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.status === 429) return { rateLimited: true, data: null };
    if (!res.ok) return { rateLimited: false, data: null };

    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { rateLimited: false, data: null };

    return { rateLimited: false, data: parseJSON(text) };
  } catch {
    return { rateLimited: false, data: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call Perplexity sonar-pro (OpenAI-compatible chat API).
 */
async function callPerplexityProvider(systemPrompt, userPrompt, apiKey, { model, timeout }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (res.status === 429) return { rateLimited: true, data: null };
    if (!res.ok) return { rateLimited: false, data: null };

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content;
    if (!text) return { rateLimited: false, data: null };

    return { rateLimited: false, data: parseJSON(text) };
  } catch {
    return { rateLimited: false, data: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call Grok via xAI API (OpenAI-compatible chat API).
 */
async function callGrokProvider(systemPrompt, userPrompt, apiKey, { model, timeout }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (res.status === 429) return { rateLimited: true, data: null };
    if (!res.ok) return { rateLimited: false, data: null };

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content;
    if (!text) return { rateLimited: false, data: null };

    return { rateLimited: false, data: parseJSON(text) };
  } catch {
    return { rateLimited: false, data: null };
  } finally {
    clearTimeout(timer);
  }
}

// ─── JSON Parsing Helper ──────────────────────────────────────────────────────

function parseJSON(text) {
  if (!text) return null;
  // Strip markdown code fences if present
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object/array from surrounding text
    const match = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    return null;
  }
}

// ─── Provider Dispatcher ──────────────────────────────────────────────────────

const CALL_FNS = {
  gemini: callGemini,
  perplexity: callPerplexityProvider,
  grok: callGrokProvider,
};

/**
 * Try a single provider. Returns { success, data, rateLimited }.
 */
async function tryProvider(providerKey, systemPrompt, userPrompt) {
  const provider = PROVIDERS[providerKey];
  if (!provider) return { success: false, data: null, rateLimited: false };

  const apiKey = process.env[provider.envKey];
  if (!apiKey) return { success: false, data: null, rateLimited: false };

  usage[providerKey].calls++;

  const callFn = CALL_FNS[providerKey];
  const result = await callFn(systemPrompt, userPrompt, apiKey, {
    model: provider.model,
    timeout: provider.timeout,
  });

  if (result.rateLimited) {
    usage[providerKey].rateLimits++;
    console.warn(`[LLMRouter] ${providerKey} rate-limited (429), falling back…`);
    return { success: false, data: null, rateLimited: true };
  }

  if (!result.data) {
    usage[providerKey].failures++;
    console.warn(`[LLMRouter] ${providerKey} returned no data, falling back…`);
    return { success: false, data: null, rateLimited: false };
  }

  return { success: true, data: result.data, rateLimited: false };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Primary entry point — replaces callPerplexity() with multi-provider failover.
 *
 * @param {string} systemPrompt - System instructions
 * @param {string} userPrompt   - User message / query
 * @param {object} [options]
 * @param {string[]} [options.route]        - Provider priority order (default: DEFAULT_ROUTE)
 * @param {boolean}  [options.webGrounded]  - Use web-grounded route (Perplexity first)
 * @param {string}   [options.preferProvider] - Force a specific provider first
 * @returns {Promise<object|null>} Parsed JSON response or null on total failure
 */
export async function callLLM(systemPrompt, userPrompt, options = {}) {
  const { route, webGrounded = false, preferProvider } = options;

  // Determine provider order
  let providerOrder;
  if (route) {
    providerOrder = route;
  } else if (preferProvider && PROVIDERS[preferProvider]) {
    // Put preferred provider first, then fill in the rest
    providerOrder = [preferProvider, ...DEFAULT_ROUTE.filter(p => p !== preferProvider)];
  } else if (webGrounded) {
    providerOrder = WEB_GROUNDED_ROUTE;
  } else {
    providerOrder = DEFAULT_ROUTE;
  }

  for (const providerKey of providerOrder) {
    const result = await tryProvider(providerKey, systemPrompt, userPrompt);
    if (result.success) {
      return result.data;
    }
    // Continue to next provider on failure or rate limit
  }

  console.error('[LLMRouter] All providers exhausted — returning null');
  return null;
}

/**
 * Convenience: call with web-grounded routing (Perplexity → Gemini → Grok).
 * Best for artist bio research where live web access improves results.
 */
export async function callLLMWebGrounded(systemPrompt, userPrompt, options = {}) {
  return callLLM(systemPrompt, userPrompt, { ...options, webGrounded: true });
}

/**
 * Convenience: call Perplexity directly (backward compat with existing code).
 * Falls back to other providers if Perplexity fails.
 */
export async function callPerplexityWithFallback(systemPrompt, userPrompt, options = {}) {
  return callLLM(systemPrompt, userPrompt, { ...options, preferProvider: 'perplexity' });
}
