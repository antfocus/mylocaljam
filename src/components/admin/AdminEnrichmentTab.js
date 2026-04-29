'use client';

/**
 * AdminEnrichmentTab — admin-only control panel for the metadata enrichment
 * backfill pipeline.
 *
 * Fires POST /api/admin/enrich-backfill in a client-driven loop so we don't
 * trip Vercel's 60s function-timeout ceiling. Each batch processes up to
 * ~20-25 artists; the loop re-fires until the endpoint reports
 * remaining === 0.
 *
 * Features:
 *   • Batch size selector — kept small (default 2) for safe first runs.
 *     Bump to 20-25 once a run has been audited end-to-end.
 *   • "Bare only" toggle — restricts to artists missing BOTH bio AND image.
 *   • Pause / Resume — cooperative stop (finishes current in-flight batch).
 *   • Progress: batches run, artists enriched, remaining in queue.
 *   • LLM usage stats — Gemini / Perplexity / Grok call counts & failures,
 *     so the operator can spot provider-level issues mid-run.
 *   • Enrichment log — rolling list of what got written this session.
 *   • Error list — per-artist failures.
 *   • Snapshot download — every batch's pre-write snapshot is collected into
 *     a single JSON file that the admin can download BEFORE firing the next
 *     batch. Critical for rollback if anything goes wrong.
 *
 * The component is intentionally self-contained — it doesn't need any
 * shared admin hooks, just the admin password for Authorization.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const ENDPOINT = '/api/admin/enrich-backfill';

// ── Date helpers for the Triage sub-tab presets ─────────────────────────────
// Builds YYYY-MM-DD strings in America/New_York so the date-range filter
// matches the user's intuition (a "Friday" event lands on the Friday they
// expect, not whichever UTC day midnight happens to fall on).
function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function addDaysET(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
// "This weekend" = upcoming Thursday through Sunday (4 days). If today is
// already past Thursday, it's the rest of THIS weekend; if before, it's
// the next coming weekend. The triage view defaults to this range.
function thisWeekendRange() {
  const t = todayET();
  const dt = new Date(`${t}T12:00:00Z`);
  const dow = dt.getUTCDay(); // 0=Sun, 4=Thu, 5=Fri, 6=Sat
  // Days until Thursday (or 0 if already Thu/Fri/Sat/Sun).
  const daysToThu = dow >= 4 || dow === 0 ? 0 : 4 - dow;
  const from = addDaysET(t, daysToThu);
  // Sunday = Thursday + 3 days
  const to = addDaysET(from, 3);
  return { from, to };
}

export default function AdminEnrichmentTab({
  password,
  showQueueToast,
  // Triage row click handlers — passed from admin/page.js so the operator
  // can jump straight to the right edit modal without leaving the tab.
  // When a row has a linked artist, onOpenArtist fires (fix-at-source);
  // otherwise onOpenEvent fires (per-row event-level fix).
  onOpenEvent,
  onOpenArtist,
}) {
  const [activeSubTab, setActiveSubTab] = useState('backfill');

  // ── Triage sub-tab state ─────────────────────────────────────────────────
  // Default range = this weekend (Thu-Sun). Most enrichment work happens
  // on the next 4 days because that's what users browse first.
  //
  // Filter state is persisted to sessionStorage so the operator's choices
  // survive a tab switch + return. When the operator clicks an ARTIST row,
  // the admin page navigates them to the Artists tab — which unmounts this
  // component. Without persistence, coming back to Enrichment → Triage
  // would reset the date range and missing-field pill, forcing a re-input.
  // sessionStorage scope (vs localStorage) means it auto-clears on browser
  // close — useful so a stale 6-month-old date range doesn't surface on a
  // fresh login.
  const [triageRange, setTriageRange] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('mlj_triage_range');
      if (saved) try { return JSON.parse(saved); } catch {}
    }
    return thisWeekendRange();
  });
  const [triageMissing, setTriageMissing] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('mlj_triage_missing');
      // Accept any valid filter value — keep this whitelist in lockstep
      // with the API's VALID_MISSING set in /api/admin/enrichment-queue/route.js.
      const valid = ['image', 'bio', 'genres', 'vibes', 'incomplete', 'artist_unlocked'];
      if (saved && valid.includes(saved)) return saved;
    }
    return 'image';
  });
  const [triageQueue, setTriageQueue] = useState([]);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState(null);
  // Preset chip currently selected — purely display state so the active
  // chip can render highlighted. 'custom' means the operator typed dates
  // manually.
  const [triagePreset, setTriagePreset] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('mlj_triage_preset');
      if (saved && ['today', 'weekend', 'week', 'custom'].includes(saved)) return saved;
    }
    return 'weekend';
  });

  // Persist the three filter values whenever they change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem('mlj_triage_range', JSON.stringify(triageRange));
      sessionStorage.setItem('mlj_triage_missing', triageMissing);
      sessionStorage.setItem('mlj_triage_preset', triagePreset);
    } catch {}
  }, [triageRange, triageMissing, triagePreset]);

  const [batchSize, setBatchSize] = useState(2);
  const [bareOnly, setBareOnly] = useState(false);

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  // Transient state: Pause clicked but current batch still in flight.
  // Lets us show "Pausing…" instead of a stale "Running" indicator.
  const [pausing, setPausing] = useState(false);

  // Aggregate counters across the whole session.
  const [batchesRun, setBatchesRun] = useState(0);
  const [totalEnriched, setTotalEnriched] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const [usageStats, setUsageStats] = useState(null);

  // Rolling logs — capped to last 100 entries each so long-running sessions
  // don't leak memory.
  const [enrichmentLog, setEnrichmentLog] = useState([]);
  const [errorLog, setErrorLog] = useState([]);

  // Every batch returns a snapshot; we append them so a single download
  // at the end captures the whole session's pre-state.
  const [snapshots, setSnapshots] = useState([]);

  // Cooperative stop: the loop checks this ref between batches.
  const stopRef = useRef(false);

  const appendLog = (entries) => {
    setEnrichmentLog((prev) => [...entries, ...prev].slice(0, 100));
  };
  const appendErrors = (errs) => {
    if (!errs?.length) return;
    setErrorLog((prev) => [...errs, ...prev].slice(0, 100));
  };

  const runBackfill = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setPaused(false);
    setPausing(false);
    stopRef.current = false;

    let keepGoing = true;
    let iterations = 0;
    const MAX_ITERATIONS = 200; // safety cap — at batchSize 25 this is 5000 artists

    while (keepGoing && iterations < MAX_ITERATIONS) {
      if (stopRef.current) {
        setPaused(true);
        break;
      }
      iterations += 1;

      let data;
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${password}`,
          },
          body: JSON.stringify({ batchSize, bareOnly }),
        });

        if (res.status === 401) {
          showQueueToast?.({ msg: 'Unauthorized — check admin password', type: 'error' });
          break;
        }
        if (!res.ok) {
          const bodyText = await res.text().catch(() => '');
          showQueueToast?.({ msg: `Batch failed (HTTP ${res.status})`, type: 'error' });
          appendErrors([`HTTP ${res.status}: ${bodyText.slice(0, 200)}`]);
          break;
        }

        data = await res.json();
      } catch (err) {
        showQueueToast?.({ msg: `Network error: ${err.message}`, type: 'error' });
        appendErrors([`Network: ${err.message}`]);
        break;
      }

      setBatchesRun((prev) => prev + 1);
      setTotalEnriched((prev) => prev + (data.enriched || 0));
      setRemaining(data.remaining ?? 0);
      setUsageStats(data.usageStats || null);

      if (data.snapshot?.entries?.length) {
        setSnapshots((prev) => [...prev, data.snapshot]);
        appendLog(
          data.snapshot.entries.map((e) => ({
            name: e.artist_name,
            kind: e.kind,
            wrote_bio: !!e.post_state?.bio,
            wrote_image: !!e.post_state?.image_url,
            ts: e.written_at,
          })),
        );
      }

      if (data.errors?.length) appendErrors(data.errors);

      if (!data.remaining || data.remaining === 0) {
        showQueueToast?.({ msg: `Backfill complete — ${totalEnriched + (data.enriched || 0)} artists enriched`, type: 'success' });
        keepGoing = false;
        break;
      }

      // Breathing room between batches — keeps total request rate under
      // whatever the LLM providers tolerate.
      await new Promise((r) => setTimeout(r, 1500));
    }

    setRunning(false);
    setPausing(false);
  }, [running, batchSize, bareOnly, password, showQueueToast, totalEnriched]);

  const handlePause = () => {
    stopRef.current = true;
    setPausing(true);
  };

  const handleReset = () => {
    setBatchesRun(0);
    setTotalEnriched(0);
    setRemaining(null);
    setUsageStats(null);
    setEnrichmentLog([]);
    setErrorLog([]);
    setSnapshots([]);
    setPaused(false);
    setPausing(false);
  };

  const downloadSnapshot = () => {
    if (!snapshots.length) return;
    const combined = {
      downloaded_at: new Date().toISOString(),
      total_batches: snapshots.length,
      total_entries: snapshots.reduce((s, b) => s + (b.entries?.length || 0), 0),
      batches: snapshots,
    };
    const blob = new Blob([JSON.stringify(combined, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mylocaljam-enrichment-snapshot-${combined.downloaded_at.replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  const card = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '16px',
  };
  const labelStyle = { fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' };
  const inputStyle = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '6px 10px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    width: '80px',
  };
  const btn = (bg) => ({
    background: bg,
    color: '#1C1917',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  });

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 className="font-display font-bold text-lg" style={{ fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
          Metadata Enrichment
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
          {activeSubTab === 'backfill'
            ? 'Backfill bios, images, and genre tags onto unenriched artists. Runs in a client-driven loop, snapshots each write so rollback is possible.'
            : 'Triage events with missing metadata in a date range. Click a row to jump straight to the right edit modal.'}
        </p>
      </div>

      {/* Sub-tab toggle: Backfill (existing automation) | Triage (interactive
          per-event drill-down). Both modes serve different workflows; the
          backfill is good for processing the long tail at scale, triage is
          good for hands-on cleanup of a specific weekend or week ahead. */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
        {[
          { key: 'backfill', label: 'Backfill' },
          { key: 'triage', label: 'Triage' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveSubTab(t.key)}
            style={{
              padding: '10px 18px', background: 'transparent',
              border: 'none', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px', fontWeight: 600,
              color: activeSubTab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeSubTab === t.key ? '2px solid #E8722A' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'triage' && (
        <TriageView
          password={password}
          range={triageRange}
          setRange={setTriageRange}
          missing={triageMissing}
          setMissing={setTriageMissing}
          preset={triagePreset}
          setPreset={setTriagePreset}
          queue={triageQueue}
          setQueue={setTriageQueue}
          loading={triageLoading}
          setLoading={setTriageLoading}
          error={triageError}
          setError={setTriageError}
          onOpenEvent={onOpenEvent}
          onOpenArtist={onOpenArtist}
        />
      )}

      {activeSubTab !== 'backfill' ? null : (
      <>

      {/* Status banner — prominent Running / Pausing / Paused indicator.
          Shows current batch, enriched count, and live LLM-call total so
          the operator can see cost accruing in real time. */}
      {(running || paused) && (() => {
        const totalLLM = usageStats
          ? Object.values(usageStats).reduce((s, v) => s + (v.calls || 0), 0)
          : 0;
        const mode = pausing ? 'pausing' : running ? 'running' : 'paused';
        const palette = {
          running: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', dot: '#22c55e', text: '#22c55e', label: 'Running' },
          pausing: { bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.35)', dot: '#EAB308', text: '#EAB308', label: 'Pausing after current batch' },
          paused:  { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.35)', dot: '#94a3b8', text: '#94a3b8', label: 'Paused' },
        }[mode];
        return (
          <>
            <style>{`
              @keyframes enrichPulse {
                0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); }
                70%  { box-shadow: 0 0 0 8px rgba(34,197,94,0); }
                100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
              }
            `}</style>
            <div
              style={{
                marginBottom: '12px',
                padding: '12px 14px',
                background: palette.bg,
                border: `1px solid ${palette.border}`,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '200px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: palette.dot,
                    animation: mode === 'running' ? 'enrichPulse 1.6s infinite' : 'none',
                    flexShrink: 0,
                  }}
                />
                <strong style={{ color: palette.text, fontSize: '14px', letterSpacing: '0.2px' }}>
                  {palette.label}
                </strong>
              </div>
              <div style={{ display: 'flex', gap: '18px', fontSize: '12px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span>
                  Batch <strong style={{ color: 'var(--text-primary)' }}>{batchesRun}</strong>
                </span>
                <span>
                  Enriched <strong style={{ color: 'var(--text-primary)' }}>{totalEnriched}</strong>
                </span>
                <span>
                  Remaining <strong style={{ color: 'var(--text-primary)' }}>{remaining === null ? '—' : remaining}</strong>
                </span>
                <span>
                  LLM calls <strong style={{ color: 'var(--text-primary)' }}>{totalLLM}</strong>
                  {usageStats && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      {' '}(G:{usageStats.gemini?.calls || 0} · P:{usageStats.perplexity?.calls || 0} · X:{usageStats.grok?.calls || 0})
                    </span>
                  )}
                </span>
              </div>
            </div>
          </>
        );
      })()}

      {/* Controls */}
      <div style={{ ...card, marginBottom: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Batch size (1–25)</label>
            <input
              type="number"
              min="1"
              max="25"
              value={batchSize}
              onChange={(e) => setBatchSize(Math.max(1, Math.min(25, parseInt(e.target.value, 10) || 1)))}
              disabled={running}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={bareOnly}
                onChange={(e) => setBareOnly(e.target.checked)}
                disabled={running}
              />
              Bare only (no bio AND no image)
            </label>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            {!running && (
              <button onClick={runBackfill} style={btn('#E8722A')}>
                {paused ? 'Resume Backfill' : 'Run Backfill'}
              </button>
            )}
            {running && (
              <button onClick={handlePause} disabled={pausing} style={{ ...btn('#EAB308'), opacity: pausing ? 0.6 : 1, cursor: pausing ? 'not-allowed' : 'pointer' }}>
                {pausing ? 'Pausing after current batch…' : 'Pause after current batch'}
              </button>
            )}
            {!running && batchesRun > 0 && (
              <button
                onClick={handleReset}
                style={{ ...btn('var(--bg-secondary)'), color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              >
                Reset counters
              </button>
            )}
            {snapshots.length > 0 && (
              <button onClick={downloadSnapshot} style={btn('#22c55e')}>
                Download snapshot ({snapshots.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress + stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <StatCard label="Batches run" value={batchesRun} />
        <StatCard label="Artists enriched" value={totalEnriched} accent="#E8722A" />
        <StatCard
          label="Remaining in queue"
          value={remaining === null ? '—' : remaining}
          subtitle={remaining === 0 ? 'All caught up' : running ? 'Running…' : paused ? 'Paused' : null}
        />
        <StatCard
          label="LLM calls"
          value={usageStats ? Object.values(usageStats).reduce((s, v) => s + (v.calls || 0), 0) : 0}
          subtitle={usageStats
            ? `G:${usageStats.gemini?.calls || 0} · P:${usageStats.perplexity?.calls || 0} · X:${usageStats.grok?.calls || 0}`
            : null}
        />
      </div>

      {/* Two-column log display */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Enrichment Log</strong>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{enrichmentLog.length} entries</span>
          </div>
          {enrichmentLog.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0' }}>
              No enrichments yet.
            </div>
          ) : (
            <div style={{ maxHeight: '260px', overflowY: 'auto', fontSize: '12px' }}>
              {enrichmentLog.map((e, i) => (
                <div
                  key={i}
                  style={{
                    padding: '6px 0',
                    borderBottom: i < enrichmentLog.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontWeight: 700,
                        marginRight: '6px',
                        background: e.kind === 'VENUE_EVENT' ? 'rgba(96,165,250,0.15)' : 'rgba(232,114,42,0.15)',
                        color: e.kind === 'VENUE_EVENT' ? '#60A5FA' : '#E8722A',
                      }}
                    >
                      {e.kind || 'MUSICIAN'}
                    </span>
                    {e.name}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                    {e.wrote_bio && '📝 '}
                    {e.wrote_image && '🖼 '}
                    {!e.wrote_bio && !e.wrote_image && '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong style={{ fontSize: '13px', color: '#ef4444' }}>Errors</strong>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{errorLog.length} entries</span>
          </div>
          {errorLog.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0' }}>
              No errors.
            </div>
          ) : (
            <div style={{ maxHeight: '260px', overflowY: 'auto', fontSize: '12px' }}>
              {errorLog.map((err, i) => (
                <div
                  key={i}
                  style={{
                    padding: '6px 0',
                    borderBottom: i < errorLog.length - 1 ? '1px solid var(--border)' : 'none',
                    color: '#ef4444',
                    wordBreak: 'break-word',
                  }}
                >
                  {err}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Safety reminder */}
      <div
        style={{
          marginTop: '16px',
          padding: '10px 12px',
          background: 'rgba(234,179,8,0.08)',
          border: '1px solid rgba(234,179,8,0.2)',
          borderRadius: '8px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}
      >
        <strong style={{ color: '#EAB308' }}>Safety:</strong> Start with a small batch size (2) and verify
        results before bumping to 20-25. Download the snapshot after each session — it's the only copy of
        the pre-write state once the Vercel function has cold-booted.
      </div>
      </>
      )}
    </div>
  );
}

// ── Triage sub-component ────────────────────────────────────────────────────
// Self-contained: receives state from the parent so the parent can persist
// the operator's filter choices when they switch sub-tabs and back. Fires
// the GET /api/admin/enrichment-queue endpoint whenever filters change.
function TriageView({
  password, range, setRange, missing, setMissing, preset, setPreset,
  queue, setQueue, loading, setLoading, error, setError,
  onOpenEvent, onOpenArtist,
}) {
  // Refetch the queue any time the filters change. Debounced lightly so
  // typing in the custom date inputs doesn't spam the endpoint mid-keystroke.
  useEffect(() => {
    if (!range?.from || !range?.to || !missing) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ from: range.from, to: range.to, missing });
        const res = await fetch(`/api/admin/enrichment-queue?${params}`, {
          headers: { Authorization: `Bearer ${password}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setQueue(data.events || []);
      } catch (err) {
        setError(err?.message || 'Network error');
        setQueue([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [range.from, range.to, missing, password, setQueue, setLoading, setError]);

  // Preset chip helpers — set range AND mark which preset is active so
  // the chip stays highlighted. Custom dates clear the preset.
  const setPresetToday = () => {
    const t = todayET();
    setRange({ from: t, to: t });
    setPreset('today');
  };
  const setPresetWeekend = () => {
    setRange(thisWeekendRange());
    setPreset('weekend');
  };
  const setPresetWeek = () => {
    const t = todayET();
    setRange({ from: t, to: addDaysET(t, 7) });
    setPreset('week');
  };

  const presetButtonStyle = (key) => ({
    padding: '6px 12px',
    borderRadius: '999px',
    border: `1px solid ${preset === key ? '#E8722A' : 'var(--border)'}`,
    background: preset === key ? 'rgba(232,114,42,0.10)' : 'transparent',
    color: preset === key ? '#E8722A' : 'var(--text-secondary)',
    fontSize: '12px', fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  });

  const missingButtonStyle = (key) => ({
    padding: '8px 14px',
    borderRadius: '999px',
    border: `1.5px solid ${missing === key ? '#E8722A' : 'var(--border)'}`,
    background: missing === key ? '#E8722A' : 'transparent',
    color: missing === key ? '#000000' : 'var(--text-secondary)',
    fontSize: '12px', fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    textTransform: 'uppercase', letterSpacing: '0.5px',
  });

  const formatRowDate = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const day = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
      const dateNum = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
      const time = d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
      });
      // Hide midnight-stub times so the operator isn't fooled into thinking
      // "12:00 AM" is the real start time. Most scraped events with no time
      // default to midnight; we render only the date in that case.
      const isMidnightStub = /^12:00\s*AM$/i.test(time);
      return isMidnightStub ? `${day} · ${dateNum}` : `${day} · ${dateNum} · ${time}`;
    } catch {
      return iso;
    }
  };

  const handleRowClick = (ev) => {
    // Artist-linked → fix at the source (artist row), so all events for
    // that artist get the benefit. Event-only → open the event modal so
    // the operator can edit just this row.
    //
    // We pass the joined artist row directly (via ev.artists) rather than
    // looking it up in the parent's `ar.artists` cache. The cache may be
    // empty if the operator hasn't visited the Artists tab yet, which
    // produced the "Artist not in the loaded list" toast bug. The triage
    // API already joined the artist row, so it's right here in the queue
    // entry — pass the whole object and skip the lookup.
    if (ev.has_artist && ev.artist_id) {
      onOpenArtist?.(ev.artists, ev.artist_id);
    } else {
      onOpenEvent?.(ev);
    }
  };

  return (
    <div>
      {/* Date range row — preset chips + custom inputs side-by-side. The
          custom inputs always reflect the current range, even when a preset
          is selected, so the operator can see exactly which days are being
          queried. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        flexWrap: 'wrap', marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={setPresetToday} style={presetButtonStyle('today')}>Today</button>
          <button onClick={setPresetWeekend} style={presetButtonStyle('weekend')}>This Weekend</button>
          <button onClick={setPresetWeek} style={presetButtonStyle('week')}>Next 7 Days</button>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
          <span>From</span>
          <input
            type="date"
            value={range.from || ''}
            onChange={e => { setRange(r => ({ ...r, from: e.target.value })); setPreset('custom'); }}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '4px 8px', color: 'var(--text-primary)',
              fontSize: '12px', fontFamily: "'DM Sans', sans-serif",
            }}
          />
          <span>To</span>
          <input
            type="date"
            value={range.to || ''}
            onChange={e => { setRange(r => ({ ...r, to: e.target.value })); setPreset('custom'); }}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '4px 8px', color: 'var(--text-primary)',
              fontSize: '12px', fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </div>
      </div>

      {/* Filter pills — single-select. Two groups in one row:
          (1) Single-field gap checks: Missing Image / Bio / Genres / Vibes
          (2) Composite filters: Incomplete (any of the four) and
              Artist Unlocked (events with an artist whose row hasn't
              been finalized by an admin yet — useful when the operator
              wants to lock down the long tail of "loose" artist profiles
              before they get auto-modified by enrichment runs). */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {[
          { key: 'image', label: 'Missing Image' },
          { key: 'bio', label: 'Missing Bio' },
          { key: 'genres', label: 'Missing Genres' },
          { key: 'vibes', label: 'Missing Vibes' },
          { key: 'incomplete', label: 'Incomplete (any)' },
          { key: 'artist_unlocked', label: 'Artist Unlocked' },
        ].map(opt => (
          <button key={opt.key} onClick={() => setMissing(opt.key)} style={missingButtonStyle(opt.key)}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Result count + state strip — copy varies by filter type so the
          summary reads naturally for both single-field and composite views. */}
      {(() => {
        const filterDescription = (() => {
          if (missing === 'incomplete') return 'incomplete';
          if (missing === 'artist_unlocked') return 'with unlocked artists';
          return `missing ${missing}`;
        })();
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            fontSize: '12px', color: 'var(--text-muted)',
            marginBottom: '12px',
          }}>
            {loading && <span>Loading…</span>}
            {!loading && !error && (
              <span>
                <strong style={{ color: 'var(--text-primary)' }}>{queue.length}</strong>
                {' '}event{queue.length === 1 ? '' : 's'} {filterDescription} ·{' '}
                {range.from} → {range.to}
              </span>
            )}
            {error && (
              <span style={{ color: '#ef4444' }}>Error: {error}</span>
            )}
          </div>
        );
      })()}

      {/* Result list */}
      {!loading && queue.length === 0 && !error && (
        <div style={{
          padding: '24px', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: '13px',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
        }}>
          {missing === 'incomplete'
            ? 'No incomplete events in this range — every event has all four metadata fields. Try a wider date range or a different filter.'
            : missing === 'artist_unlocked'
              ? 'No events with unlocked artists in this range — every linked artist has been finalized. Try a wider date range.'
              : `No events with missing ${missing} in this range. Try a wider date range or a different field.`}
        </div>
      )}

      {!loading && queue.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}>
          {queue.map((ev, i) => {
            const displayName = ev.event_title || ev.artist_name || '(untitled)';
            return (
              <button
                key={ev.id}
                onClick={() => handleRowClick(ev)}
                style={{
                  display: 'block', width: '100%',
                  padding: '12px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: i < queue.length - 1 ? '1px solid var(--border)' : 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(232,114,42,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {/* Linkage chip — clarified Apr 29:
                      - ARTIST (green) means the row has artist_id set; click → artist editor.
                      - UNLINKED (yellow) means no artist_id. Could be a real
                        musician not yet linked to a canonical artist row, OR a
                        genuinely event-only listing (Corona Promo, Trivia Night).
                        Click → event editor where the operator can decide. The
                        previous label "EVENT" was misleading because most
                        unlinked rows are actually real musicians. */}
                  <span
                    title={ev.has_artist
                      ? 'Linked to a canonical artist row — click to edit the artist (fix-at-source)'
                      : 'No artist link yet — click to edit the event row. From there you can link to an existing artist or just fix event-level fields.'}
                    style={{
                      fontSize: '9px', fontWeight: 700,
                      padding: '2px 6px', borderRadius: '999px',
                      background: ev.has_artist ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.14)',
                      color: ev.has_artist ? '#22c55e' : '#eab308',
                      flexShrink: 0,
                    }}
                  >
                    {ev.has_artist ? '🎤 ARTIST' : '🔗 UNLINKED'}
                  </span>
                  {/* Title */}
                  <strong style={{
                    fontSize: '14px', color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {displayName}
                  </strong>
                  {/* Missing/state badge — what's wrong with this row.
                      Shape varies by filter:
                        single-field (image/bio/genres/vibes) → "NO IMAGE"
                        incomplete  → list every missing field, e.g.
                                       "NO BIO, NO IMG" (so the operator
                                       sees at-a-glance what to focus on)
                        artist_unlocked → "UNLOCKED" in amber, since this
                                       isn't really a "missing" state — the
                                       artist row just isn't finalized. */}
                  {(() => {
                    if (ev.missing === 'artist_unlocked') {
                      return (
                        <span style={{
                          fontSize: '9px', fontWeight: 700,
                          padding: '2px 8px', borderRadius: '999px',
                          background: 'rgba(234,179,8,0.14)', color: '#eab308',
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                          marginLeft: 'auto',
                          flexShrink: 0,
                        }}>UNLOCKED</span>
                      );
                    }
                    if (ev.missing === 'incomplete') {
                      const abbrev = { image: 'IMG', bio: 'BIO', genres: 'GENRES', vibes: 'VIBES' };
                      const fields = (ev.missing_fields || []).map(f => `NO ${abbrev[f] || f.toUpperCase()}`);
                      return (
                        <span style={{
                          fontSize: '9px', fontWeight: 700,
                          padding: '2px 8px', borderRadius: '999px',
                          background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                          marginLeft: 'auto',
                          flexShrink: 0,
                          maxWidth: '220px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{fields.join(', ')}</span>
                      );
                    }
                    return (
                      <span style={{
                        fontSize: '9px', fontWeight: 700,
                        padding: '2px 8px', borderRadius: '999px',
                        background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                        marginLeft: 'auto',
                        flexShrink: 0,
                      }}>NO {ev.missing.toUpperCase()}</span>
                    );
                  })()}
                </div>
                <div style={{
                  fontSize: '12px', color: 'var(--text-muted)',
                  marginTop: '4px',
                }}>
                  {ev.venue_name || '(no venue)'} · {formatRowDate(ev.event_date)}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, subtitle, accent }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '12px 14px',
      }}
    >
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 800, color: accent || 'var(--text-primary)', marginTop: '2px', fontFamily: "'DM Sans', sans-serif" }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
