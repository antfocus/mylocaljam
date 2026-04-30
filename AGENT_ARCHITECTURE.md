# Agent Architecture

> **Status:** Plan as of April 30, 2026. Hybrid autonomous-agent setup combining locally-hosted open-source models with Claude (via existing Max subscription) to run myLocalJam's maintenance, quality control, and marketing workloads with minimal ongoing cost.

---

## Vision

Three specialized agents, each with a focused job, running mostly autonomously against the production Supabase database. Two of them run for free on a Mac mini using open-source models; one runs on Claude Sonnet using the existing Max subscription so there are no incremental API bills. Together they keep the site enriched, monitored, and growing without requiring Tony to be the manual operator for every routine task.

## The Stack at a Glance

| Layer | Choice | Why |
|---|---|---|
| Hardware host | Mac mini M4 (32GB / 256GB) | Already provisioned (Apr 29 session). 32GB unified memory is sweet spot for 32B-parameter models at Q4. |
| Local inference engine | Ollama | `brew install ollama`. Native Apple Silicon performance, OpenAI-compatible HTTP API on `localhost:11434`. |
| Local primary model | Qwen2.5-Coder 32B (or Qwen3-Coder when stable) | Best open coding/agent model in this size class; ~19-22GB at Q4 quantization, leaves ~10GB headroom. |
| Local fast model | Qwen2.5-Coder 14B | For lighter QC and quick classification jobs that don't need the 32B brain. |
| Cloud model | Claude Sonnet (via Claude Agent SDK + Max subscription auth) | No incremental cost beyond existing Max plan. Use only where creative judgment matters. |
| Orchestration | Claude Agent SDK | Same code shape for local and cloud agents — just swap `baseURL` and model name. Portable. |
| Shared state | Existing Supabase | All three agents read/write here. Single source of truth. |
| Storage expansion | External Thunderbolt 4 SSD (~$120 one-time) | 256GB internal will fill quickly with multiple model variants. T9 1TB or similar. |

## Hardware

Mac mini M4 — 10-core CPU, 10-core GPU, 16-core Neural Engine, 32GB unified memory, 256GB SSD, gigabit ethernet, 3× Thunderbolt 4. Provisioned April 29, 2026 with FileVault, SSH, and Tailscale; reachable as `agent-mini.local` on LAN and `agent-mini` on Tailscale from anywhere.

The 32GB unified memory is the right sweet spot for 32B-parameter models at Q4 quantization (~19-22GB), leaving ~10GB headroom for the OS, Tailscale daemon, scraper processes, and any concurrent smaller model. Expect 12-20 tokens/sec generation on Qwen2.5-Coder 32B — plenty for batch agent work.

The 256GB SSD is the constraint to plan around. macOS + applications eat ~30-40GB; a single Q4 32B model is ~20GB; Ollama itself ~2GB; a fast-tier model adds another 5-10GB. Add scraper data, logs, project workspaces, Tailscale state — the disk fills fast. The recommended remediation is a 1TB external Thunderbolt 4 SSD pointed to as Ollama's model directory; TB4 bandwidth is fast enough that there's no meaningful performance difference vs internal storage.

## The Three Agents

### Agent 1 — Maintenance

**Purpose.** Continuously enriches new artist and event rows. Fills in bios, genres, vibes, images, and curates spotlight selections. Mirrors what Tony currently does manually via the admin's AI Enhance and AI Image Search buttons.

**Model.** Qwen2.5-Coder 32B (or Qwen3-Coder when stable on Ollama).

**Runs on.** Mac mini via Ollama, triggered every N minutes by a launchd timer or whenever the Maintenance agent sees new unenriched rows in Supabase.

**Tools needed.**
- Supabase read/write (artists table, events table, event_templates table)
- Web search (for bio sourcing — Perplexity API or local DuckDuckGo wrapper)
- Image search (Google Custom Search, Postimages upload)
- Vision-capable model fallback for image quality checks (could be a smaller local VLM like LLaVA, or escalate to Claude if local quality insufficient)

**Workloads.**
- Bio drafting from artist name + genre + venue context
- Genre and vibe inference (must use canonical lists from `utils.js` GENRES + ALLOWED_GENRES)
- Image candidate sourcing and ranking
- Spotlight selection — pick this week's 5 spotlight events based on date, venue weight, image quality, artist fame heuristics

**Guardrails.**
- Respect `is_locked = true` on artist rows. Never overwrite admin-curated content.
- Log every decision to an `agent_decisions` table for audit / undo.
- Hard stop on consecutive failures: 3 errors → pause and email Tony.

### Agent 2 — Quality Control

**Purpose.** Daily data integrity sweep. Identifies broken state, anomalies, and content gaps. Generates a structured report Tony can scan in 60 seconds.

