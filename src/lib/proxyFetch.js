/**
 * Proxy-aware fetch utility for scrapers that need residential IPs.
 *
 * Uses IPRoyal rotating residential proxies to bypass datacenter IP blocks.
 * Only used by scrapers that are known to block Vercel's datacenter IPs.
 * All other scrapers continue using standard fetch() with no proxy.
 *
 * Required env vars:
 *   IPROYAL_PROXY_HOST  — e.g. "geo.iproyal.com"
 *   IPROYAL_PROXY_PORT  — e.g. "12321"
 *   IPROYAL_PROXY_USER  — your IPRoyal username
 *   IPROYAL_PROXY_PASS  — your IPRoyal password
 *
 * Usage:
 *   import { proxyFetch } from '@/lib/proxyFetch';
 *   const res = await proxyFetch('https://example.com', { headers: {...} });
 *   const html = await res.text();
 */

import { ProxyAgent, fetch as undiciFetch } from 'undici';

// Browser-like headers shared by all proxy scrapers
export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

/**
 * Build the IPRoyal proxy URL from env vars.
 * Returns null if proxy is not configured (allows graceful fallback).
 */
function getProxyUrl() {
  const host = process.env.IPROYAL_PROXY_HOST;
  const port = process.env.IPROYAL_PROXY_PORT;
  const user = process.env.IPROYAL_PROXY_USER;
  const pass = process.env.IPROYAL_PROXY_PASS;

  if (!host || !port || !user || !pass) {
    return null;
  }

  return `http://${user}:${pass}@${host}:${port}`;
}

/**
 * Fetch a URL through the IPRoyal residential proxy.
 * Falls back to standard fetch() if proxy env vars are not configured.
 *
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options (headers, method, body, etc.)
 * @returns {Promise<Response>} - The fetch response
 */
export async function proxyFetch(url, options = {}) {
  const proxyUrl = getProxyUrl();

  if (!proxyUrl) {
    console.warn('[proxyFetch] Proxy not configured — falling back to direct fetch. Set IPROYAL_PROXY_* env vars.');
    return fetch(url, { ...options, next: { revalidate: 0 } });
  }

  const dispatcher = new ProxyAgent(proxyUrl);

  // Merge in browser headers as defaults (caller can override)
  const headers = { ...BROWSER_HEADERS, ...options.headers };

  const res = await undiciFetch(url, {
    ...options,
    headers,
    dispatcher,
  });

  return res;
}

/**
 * Check if the proxy is configured.
 * Scrapers can use this to log warnings or skip gracefully.
 */
export function isProxyConfigured() {
  return getProxyUrl() !== null;
}
