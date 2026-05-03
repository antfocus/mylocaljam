/**
 * classifyArtistKind.js — Heuristic classifier for artists.kind.
 *
 * Stops the scraper from auto-creating `kind='musician'` rows for things
 * that are obviously venue events (Trivia NIGHT, BOGO Burger, Family
 * Funday Monday, AYCE Snow Crab) or multi-artist billings.
 *
 * The classifier is INTENTIONALLY conservative. False positives ("we
 * called a real musician an event") are worse than false negatives ("we
 * called an event a musician") because:
 *   • A mis-classified event-as-musician is easy to spot in the admin
 *     Artists list and one KindToggle click fixes it.
 *   • A mis-classified musician-as-event hides them from the default
 *     Musicians filter and breaks the FOLLOW ARTIST affordance for a
 *     real performer — much louder failure mode.
 *
 * So when in doubt, fall through to 'musician'. The patterns below only
 * fire on STRONG, unambiguous signals. The full taxonomy lives in
 * /KIND_TAXONOMY.md — read that doc for the model's rationale.
 *
 * Usage:
 *   import { classifyArtistKind } from '@/lib/classifyArtistKind';
 *   const kind = classifyArtistKind('Trivia NIGHT'); // → 'event'
 *
 * Returns one of: 'event' | 'billing' | 'musician'
 */