**Model.** Qwen2.5-Coder 14B (smaller, faster — pattern matching doesn't need the 32B brain).

**Runs on.** Mac mini via Ollama, scheduled nightly at 4 AM ET via launchd.

**Tools needed.**
- Supabase read (read-only — never writes to production)
- Markdown report generation
- Email or Slack delivery (Resend API or webhook to a Slack channel Tony monitors)

**Workloads.**
- Orphan detection — events with `kind='event'` artist rows; locked artists with no upcoming events
- Duplicate detection — near-match artist names that should probably be merged
- Missing-field surfaces — artists with no bio, no image, no genres after N days in the system
- Broken-link checks — venue websites returning 4xx/5xx, image URLs returning 404
- Geo-coord coverage — venues missing lat/lng that should have them
- Series integrity — events with `template_id` that point to deleted templates

**Output.** Single markdown report emailed daily. Sections: red (action needed today), yellow (review this week), green (no issues in this category). Tony skims, clicks links into admin to fix.

**Optional cross-check.** Run the same QC prompt against both Qwen 14B AND Phi-4 14B; flag rows where they disagree as "uncertain — Tony review." Costs nothing extra, catches model-specific blind spots.

### Agent 3 — Marketing

**Purpose.** Drives growth. Drafts social media posts, generates campaign ideas, replies to mentions, analyzes which artists/events would resonate with which audiences, surfaces good content opportunities (e.g., "Sea Hear Now lineup is announced — draft a celebratory post").

**Model.** Claude Sonnet via Claude Agent SDK, authenticated against the existing Claude Max subscription. **Zero incremental cost.**

**Runs on.** Mac mini (or alternatively Vercel cron — wherever auth flows easiest). Triggered weekly for routine posting, event-driven for big moments (lineup reveals, weather impacts, new venue onboardings).

**Why Claude and not local.** Marketing is voice-driven creative work — wit, brand consistency, knowing what resonates with Jersey Shore music fans. That's where Claude pulls meaningfully ahead of open models, and the gap is widest precisely on judgment-heavy creative work. The volume is low (a few hundred calls per month), so the Max subscription comfortably covers it.

**Tools needed.**
- Supabase read (events, artists, venues, spotlight)
- Approval queue (a `marketing_drafts` Supabase table where queued posts live)
- Social platform APIs (deferred — start with Bluesky for free API access; X/Instagram are paid-API gated)
- Brand voice reference doc loaded into context

**Workloads.**
- Weekly post drafting — 3-5 candidate posts per week, queued for Tony's approval
- Event-driven posts — big lineup reveals, weather adaptations, new venue launches
- Reply drafting for mentions and DMs (also queued for approval)
- Campaign ideation — when Tony asks "what should I post about this week" the agent has prepared options

**CRITICAL guardrail — human in the loop.**

> **The marketing agent does not autonomously publish. Period.** It drafts posts into a review queue Tony approves before anything goes public. Autonomous posting to public accounts is the failure mode that ends up on Hacker News. Maintain the approval gate at minimum until there are 6+ months of clean drafts on file demonstrating the agent's voice is reliably aligned with the myLocalJam brand.

## How They Communicate

All three agents read and write to the existing Supabase database. The DB is the shared brain. There's no message bus, no inter-agent RPC, no event queue — just rows.

- Maintenance writes new bios → QC reads them next sweep and validates → Marketing reads enriched artists and surfaces them as post candidates.
- QC flags an artist as "missing image" → Maintenance picks up that flag in the next loop and runs image search.
- Marketing flags a post as "ready to draft" → Tony approves → posts go out.

This pattern keeps the agents loosely coupled. Each one can fail or be paused without breaking the others. Each one can be upgraded or swapped (e.g., Qwen → DeepSeek when V4 lands) without touching the others.

## Orchestration Layer

The Claude Agent SDK is the loop runner for all three agents. It works against any OpenAI-compatible endpoint, so:

- **Maintenance agent loop:** SDK → `baseURL: http://localhost:11434/v1` → model `qwen2.5-coder:32b`
- **QC agent loop:** SDK → `baseURL: http://localhost:11434/v1` → model `qwen2.5-coder:14b`
- **Marketing agent loop:** SDK → default Claude API endpoint → model `claude-sonnet-4-6`, authenticated via Claude Max subscription

Same code shape across all three. To switch a workload from local to Claude (or back), change the `baseURL` and model name. Nothing else moves.

## Cost Model

- **Local agents (Maintenance + QC):** $0 in API costs. Electricity is negligible (~$2-3/month delta). One-time external SSD ~$120 if Tony wants storage breathing room.
- **Marketing agent:** Covered by the existing Claude Max subscription. Marketing volume (a few hundred calls/month) sits well within Max limits.
- **Social media infrastructure (separate from agent costs):** Bluesky API is free; X Basic API is $100/month (only if/when X becomes worth posting to); Instagram requires Meta Business approval but no recurring API fee. Defer until growth justifies.

**Total incremental ongoing cost:** approximately $0/month for the agent stack itself. Social platform fees are independent decisions made when the marketing agent's drafts are good enough to scale to those platforms.

## Software to Install on the Mini

```bash
# Local inference
brew install ollama
ollama pull qwen2.5-coder:32b
ollama pull qwen2.5-coder:14b

# Optional: smaller cross-check model for QC
ollama pull phi4:14b

# Agent SDK + runtime
brew install node
npm install -g @anthropic-ai/claude-agent-sdk

# Scheduling
# launchd plists for nightly QC + recurring Maintenance polls
# (or use a process manager like PM2 if simpler)

# Already installed (Apr 29 session)
# - Tailscale (for remote SSH access)
# - SSH server
# - FileVault encryption
```

## Phased Rollout

### Phase 1 — Maintenance agent on artist enrichment (week 1)

Wire up the Maintenance agent against PARKED #18 (the ~30 weekend artists still needing manual enrichment). Run overnight. Compare bio/genre/vibe quality vs what Claude was producing for the same prompts. Iterate on the prompt until quality matches.

**Success criteria.** 80%+ of generated bios pass Tony's eye test on first run. Genre selections match the canonical GENRES list 100% of the time. Image search returns relevant candidates 60%+ of the time.

### Phase 2 — QC agent nightly report (week 2)

Wire up the QC agent against the existing Supabase. Daily 4 AM run, markdown report emailed to Tony. Iterate on what shows up red/yellow/green until the report is genuinely useful (not noisy).

**Success criteria.** Tony reads the report each morning and finds at least one genuinely new issue per week he wouldn't have spotted otherwise. False-positive rate under 20%.

### Phase 3 — Marketing agent draft queue (weeks 3-4)

Build the `marketing_drafts` Supabase table and a simple admin UI to review/approve/reject queued posts. Wire up the Marketing agent to draft 3-5 posts per week into the queue. Tony approves the good ones; rejected ones become training signal for prompt refinement. Bluesky integration for actual posting once 4-6 weeks of drafts have shown reliable voice.

**Success criteria.** Tony approves 60%+ of generated drafts with light edits, rejects 30%, archives 10% as off-brand.

### Phase 4 — Cross-agent feedback loops (month 2+)

QC flags an artist as missing image → Maintenance auto-runs image search → Marketing sees the artist now has full enrichment and queues a celebration post. The agents start coordinating implicitly via shared state. New value emerges from composition rather than from any single agent.

## Safety and Guardrails

- **Maintenance respects `is_locked`.** Never overwrite admin-curated artist or event rows. Hard fail rather than soft override.
- **QC is read-only.** Never writes to production. Reports only.
- **Marketing has no autopost privilege.** Always queues for human approval. The approval gate is non-negotiable for the first 6+ months.
- **Decision logging.** Every agent action writes a row to `agent_decisions` (timestamp, agent, action, target row, model used, prompt hash, output, success bool). Enables retrospective audit, undo, and prompt iteration.
- **Kill switch.** A single environment variable (`AGENTS_PAUSED=true`) that all three agents check at the top of each loop. One Tailscale SSH command and the entire fleet stops. No drama.

## Open Questions

- **Scheduling.** launchd is native macOS but verbose; PM2 is simpler but adds dependency. Cron is fine. Pick one and stop.
- **Logging.** Plain log files on disk, or a Supabase `agent_logs` table, or both? The DB option is queryable but adds write volume.
- **Model upgrade cadence.** How often to re-evaluate Qwen vs alternatives? Quarterly check-ins seems right — enough to catch meaningful improvements, not enough to chase every new release.
- **When does this stack outgrow the mini?** If Maintenance latency starts blocking other work, or if Tony wants to run a 70B model, the next step is a dedicated GPU box (Mac Studio, or a Linux server with NVIDIA hardware). Not a near-term concern.
- **Vision model strategy.** Image quality scoring may want a vision-language model. LLaVA on Ollama is decent but Claude's vision is materially better. Likely lives in a hybrid spot — local first pass, Claude for hard cases — same pattern as marketing.

## First Step (Today)

Install Ollama on the mini. Pull Qwen2.5-Coder 32B. Write a simple Node script that loops through the unenriched weekend artists from PARKED #18 and calls the existing AI Enhance prompt against the local model. Run overnight. Compare results to what Claude produced for the same task. Iterate on the prompt if quality is off; ship if it matches.

That single experiment proves whether local inference can carry the Maintenance load. Everything in Phase 2 onward depends on that answer being yes.

---

## See Also

- `HANDOVER.md` — Apr 29 session block documents the Mac mini provisioning that made this architecture possible.
- `PARKED.md` #18 — the Tier 1 weekend artist enrichment workload that's the natural Phase 1 testbed.
- `ENRICHMENT.md` — the manual enrichment SOP this agent automates.
- `DOCS_INDEX.md` — full doc map.
