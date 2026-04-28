# myLocalJam — Docs Index

> Navigation map for the markdown docs at the repo root. Five tiers, each with a clear purpose. Start here when you don't know which doc to read.

---

## Tier 1 — Public

For anyone landing in the repo for the first time.

- **[README.md](./README.md)** — What myLocalJam is, dev setup, basic project intro.
- **[DOCS_INDEX.md](./DOCS_INDEX.md)** — This file. Where everything is.

## Tier 2 — System reference

The system-of-truth for how the data and architecture work. Update when the model changes; otherwise rarely.

- **[DATA_LIFECYCLE.md](./DATA_LIFECYCLE.md)** — Entity model, every CRUD operation, system-wide invariants, the canonical user-submission/approval flow, current drift findings, prioritized remediation. The doc to read before adding a new entity, table, or write path.

## Tier 3 — Agent skills

One doc per focused skill. Each is self-contained for its narrow domain. An agent (or human) being asked to do work in one of these areas should read the relevant doc first.

- **[ENRICHMENT.md](./ENRICHMENT.md)** — Bio, classification (`kind` taxonomy), genre/vibe tagging, lock semantics, the LLM prompts. Owns artist + event metadata enrichment end-to-end.
- **[IMAGE-MANAGEMENT.md](./IMAGE-MANAGEMENT.md)** — Image sourcing, validation, PostImages re-host, the image waterfall. Called by ENRICHMENT.md and VENUE_MANAGEMENT.md when they hit an image step.
- **[FRONTEND_SOP.md](./FRONTEND_SOP.md)** — Frontend rendering standards (inline styles, darkMode ternaries, CSS variables, accessibility).
- **[SCRAPERS.md](./SCRAPERS.md)** — Pipeline architecture, sharded crons, all 50+ existing scrapers. Reference for maintaining and debugging scraper code.
- **[SERIES_AUTOMATCH.md](./SERIES_AUTOMATCH.md)** — Event-series matching: slug normalization, find-or-create dedup, the parent/child model.
- **[VENUE_MANAGEMENT.md](./VENUE_MANAGEMENT.md)** — Venue data integrity (required fields, geocoding, CMS identification, scraper linkage), name aliases, town aliases, common ops (add/merge/deactivate).
- **[SPOTLIGHT_OPERATIONS.md](./SPOTLIGHT_OPERATIONS.md)** — Spotlight admin tab + public hero. Slot model (5 Main + 3 Runner-Ups), autopilot tiers, source tracking (manual vs suggested), staging discipline (☆ stages to Runner-Ups, drag-to-slot fills Main), image warnings, common ops.

## Tier 4 — Agent kickoff prompts

Reusable prompts to paste into a fresh agent session for a specific skill domain. Different shape from the skill docs above — these are *the prompt itself*, not reference material.

- **[ENRICHMENT_SESSION_PROMPT.md](./ENRICHMENT_SESSION_PROMPT.md)** — Kickoff for an enrichment work session.
- **[SCRAPER_PROMPT.md](./SCRAPER_PROMPT.md)** — Kickoff for adding a new venue scraper.

## Tier 5 — Working / temporal

Active project docs that change frequently or retire when their work ships.

- **[HANDOVER.md](./HANDOVER.md)** — Running session-by-session diary. The durable record of what changed and why. Worth an archive policy once it crosses ~10K lines (split into `HANDOVER_2026Q1.md` etc.).
- **[PARKED.md](./PARKED.md)** — Backlog of deferred work, cross-referenced with the task tracker.
- **[ANALYTICS_PLAN.md](./ANALYTICS_PLAN.md)** — Active feature plan for PostHog product analytics. Status of each REQ, open items.
- **[TRUST_REFACTOR.md](./TRUST_REFACTOR.md)** — Active refactor of the lock model (`is_locked` / `is_human_edited`). Phase 1 shipped; Phases 2–4 pending. Retires when Phase 4 lands.

## Deprecated / housekeeping

Files in the process of being retired or absorbed.

- **Agent_SOP.md** — Deprecated April 27, 2026. The file's own header maps each section to its destination doc. Retired once migration is complete.
- **SPOTLIGHT-HANDOFF.md, KICKOFF_*.md, *-HANDOFF.md** — One-time handoff files for in-flight work. Pattern: live at root while the work is in flight, fold key findings into HANDOVER when the work ships, then delete. Don't accumulate.

---

## How to update this index

When you add a new doc at root, add a row in the right tier and a one-line purpose. When you retire a doc, move its row to "Deprecated / housekeeping" with a note on why. Keep entries to one line — anything longer belongs in the destination doc.
