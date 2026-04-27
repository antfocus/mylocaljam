# Copy-Paste Prompt for New Enrichment Session

---

You are continuing work on **MyLocalJam**, a Next.js 14 live-music discovery app for the Jersey Shore. The repo is mounted in your workspace folder.

## Your Role

You are my Lead Data Engineer. Your focus is the **Metadata Enrichment Pipeline** — getting bios, images, and genre tags onto hundreds of unenriched artist records before launch.

## Context: What Was Just Built

In the previous session I built the foundation but **nothing has been tested end-to-end yet**. Read these files first to get oriented:

1. `ENRICHMENT.md` — Full architecture doc with DB schema, env vars, and what needs to happen next
2. `src/lib/llmRouter.js` — Multi-provider LLM abstraction (Gemini → Perplexity → Grok failover). Built but **NOT yet wired into aiLookup.js**
3. `src/lib/enrichmentPriority.js` — Priority scoring for unenriched artists (Thu–Sun proximity × completeness × recency)
4. `src/app/api/admin/enrich-backfill/route.js` — Batch enrichment endpoint (20-25 artists/call, client-driven loop)
5. `src/lib/aiLookup.js` — Existing AI lookup (bio limit already reduced from 500→250 chars). Currently still calls `callPerplexity()` directly instead of the LLM router
6. `src/lib/enrichArtist.js` — Universal enrichment waterfall (MusicBrainz → Discogs → Last.fm → AI fallback)
7. `src/lib/visionOCR.js` — OCR flyer scanner (429 retry + Gemini Pro fallback already added)

## Priority Tasks

1. **Wire the LLM Router into aiLookup.js** — Replace the direct `callPerplexity()` calls with the router. Pass 1 (bio/image research) should use `callLLMWebGrounded()` (Perplexity first for web access). Pass 2 (genre/vibe tagging from bio text) should use `callLLM()` (Gemini first, cheaper).

2. **Test the backfill endpoint** — Run a small 3-artist batch against the live DB and verify results. Check: bios ≤250 chars, no hype words, correct MUSICIAN/VENUE_EVENT classification, real images.

3. **Build admin UI for backfill** — Add a "Run Backfill" button to the admin panel that fires the endpoint in a loop, shows progress, and stops when `remaining === 0`.

4. **Quality audit** — After a test batch, check actual results in the DB.

5. **Update HANDOVER.md and SCRAPERS.md** with enrichment pipeline documentation.

## Key Constraints

- Vercel Hobby tier = **60s function timeout**. Batch sizes max 20-25.
- Skip Grok for now — `XAI_API_KEY` is not configured. The router works with just Gemini + Perplexity.
- Never overwrite `is_human_edited` or `is_locked` artist data.
- The MUSICIAN vs VENUE_EVENT Classification Fork is critical — don't bypass it.
- Bio limit is 250 characters (was 500, changed this session).

## Auth

Admin endpoints use `Authorization: Bearer {ADMIN_PASSWORD}`. The password is in `.env.local`.

Start by reading `ENRICHMENT.md`, then read the files listed above to verify everything is syntactically correct and architecturally sound before making any changes.
