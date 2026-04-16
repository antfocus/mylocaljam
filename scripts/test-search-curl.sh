#!/usr/bin/env bash
# Quick curl tests for /api/events/search
# Usage: bash scripts/test-search-curl.sh [BASE_URL]

BASE="${1:-http://localhost:3000}"
EP="$BASE/api/events/search"

echo "═══════════════════════════════════════════════════"
echo "  Testing /api/events/search  →  $BASE"
echo "═══════════════════════════════════════════════════"

echo ""
echo "1. Default (page 1, limit 20, from today):"
curl -s "$EP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  page={d[\"page\"]} limit={d[\"limit\"]} total={d[\"total\"]} hasMore={d[\"hasMore\"]} returned={len(d[\"data\"])}')" 2>/dev/null || echo "  FAILED"

echo ""
echo "2. Page 2, limit 5:"
curl -s "$EP?page=2&limit=5" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  page={d[\"page\"]} limit={d[\"limit\"]} total={d[\"total\"]} returned={len(d[\"data\"])}')" 2>/dev/null || echo "  FAILED"

echo ""
echo "3. Search for 'stone':"
curl -s "$EP?q=stone" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  total={d[\"total\"]} returned={len(d[\"data\"])}'); [print(f'    - {e[\"event_title\"]} @ {e[\"venue\"]}') for e in d['data'][:5]]" 2>/dev/null || echo "  FAILED"

echo ""
echo "4. Search for 'jazz':"
curl -s "$EP?q=jazz" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  total={d[\"total\"]} returned={len(d[\"data\"])}'); [print(f'    - {e[\"event_title\"]} @ {e[\"venue\"]}') for e in d['data'][:5]]" 2>/dev/null || echo "  FAILED"

echo ""
echo "5. Category filter 'Live Music':"
curl -s "$EP?category=Live%20Music&limit=3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  total={d[\"total\"]} returned={len(d[\"data\"])}'); [print(f'    - {e[\"event_title\"]} [{e[\"category\"]}]') for e in d['data']]" 2>/dev/null || echo "  FAILED"

echo ""
echo "6. Gibberish search (should return 0):"
curl -s "$EP?q=xyzzy99plugh" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  total={d[\"total\"]} (expected 0)')" 2>/dev/null || echo "  FAILED"

echo ""
echo "7. Special chars — comma in search (must not 400/500):"
curl -s -o /dev/null -w "  HTTP %{http_code}" "$EP?q=food%2C%20drink"
echo ""

echo ""
echo "8. Special chars — parens in search (must not 400/500):"
curl -s -o /dev/null -w "  HTTP %{http_code}" "$EP?q=open%20%28mic%29"
echo ""

echo ""
echo "9. Page beyond range (should return empty data, not error):"
curl -s "$EP?page=9999" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  total={d[\"total\"]} returned={len(d[\"data\"])} hasMore={d[\"hasMore\"]}')" 2>/dev/null || echo "  FAILED"

echo ""
echo "10. Event shape (first result — waterfall fields):"
curl -s "$EP?limit=1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d['data']:
  e=d['data'][0]
  fields=['event_title','category','date','venue','name','description','event_image','start_time','venue_color','artist_genres','is_tribute']
  for f in fields:
    v=e.get(f,'MISSING')
    print(f'    {f}: {str(v)[:60]}')
else:
  print('  No events returned')
" 2>/dev/null || echo "  FAILED"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Done."
echo "═══════════════════════════════════════════════════"
