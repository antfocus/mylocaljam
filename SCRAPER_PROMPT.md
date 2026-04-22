# New Scraper Session — Kickoff Prompt

Copy-paste this into a fresh Cowork session to get started:

---

I'm building mylocaljam.com — a Next.js site that aggregates live music events from NJ shore venues. I need to add new venue scrapers to my pipeline.

Before doing anything, read these two files:
1. `SCRAPERS.md` — the full technical reference for how scrapers work, the payload format, platform playbook, wiring steps, and common pitfalls
2. `Agent_SOP.md` — behavioral guardrails and safety locks (especially Workflow 4: Autonomous Venue Investigation & Scraping)

Then I'll give you the venue URLs I want to add. For each venue:

1. **Investigate the site** — fetch the URL, view the page source, and identify the platform (Squarespace, WordPress, Google Calendar, Eventbrite, custom HTML, image flyers, etc.). Check for hidden APIs, JSON-LD, iCal feeds, or structured data before defaulting to HTML parsing.
2. **Build the scraper** following the standard template in SCRAPERS.md — same payload fields, same error handling pattern, same external_id conventions.
3. **Wire it into `src/app/api/sync-events/route.js`** — import, Promise.all entry, scraperResults, VENUE_REGISTRY, allEvents spread.
4. **Give me the SQL** to add the venue to my Supabase `venues` table.
5. **Test it** by running the scraper function in isolation and showing me the output.

Important constraints:
- Use `easternOffset()` for all timezone handling (never hardcode EST/EDT)
- External IDs must be globally unique and stable across syncs
- Check existing scrapers for the same platform type before writing from scratch
- If the site blocks datacenter IPs, use `proxyFetch()` from `@/lib/proxyFetch`
- If the venue only posts image flyers, use the Vision OCR pipeline (`@/lib/visionOCR`)

Here are the venues I want to add: [LIST YOUR VENUES HERE]
