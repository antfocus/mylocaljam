// src/lib/safeHref.js
//
// Sanitize URLs before they bind to an `<a href>` attribute.
//
// Background (security audit May 2, 2026 — finding H4):
//
//   `events.ticket_link` and `events.source` originate from scrapers and end
//   up bound to `<a href>` in several components. There was no scheme check
//   on the scraper write path, so a malicious venue page publishing
//   `<a href="javascript:fetch(...)">` could be scraped and rendered, giving
//   us a stored XSS via `javascript:` URLs. `target="_blank"` does NOT block
//   `javascript:` execution.
//
//   The existing `validateUrl()` in `src/app/api/admin/route.js` only ran
//   in admin write paths and only on image fields. This helper is the
//   render-side + scraper-side defense in one place.
//
// Behavior:
//
//   safeHref(input) returns the original string if and only if:
//     - input is a non-empty string
//     - URL constructor parses it (or it parses with `https://` prepended,
//       e.g. user-typed "example.com")
//     - the resulting protocol is http:, https:, or mailto:
//
//   Otherwise returns null.
//
//   Use `safeHref(url) ?? '#'` or guard at render time with
//   `const href = safeHref(url); if (!href) return null;` to drop the link
//   entirely when it can't be safely linked.
//
// Examples:
//
//   safeHref('https://stonepony.com/show/1')    // 'https://stonepony.com/show/1'
//   safeHref('http://example.com')              // 'http://example.com'
//   safeHref('mailto:bookings@venue.com')       // 'mailto:bookings@venue.com'
//   safeHref('example.com/foo')                 // 'https://example.com/foo' (auto-https)
//   safeHref('javascript:alert(1)')             // null
//   safeHref('data:text/html,<script>...')      // null
//   safeHref('vbscript:msgbox')                 // null
//   safeHref('  ')                              // null
//   safeHref(null)                              // null
//   safeHref(undefined)                         // null
//   safeHref(123)                               // null
//   safeHref('not a url')                       // null

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function safeHref(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // First try as-is (handles full URLs and mailto:).
  let parsed = tryParse(trimmed);

  // If that fails AND the string doesn't already carry a scheme, try with
  // https:// prepended. Mirrors how scrapers / admin paste sometimes drop
  // the scheme on bare hosts ("stonepony.com/show").
  if (!parsed && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    parsed = tryParse(`https://${trimmed}`);
    if (parsed) return `https://${trimmed}`;
  }

  if (!parsed) return null;
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;

  // Round-trip via parsed.href would re-encode and change the user-visible
  // string ("https://x.com" → "https://x.com/"). Return the original input
  // (trimmed) so existing strings stay byte-stable.
  return trimmed;
}

function tryParse(s) {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

export default safeHref;
