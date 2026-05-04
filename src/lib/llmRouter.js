/**
 * LLM Router — multi-provider abstraction with automatic failover.
 *
 * Provider priority (configurable per call):
 *   1. Gemini 2.5 Flash (Google AI — user's $20/month plan, high quota)
 *   2. OpenAI gpt-4o-mini (added 2026-05-04 — cheap pay-per-token, replaces Grok)
 *   3. Perplexity sonar-pro (web-grounded specialist — overflow / niche cases)
 *
 * Grok / xAI removed 2026-05-04 — user wasn't using it. Env var XAI_API_KEY
 * can stay in Vercel (harmless) but the provider is gone from the router.
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
 *   - GOOGLE_AI_KEY       (Gemini 2.5 Flash)
 *   - OPENAI_API_KEY      (OpenAI gpt-4o-mini)
 *   - PERPLEXITY_API_KEY  (Perplexity sonar-pro)
 */

// ─── Provider Definitions ─────────────────────────────────────────────────────
//
// To swap the OpenAI model (e.g. to gpt-5.4-mini, gpt-5-mini, or the flagship
// gpt-5.5 for higher quality), change the `model` string below — that's the
// only edit needed; everything else (URL, schema, env key) is identical.
const PROVIDERS = {
  gemini: {
    name: 'gemini',
    model: 'gemini-2.5-flash',
    envKey: 'GOOGLE_AI_KEY',
    timeout: 30000,
  },
  openai: {
    name: 'openai',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
    timeout: 30000,
  },
  perplexity: {
    name: 'perplexity',
    model: 'sonar-pro',
    envKey: 'PERPLEXITY_API_KEY',
    timeout: 30000,
  },
};

// Default routing order — Gemini first (highest quota, cheapest), OpenAI second
// (reliable pay-per-token fallback when Gemini errors), Perplexity third (catches
// the niche Jersey Shore locals that Gemini + OpenAI may ambiguate on).
const DEFAULT_ROUTE = ['gemini', 'openai', 'perplexity'];

// Web-grounded route uses the same order. Historically Perplexity was #2 for
// its live-web access (good for bio research), but the $5/month Perplexity
// credit exhausts fast and leaving it as #3 means we burn it on the queries
// that actually NEED web access (when Gemini + OpenAI both whiff). OpenAI
// doesn't have live browsing in Chat Completions, but its training-data
// knowledge is fresh enough to catch most national acts that pass through
// Asbury Park / Sea Bright / Beach Haven. Revisit this order if Perplexity
// quality on hyperlocal acts drops, or if OpenAI gets a browsing API.
const WEB_GROUNDED_ROUTE = ['gemini', 'openai', 'perplexity'];

// ─── Usage Tracking (in-memory, resets on cold start) ─────────────────────────

const usage = {
  gemini: { calls: 0, failures: 0, rateLimits: 0 },
  openai: { calls: 0, failures: 0, rateLimits: 0 },
  perplexity: { calls: 0, failures: 0, rateLimits: 0 },
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
      // Gemini 2.5 Flash is a reasoning model — by default it spends
      // 600–800 invisible "thoughts" tokens before emitting any output,
      // and those tokens count against maxOutputTokens. Our bio prompt
      // is ~1.7k prompt tokens and needs ~100 tokens of bio output;
      // with default thinking on, ~765 thoughts tokens drain the 800
      // budget, candidates only get ~35 tokens, JSON truncates mid-bio,
      // the router's parseJSON returns null, falls through to Perplexity
      // (exhausted credits), and the artist errors out "no usable
      // bio/image". Confirmed 2026-04-20 via enrich-probe on "Blue
      // Abyss" — finishReason=MAX_TOKENS, thoughtsTokens=764,
      // candidatesTokens=21, text truncated mid-word.
      //
      // Setting thinkingBudget=0 disables thinking entirely. Fine for
      // this task — it's classification + retrieval from web knowledge,
      // not math or multi-step reasoning. Side benefits: lower latency
      // (~300ms saved) and lower cost (thoughts tokens bill at output
      // rate, so removing them cuts ~95% of per-call output tokens).
      thinkingConfig: { thinkingBudget: 0 },
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
 * Call OpenAI Chat Completions API.
 *
 * response_format: { type: 'json_object' } forces the model to emit valid
 * JSON — eliminates the parse-failure path that bites Gemini when the
 * thinking budget cuts off mid-token. Requires the system prompt to mention
 * "JSON" somewhere; aiLookup.js already does this.
 */
async function callOpenAIProvider(systemPrompt, userPrompt, apiKey, { model, timeout }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
        response_format: { type: 'json_object' },
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
  openai: callOpenAIProvider,
  perplexity: callPerplexityProvider,
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
 * Convenience: call with web-grounded routing (Gemini → OpenAI → Perplexity).
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
