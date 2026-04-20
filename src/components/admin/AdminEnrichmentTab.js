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
  }, [running, batchSize, bareOnly, password, showQueueToast, totalEnriched]);

  const handlePause = () => { stopRef.current = true; };

  const handleReset = () => {
    setBatchesRun(0);
    setTotalEnriched(0);
    setRemaining(null);
    setUsageStats(null);
    setEnrichmentLog([]);
    setErrorLog([]);
    setSnapshots([]);
    setPaused(false);
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
                {batchesRun > 0 && !paused ? 'Resume Backfill' : 'Run Backfill'}
              </button>
            )}
            {running && (
              <button onClick={handlePause} style={btn('#EAB308')}>
                Pause after current batch
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