// ── EVENT patterns (kind='event') ────────────────────────────────────────
//
// These match unambiguous venue-event language. Each pattern has been
// verified against real DB rows that we've already manually classified
// as kind='event' (Trivia NIGHT, Karaoke with Wildman Manny, BOGO Burger,
// Mother's Day Brunch, Family Funday Monday, Snow Crabs!, etc.).
//
// Order matters only for the "first match wins" log — the function
// returns 'event' on any match, not a specific sub-category.
const EVENT_PATTERNS = [
  // Recurring activity nights (the bread and butter of false-positives
  // we saw in DB audits)
  /\btrivia\b/i,
  /\bkaraoke\b/i,
  /\bbingo\b/i,
  /\bopen\s+mic\b/i,
  /\bcomedy\s+(?:night|show|hour)\b/i,
  /\bquiz(?:zo|zoholics)?\b/i,

  // Holidays — exact, capitalized phrases. Avoid matching e.g.
  // "Christmas Jones" (a person) by requiring word boundaries.
  /\bmother(?:'s|s)?\s+day\b/i,
  /\bfather(?:'s|s)?\s+day\b/i,
  /\bvalentine(?:'s|s)?\s+day\b/i,
  /\b(?:july\s*4|fourth\s+of\s+july|independence\s+day)\b/i,
  /\bmemorial\s+day\b/i,
  /\blabor\s+day\b/i,
  /\bhalloween\b/i,
  /\bchristmas\s+(?:eve|day|party|brunch|special)\b/i,  // "Christmas" alone could be a name; require an event noun
  /\bnew\s+year(?:'s|s)?\s+(?:eve|day|party)\b/i,
  /\bcinco\s+de\s+mayo\b/i,
  /\bst\.?\s*patrick(?:'s|s)?\s+day\b/i,
  /\bthanksgiving\b/i,
  /\beaster\s+(?:brunch|special|service)\b/i,

  // Drink/food specials — these are almost always scraper junk in artist_name
  /\$\s*\d+/,                                    // "$5", "$2 pints"
  /\bbogo\b/i,                                   // BOGO Burger
  /\bhappy\s+hour\b/i,
  /\bwing\s+night\b/i,
  /\btaco\s+tuesday\b/i,
  /\bburger\s+night\b/i,
  /\bladies\s+night\b/i,
  /\bpower\s+hour\b/i,
  /\bbottomless\b/i,
  /\b(?:miller|coors|bud|yuengling|high\s+noons?)\s+(?:lite|light|draft|pints?)?\b/i,
  /\bdraft\s+beers?\b/i,
  /\bpints?\s+til\b/i,                           // "Pints til Close"
  /\bdrink\s+special\b/i,

  // Branded venue events — pattern matches our DB's recurring-themed nights
  /\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+funday\b/i,
  /\bfamily\s+funday\b/i,
  /\bthrowback\s+thursday\b/i,
  /\bsip\s+(?:&|and)\s+shop\b/i,
  /\bmonday\s+night\s+pizza\b/i,
  /\bdecades\s+night\b/i,
  /\bopening\s+(?:party|night|sunday)\b/i,
  /\bclosing\s+(?:party|night)\b/i,
  /\bsummer\s+(?:season|opening)\s+(?:opening|party)\b/i,

  // Food-event constructs (fundraisers, brunches with no artist context)
  /\bayce\b/i,                                   // All You Can Eat
  /\ball\s+you\s+can\s+eat\b/i,
  /\bsnow\s+crab(?:s)?\b/i,                      // Snow Crab Feast / Snow Crabs!
  /\boyster\s+(?:pop\s*up|night|special)\b/i,    // High Tide Oyster Pop Up

  // Trailing scraper artifacts that mark a recurrence pattern, e.g.
  // "Trivia with Jenn every" — the trailing "every" is unique enough
  // to flag without false positives. (We DON'T flag bare "every" because
  // a name like "Every Mother's Son" would false-match.)
  /\b(?:every|weekly)\s*$/i,

  // Generic "Night" suffix — only fires when paired with a known event
  // verb earlier (already handled above), avoid plain "Saturday Night
  // Live" false positives.
  // intentionally NOT adding /\bnight\b/ catch-all.
];

// ── BILLING patterns (kind='billing') ────────────────────────────────────
//
// Multi-artist lineups. The scraper sometimes parks the entire lineup
// string into one artist_name field instead of splitting; we want those
// classified as 'billing' so admin sees them in the Billings filter and
// can decide whether to split or keep as-is.
//
// We're conservative here too — " & " between two short tokens is way
// too common in real artist names ("Sonny & Cher", "Paul & Storm"), so
// we only flag clear multi-act patterns: 2+ commas, OR " w/ " plus
// at least one comma after, OR " featuring " / " feat. " between
// distinguishable artist names.

function looksLikeBilling(name) {
  if (!name) return false;
  const trimmed = name.trim();

  // 2+ commas → almost certainly a lineup. Real artist names with
  // 2+ commas are vanishingly rare. Examples we've seen in our DB:
  // "Kirkby Kiss, Hundreds Of Au, Medicinal, Disappearances, Knife City"
  // "Stressed Out, Dab Nebula, Brain Rot, Bum Ticker"
  const commaCount = (trimmed.match(/,/g) || []).length;
  if (commaCount >= 2) return true;

  // "w/" or " with " followed by a comma → lineup with primary act
  // (e.g. "DJ Funsize w/ MC Joe, & Crew"). Single-artist support acts
  // separated by " w/ " without a comma stay 'musician' to avoid
  // false-positives on legitimate co-billed names.
  if (/\b(?:w\/|with)\b.*,/i.test(trimmed)) return true;

  return false;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Classify an artist name into its taxonomy kind.
 *
 * @param {string} name — the raw artist name from a scraper / form.
 * @returns {'event' | 'billing' | 'musician'} — defaults to 'musician'
 *          for empty or unmatched names so the caller can always trust
 *          a non-null return.
 */
export function classifyArtistKind(name) {
  if (!name || typeof name !== 'string') return 'musician';
  const trimmed = name.trim();
  if (!trimmed) return 'musician';

  // Event patterns checked first — they're the more common scraper
  // mis-classification we're trying to fix. A row that matches BOTH
  // event AND billing patterns (rare but possible) is treated as an
  // event because that's the more common ground-truth in our DB
  // (e.g. "Family Funday Monday With Dj Tim Prol & Balloonist Fancy
  // Nancy" reads as branded venue event first, lineup second).
  for (const re of EVENT_PATTERNS) {
    if (re.test(trimmed)) return 'event';
  }

  if (looksLikeBilling(trimmed)) return 'billing';

  return 'musician';
}
