'use client';

import { GENRES, VIBES } from '@/lib/utils';

export default function AdminSubmissionsTab({
  artists, venues, queue, submissions, reports,
  queueSelectedIdx, queueActionLoading, queueForm,
  queueDuplicates, queueDupLoading,
  adminFlyerUploading, adminFlyerDragOver, setAdminFlyerDragOver,
  newVenueOpen, setNewVenueOpen, newVenueName, setNewVenueName,
  newVenueAddress, setNewVenueAddress, newVenueLoading,
  isMobile, mobileQueueDetail, setMobileQueueDetail,
  qSurface, qSurfaceAlt, qBorder, qText, qTextMuted, qAccent,
  fetchQueue, handleAdminFlyerUpload, selectQueueItem, updateQueueForm,
  handleQueueApprove, handleQueueReject, handleQueueArchive,
  handleCreateVenue, resolveVenueId, applyBatchToFlyer,
  setQueueLightboxUrl,
  adminFlyerRef,
}) {
  return (
        <div>
          {queue.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: '16px' }}>
              <span style={{ fontSize: '48px' }}>🫙</span>
              <p className="font-display font-bold text-lg">Queue is empty</p>
              <p className="text-sm" style={{ color: qTextMuted }}>All submissions have been reviewed.</p>
              <input
                ref={adminFlyerRef}
                type="file"
                accept="image/*"
                onChange={(e) => { if (e.target.files?.[0]) handleAdminFlyerUpload(e.target.files[0]); e.target.value = ''; }}
                style={{ display: 'none' }}
              />
              <div
                onClick={() => !adminFlyerUploading && adminFlyerRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setAdminFlyerDragOver(true); }}
                onDragLeave={() => setAdminFlyerDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setAdminFlyerDragOver(false); const f = e.dataTransfer?.files?.[0]; if (f && f.type.startsWith('image/')) handleAdminFlyerUpload(f); }}
                style={{
                  padding: '24px 32px', borderRadius: '12px', cursor: adminFlyerUploading ? 'wait' : 'pointer',
                  border: `2px dashed ${adminFlyerDragOver ? '#E8722A' : qBorder}`,
                  background: adminFlyerDragOver ? 'rgba(232,114,42,0.08)' : qSurface,
                  textAlign: 'center', transition: 'all 0.15s',
                }}
              >
                {adminFlyerUploading ? (
                  <p className="text-sm font-medium" style={{ color: '#E8722A' }}>Processing flyer...</p>
                ) : (
                  <>
                    <p className="font-display font-bold text-sm" style={{ color: qText }}>Upload a Flyer / Poster</p>
                    <p className="text-xs mt-1" style={{ color: qTextMuted }}>Drop an image or click to upload — OCR will extract artists automatically</p>
                  </>
                )}
              </div>
              <button onClick={fetchQueue} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ border: `1px solid ${qBorder}`, background: qSurface, color: qText }}>
                ↻ Refresh
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', borderRadius: isMobile ? '0' : '16px', overflow: 'hidden', border: isMobile ? 'none' : `1px solid ${qBorder}`, height: isMobile ? 'auto' : 'calc(100vh - 220px)' }}>
              {/* ── Left: Queue Sidebar — on mobile, only show when detail is closed ── */}
              {(!isMobile || !mobileQueueDetail) && (
              <div style={{ width: isMobile ? '100%' : '240px', minWidth: isMobile ? 'auto' : '240px', borderRight: isMobile ? 'none' : `1px solid ${qBorder}`, overflowY: 'auto', background: isMobile ? 'transparent' : qSurface }}>
                {/* ── Admin Flyer Upload Zone ──────────────────────────── */}
                <input
                  ref={adminFlyerRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => { if (e.target.files?.[0]) handleAdminFlyerUpload(e.target.files[0]); e.target.value = ''; }}
                  style={{ display: 'none' }}
                />
                <div
                  onClick={() => !adminFlyerUploading && adminFlyerRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setAdminFlyerDragOver(true); }}
                  onDragLeave={() => setAdminFlyerDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setAdminFlyerDragOver(false); const f = e.dataTransfer?.files?.[0]; if (f && f.type.startsWith('image/')) handleAdminFlyerUpload(f); }}
                  style={{
                    margin: '10px', padding: adminFlyerUploading ? '12px 10px' : '14px 10px',
                    borderRadius: '10px',
                    border: adminFlyerDragOver ? '2px solid #E8722A' : '2px dashed #3A3A50',
                    background: adminFlyerDragOver ? 'rgba(232,114,42,0.12)' : 'rgba(232,114,42,0.04)',
                    cursor: adminFlyerUploading ? 'wait' : 'pointer',
                    textAlign: 'center', transition: 'all 0.15s ease',
                  }}
                >
                  {adminFlyerUploading ? (
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#E8722A', fontFamily: "'DM Sans', sans-serif" }}>
                      Processing with AI...
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '20px', marginBottom: '4px' }}>&#128302;</div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: qText, fontFamily: "'DM Sans', sans-serif" }}>
                        Drop Flyer Here
                      </div>
                      <div style={{ fontSize: '10px', color: qTextMuted, fontFamily: "'DM Sans', sans-serif", marginTop: '2px' }}>
                        AI reads it instantly
                      </div>
                    </>
                  )}
                </div>

                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${qBorder}`, fontSize: '11px', fontWeight: 700, color: qTextMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Pending ({queue.length})
                </div>
                {queue.map((sub, i) => (
                  <div
                    key={sub.id}
                    onClick={() => { selectQueueItem(i); if (isMobile) setMobileQueueDetail(true); }}
                    style={{
                      padding: '14px 16px', cursor: 'pointer',
                      borderBottom: `1px solid ${qBorder}`,
                      background: i === queueSelectedIdx ? qSurfaceAlt : 'transparent',
                      borderLeft: i === queueSelectedIdx ? `3px solid ${qAccent}` : '3px solid transparent',
                      borderRadius: isMobile ? '10px' : '0',
                      marginBottom: isMobile ? '4px' : '0',
                      border: isMobile ? `1px solid ${qBorder}` : undefined,
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 700, color: qText, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sub.artist_name || (sub.image_url ? '📷 Flyer Upload' : 'Unknown')}
                    </div>
                    <div style={{ fontSize: '12px', color: qTextMuted }}>
                      {sub.venue_name || 'No venue'} · {sub.event_date ? sub.event_date.substring(0, 10) : 'No date'}
                    </div>
                    <div style={{
                      display: 'inline-block', marginTop: '4px',
                      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px',
                      background: sub.image_url ? '#3B82F622' : '#EAB30822',
                      color: sub.image_url ? '#60A5FA' : '#FBBF24',
                    }}>
                      {sub.image_url ? '📷 Flyer' : '✏️ Manual'}
                    </div>
                  </div>
                ))}
              </div>
              )}

              {/* ── Middle + Right: Source & Editor — on mobile, only show when detail is open ── */}
              {(!isMobile || mobileQueueDetail) && (<>
              {/* Mobile back button */}
              {isMobile && (
                <button
                  onClick={() => setMobileQueueDetail(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '10px 14px', marginBottom: '12px',
                    background: 'none', border: `1px solid ${qBorder}`, borderRadius: '10px',
                    color: '#E8722A', fontSize: '13px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  ← Back to Submissions
                </button>
              )}
              {/* ── Middle: Source Panel ────────────────────────────────────── */}
              <div style={{ flex: '1 1 40%', minWidth: isMobile ? 'auto' : '280px', borderRight: isMobile ? 'none' : `1px solid ${qBorder}`, overflowY: 'auto', padding: isMobile ? '12px 0' : '24px' }}>
                {queueSelected ? (
                  <>
                    <h2 style={{ fontSize: '14px', fontWeight: 700, color: qTextMuted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px' }}>
                      Source Material
                    </h2>
                    {queueSelected.image_url ? (
                      <div style={{ marginBottom: '20px' }}>
                        <img
                          src={queueSelected.image_url}
                          alt="Submitted flyer"
                          onClick={() => setQueueLightboxUrl(queueSelected.image_url)}
                          style={{
                            width: '100%', maxHeight: '500px', objectFit: 'contain',
                            borderRadius: '12px', border: `1px solid ${qBorder}`,
                            cursor: 'zoom-in', background: '#000',
                          }}
                        />
                        <p style={{ fontSize: '11px', color: qTextMuted, marginTop: '6px', textAlign: 'center' }}>
                          Click to zoom
                        </p>
                      </div>
                    ) : (
                      <div style={{
                        padding: '40px', borderRadius: '12px', border: `1px dashed ${qBorder}`,
                        textAlign: 'center', color: qTextMuted, marginBottom: '20px',
                      }}>
                        No flyer uploaded — manual entry submission
                      </div>
                    )}
                    <div style={{ background: qSurfaceAlt, borderRadius: '10px', padding: '16px', border: `1px solid ${qBorder}` }}>
                      <h3 style={{ fontSize: '12px', fontWeight: 700, color: qTextMuted, textTransform: 'uppercase', marginBottom: '12px' }}>
                        Submission Details
                      </h3>
                      {[
                        ['Artist', queueSelected.artist_name || '—'],
                        ['Venue', queueSelected.venue_name || '—'],
                        ['Date', queueSelected.event_date ? queueSelected.event_date.substring(0, 10) : '—'],
                        ['Submitter', queueSelected.submitter_email || 'Anonymous'],
                        ['Submitted', queueSelected.created_at ? new Date(queueSelected.created_at).toLocaleString() : '—'],
                      ].map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${qBorder}` }}>
                          <span style={{ fontSize: '12px', color: qTextMuted }}>{label}</span>
                          <span style={{ fontSize: '12px', color: qText, fontWeight: 600 }}>{value}</span>
                        </div>
                      ))}
                      {queueSelected.notes && (
                        <div style={{ marginTop: '10px' }}>
                          <span style={{ fontSize: '12px', color: qTextMuted }}>Notes:</span>
                          <p style={{ fontSize: '13px', color: qText, marginTop: '4px', lineHeight: 1.5 }}>{queueSelected.notes}</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: qTextMuted }}>
                    Select a submission from the queue
                  </div>
                )}
              </div>

              {/* ── Right: Editor Panel ─────────────────────────────────────── */}
              <div style={{ flex: '1 1 40%', minWidth: '300px', overflowY: 'auto', padding: '24px' }}>
                {queueSelected ? (
                  <>
                    <h2 style={{ fontSize: '14px', fontWeight: 700, color: qTextMuted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '16px' }}>
                      Event Editor
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label style={qLabelStyle}>Artist / Band Name *</label>
                        <input style={qInputStyle} value={queueForm.artist_name} onChange={e => updateQueueForm('artist_name', e.target.value)} placeholder="e.g. The Gaslight Anthem" />
                      </div>
                      <div>
                        <label style={qLabelStyle}>Event / Festival Name</label>
                        <input list="queue-festival-options" style={{
                          ...qInputStyle,
                          borderColor: queueForm.event_name ? '#f59e0b' : qInputStyle.borderColor || 'var(--border)',
                        }} value={queueForm.event_name} onChange={e => updateQueueForm('event_name', e.target.value)} placeholder="Start typing to search or create new..." />
                        <datalist id="queue-festival-options">
                          {festivalNames.map(f => <option key={f} value={f} />)}
                        </datalist>
                        {queueForm.event_name && (
                          <div style={{ fontSize: '11px', color: '#f59e0b', fontFamily: "'DM Sans', sans-serif", marginTop: '4px' }}>
                            🔥 Festival mode — this event will be tagged &amp; searchable as &ldquo;{queueForm.event_name}&rdquo;
                          </div>
                        )}
                        {batchApplyPrompt && batchApplyPrompt.field === 'event_name' && (
                          <div style={{
                            marginTop: '8px', padding: '10px 12px', borderRadius: '8px',
                            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                            fontFamily: "'DM Sans', sans-serif",
                          }}>
                            <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600, marginBottom: '6px' }}>
                              📋 {batchApplyPrompt.count} other submissions from this flyer
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={applyBatchToFlyer}
                                style={{
                                  padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                                  background: '#f59e0b', color: '#000', border: 'none',
                                }}
                              >
                                Apply &ldquo;{batchApplyPrompt.value}&rdquo; to all {batchApplyPrompt.count}
                              </button>
                              <button
                                onClick={() => setBatchApplyPrompt(null)}
                                style={{
                                  padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                                  background: 'transparent', color: qTextMuted, border: `1px solid ${qBorder}`,
                                }}
                              >
                                Skip
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={qLabelStyle}>Venue *</label>
                        <input list="queue-venue-options" style={{
                          ...qInputStyle,
                          borderColor: queueForm.venue_name && !resolveVenueId(queueForm.venue_name) ? '#ef4444' : qInputStyle.borderColor || 'var(--border)',
                        }} value={queueForm.venue_name} onChange={e => updateQueueForm('venue_name', e.target.value)} placeholder="Start typing..." />
                        <datalist id="queue-venue-options">
                          {venues.map(v => <option key={v.id} value={v.name} />)}
                        </datalist>
                        {queueForm.venue_name && !resolveVenueId(queueForm.venue_name) && (
                          <div style={{ marginTop: '6px' }}>
                            <div style={{ fontSize: '11px', color: '#ef4444', fontFamily: "'DM Sans', sans-serif", marginBottom: '6px' }}>
                              Not a registered venue — select from dropdown or create new
                            </div>
                            {!newVenueOpen ? (
                              <button
                                onClick={() => { setNewVenueName(queueForm.venue_name); setNewVenueOpen(true); }}
                                style={{
                                  padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                                  background: 'rgba(232,114,42,0.1)', color: '#E8722A',
                                  border: '1px solid rgba(232,114,42,0.3)',
                                }}
                              >
                                + Create &ldquo;{queueForm.venue_name}&rdquo; as New Venue
                              </button>
                            ) : (
                              <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(232,114,42,0.06)', border: '1px solid rgba(232,114,42,0.2)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <input
                                    type="text"
                                    value={newVenueName}
                                    onChange={e => setNewVenueName(e.target.value)}
                                    placeholder="Venue name"
                                    style={{ ...qInputStyle, fontSize: '12px', padding: '6px 10px' }}
                                  />
                                  <input
                                    type="text"
                                    value={newVenueAddress}
                                    onChange={e => setNewVenueAddress(e.target.value)}
                                    placeholder="Address (optional)"
                                    style={{ ...qInputStyle, fontSize: '12px', padding: '6px 10px' }}
                                  />
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      onClick={handleCreateVenue}
                                      disabled={newVenueLoading || !newVenueName.trim()}
                                      style={{
                                        padding: '5px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                        fontFamily: "'DM Sans', sans-serif", cursor: newVenueLoading ? 'wait' : 'pointer',
                                        background: '#E8722A', color: '#1C1917', border: 'none',
                                      }}
                                    >
                                      {newVenueLoading ? 'Creating...' : 'Create Venue'}
                                    </button>
                                    <button
                                      onClick={() => { setNewVenueOpen(false); setNewVenueName(''); setNewVenueAddress(''); }}
                                      style={{
                                        padding: '5px 10px', borderRadius: '6px', fontSize: '11px',
                                        fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                                        background: 'none', color: qTextMuted, border: `1px solid ${qBorder}`,
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {batchApplyPrompt && batchApplyPrompt.field === 'venue_name' && (
                          <div style={{
                            marginTop: '8px', padding: '10px 12px', borderRadius: '8px',
                            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                            fontFamily: "'DM Sans', sans-serif",
                          }}>
                            <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600, marginBottom: '6px' }}>
                              📋 {batchApplyPrompt.count} other submissions from this flyer
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={applyBatchToFlyer}
                                style={{
                                  padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                                  background: '#f59e0b', color: '#000', border: 'none',
                                }}
                              >
                                Apply &ldquo;{batchApplyPrompt.value}&rdquo; to all {batchApplyPrompt.count}
                              </button>
                              <button
                                onClick={() => setBatchApplyPrompt(null)}
                                style={{
                                  padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                                  background: 'transparent', color: qTextMuted, border: `1px solid ${qBorder}`,
                                }}
                              >
                                Skip
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={qLabelStyle}>Date *</label>
                          <input type="date" style={qInputStyle} value={queueForm.event_date} onChange={e => updateQueueForm('event_date', e.target.value)} />
                        </div>
                        <div>
                          <label style={qLabelStyle}>Time</label>
                          <input type="time" style={qInputStyle} value={queueForm.event_time} onChange={e => updateQueueForm('event_time', e.target.value)} />
                        </div>
                      </div>
                      {queueDuplicates.length > 0 && (
                        <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#EAB30815', border: '1px solid #EAB30844' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#FBBF24', marginBottom: '4px' }}>
                            ⚠️ Possible Duplicate{queueDuplicates.length > 1 ? 's' : ''}
                          </div>
                          {queueDuplicates.map(d => (
                            <div key={d.id} style={{ fontSize: '12px', color: qTextMuted }}>
                              {d.artist_name} at {d.venue_name} ({d.event_date?.substring(0, 10)})
                            </div>
                          ))}
                        </div>
                      )}
                      <div>
                        <label style={qLabelStyle}>Category {queueForm.confidence_score > 0 && (
                          <span style={{
                            marginLeft: '8px', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                            background: queueForm.confidence_score >= 90 ? '#23CE6B22' : queueForm.confidence_score >= 70 ? '#F59E0B22' : '#EF444422',
                            color: queueForm.confidence_score >= 90 ? '#23CE6B' : queueForm.confidence_score >= 70 ? '#F59E0B' : '#EF4444',
                          }}>
                            AI {queueForm.confidence_score}%{queueForm.confidence_score >= 90 ? ' ✓ auto-routed' : ''}
                          </span>
                        )}</label>
                        <select style={{
                          ...qInputStyle, cursor: 'pointer',
                          borderColor: queueForm.confidence_score >= 90 ? '#23CE6B44' : qInputStyle.borderColor || 'var(--border)',
                        }} value={queueForm.category} onChange={e => updateQueueForm('category', e.target.value)}>
                          <option value="">Select...</option>
                          <option value="Live Music">Live Music</option>
                          <option value="DJ">DJ</option>
                          <option value="Comedy">Comedy</option>
                          <option value="Festival">Festival</option>
                          <option value="Food & Drink Special">Food & Drink Special</option>
                          <option value="Trivia">Trivia</option>
                          <option value="Sports / Watch Party">Sports / Watch Party</option>
                          <option value="Other / Special Event">Other / Special Event</option>
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={qLabelStyle}>Genre</label>
                          <select style={{ ...qInputStyle, cursor: 'pointer' }} value={queueForm.genre} onChange={e => updateQueueForm('genre', e.target.value)}>
                            <option value="">Select...</option>
                            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={qLabelStyle}>Vibe</label>
                          <select style={{ ...qInputStyle, cursor: 'pointer' }} value={queueForm.vibe} onChange={e => updateQueueForm('vibe', e.target.value)}>
                            <option value="">Select...</option>
                            {VIBES.map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={qLabelStyle}>Cover / Price</label>
                          <input style={qInputStyle} value={queueForm.cover} onChange={e => updateQueueForm('cover', e.target.value)} placeholder="Free, $10, etc." />
                        </div>
                        <div>
                          <label style={qLabelStyle}>Ticket Link</label>
                          <input style={qInputStyle} value={queueForm.ticket_link} onChange={e => updateQueueForm('ticket_link', e.target.value)} placeholder="https://..." />
                        </div>
                      </div>
                    </div>

                    {/* ── Action buttons ──────────────────────────────────────── */}
                    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={handleQueueApprove}
                          disabled={queueActionLoading}
                          style={{
                            flex: 2, padding: '14px', borderRadius: '10px', border: 'none',
                            background: queueActionLoading ? qTextMuted : qGreen, color: '#000',
                            fontWeight: 700, fontSize: '15px', cursor: queueActionLoading ? 'default' : 'pointer',
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          {queueActionLoading ? 'Processing...' : '✓ Approve & Publish'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={handleQueueReject}
                          disabled={queueActionLoading}
                          style={{
                            flex: 1, padding: '12px', borderRadius: '10px',
                            border: `1px solid ${qRed}33`, background: `${qRed}11`,
                            color: qRed, fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          ✕ Reject &amp; Delete
                        </button>
                        <button
                          onClick={handleQueueArchive}
                          disabled={queueActionLoading}
                          style={{
                            flex: 1, padding: '12px', borderRadius: '10px',
                            border: `1px solid ${qBorder}`, background: 'transparent',
                            color: qTextMuted, fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          📝 Save as Draft
                        </button>
                      </div>
                    </div>
                    <p style={{ fontSize: '11px', color: qTextMuted, textAlign: 'center', marginTop: '16px' }}>
                      Review the source material on the left, edit fields as needed, then approve or reject.
                    </p>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: qTextMuted }}>
                    No submissions to review
                  </div>
                )}
              </div>
              </>)}
            </div>
          )}
        </div>
  );
}