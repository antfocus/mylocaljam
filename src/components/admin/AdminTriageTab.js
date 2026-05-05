'use client';

import { formatDate, formatTime } from '@/lib/utils';
import { safeHref } from '@/lib/safeHref';
import { Icons } from '@/components/Icons';

export default function AdminTriageTab({
  events, venues,
  triageEvents, triageLoading, triageActionId,
  triageCategorize, triageDelete, fetchTriage,
  setEditingEvent, setShowEventForm,
}) {
  return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h2 className="font-display font-bold text-lg" style={{ color: 'var(--text-primary)', margin: 0 }}>Event Triage</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                Categorize scraped events before they hit the live feed. {triageEvents.length} pending.
              </p>
            </div>
            <button
              onClick={fetchTriage}
              className="px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              ↻ Refresh
            </button>
          </div>

          {triageLoading && <div className="text-center py-8 text-brand-text-muted animate-pulse">Loading triage events...</div>}

          {!triageLoading && triageEvents.length === 0 && (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
              <div className="font-display font-bold text-lg">Inbox Zero</div>
              <p className="text-sm mt-1">All scraped events have been reviewed. Nice work!</p>
            </div>
          )}

          {!triageLoading && triageEvents.length > 0 && (
            <div className="space-y-2">
              {triageEvents.map(ev => {
                const isActioning = triageActionId === ev.id;
                return (
                  <div
                    key={ev.id}
                    className="rounded-xl border"
                    style={{
                      background: 'var(--bg-card)', borderColor: 'var(--border)',
                      opacity: isActioning ? 0.5 : 1, transition: 'opacity 0.2s',
                      padding: '12px 14px',
                    }}
                  >
                    {/* Row 1: Event info */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-display font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                          {ev.artist_name || '(No artist name)'}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          <span>{ev.venue_name || ev.venues?.name || '—'} · {formatDate(ev.event_date)} · {formatTime(ev.event_date)}</span>
                          {/* safeHref drops non-http(s) URLs (security audit H4). */}
                          {safeHref(ev.source) && (
                            <a
                              href={safeHref(ev.source)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] font-medium"
                              style={{ color: '#E8722A', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" fill="currentColor" /></svg>
                              {(() => { try { return new URL(safeHref(ev.source)).hostname.replace('www.', ''); } catch { return 'source'; } })()}
                            </a>
                          )}
                        </div>
                        {ev.artist_bio && (
                          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)', maxHeight: '36px', overflow: 'hidden' }}>
                            {ev.artist_bio.substring(0, 120)}{ev.artist_bio.length > 120 ? '…' : ''}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Category pills + Trash */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {[
                        { key: 'Live Music', label: 'Live Music', color: '#23CE6B', bg: '#23CE6B18' },
                        { key: 'Food & Drink Special', label: 'Food & Drink', color: '#F59E0B', bg: '#F59E0B18' },
                        { key: 'Trivia', label: 'Trivia', color: '#8B5CF6', bg: '#8B5CF618' },
                        { key: 'Sports / Watch Party', label: 'Sports', color: '#3B82F6', bg: '#3B82F618' },
                        { key: 'Other / Special Event', label: 'Other', color: '#EC4899', bg: '#EC489918' },
                      ].map(cat => (
                        <button
                          key={cat.key}
                          disabled={isActioning}
                          onClick={() => triageCategorize(ev, cat.key)}
                          className="text-xs font-display font-semibold px-3 py-1.5 rounded-lg"
                          style={{
                            border: `1px solid ${cat.color}33`,
                            color: cat.color,
                            background: cat.bg,
                            cursor: isActioning ? 'wait' : 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {cat.label}
                        </button>
                      ))}

                      {/* Spacer */}
                      <div style={{ flex: 1 }} />

                      {/* Edit button */}
                      <button
                        className="p-1.5 rounded"
                        style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
                        onClick={() => { setEditingEvent(ev); setShowEventForm(true); }}
                        title="Edit event details"
                      >
                        {Icons.edit}
                      </button>

                      {/* Trash icon */}
                      <button
                        disabled={isActioning}
                        onClick={() => triageDelete(ev)}
                        className="p-1.5 rounded"
                        style={{ color: 'var(--text-muted)', cursor: isActioning ? 'wait' : 'pointer' }}
                        title="Delete — junk event"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
  );
}