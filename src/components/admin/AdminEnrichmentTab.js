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

import { useState, useRef, useCallback } from 'react';

const ENDPOINT = '/api/admin/enrich-backfill';

export default function AdminEnrichmentTab({ password, showQueueToast }) {
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
          Backfill bios, images, and genre tags onto unenriched artists. Runs in a client-driven loop, snapshots
          each write so rollback is possible.
        </p>
      </div>

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
