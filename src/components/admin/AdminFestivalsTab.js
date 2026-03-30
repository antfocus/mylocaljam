'use client';

export default function AdminFestivalsTab({
  events, submissions, password,
}) {
  const headers = { Authorization: 'Bearer ' + password };
        const filteredFestivals = festivalSearch.trim()
          ? festivalData.filter(f => f.name.toLowerCase().includes(festivalSearch.toLowerCase()))
          : festivalData;
  return (
          <div>
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="font-display font-bold text-lg">Festivals & Event Titles ({festivalData.length})</h2>
              <input
                placeholder="Search festivals..."
                value={festivalSearch}
                onChange={e => setFestivalSearch(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', width: '220px' }}
              />
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              Festival names come from the <code style={{ background: 'var(--bg-card)', padding: '1px 4px', borderRadius: '3px' }}>event_title</code> field on events. Renaming updates all linked events. Deleting clears the event_title (events themselves are preserved).
            </p>
            {filteredFestivals.length === 0 && <p className="text-center py-8 text-brand-text-muted">{festivalSearch ? 'No matching festivals.' : 'No festivals found.'}</p>}
            <div className="space-y-2">
              {filteredFestivals.map(f => (
                <div key={f.name} className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingFestival?.name === f.name ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editingFestival.newName}
                            onChange={e => setEditingFestival(prev => ({ ...prev, newName: e.target.value }))}
                            className="px-2 py-1 rounded-lg text-sm flex-1"
                            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                          />
                          <button
                            className="px-3 py-1 rounded-lg text-xs font-semibold"
                            style={{ background: '#E8722A', color: '#1C1917' }}
                            onClick={async () => {
                              const newName = editingFestival.newName.trim();
                              if (!newName || newName === f.name) { setEditingFestival(null); return; }
                              try {
                                const res = await fetch('/api/admin', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
                                  body: JSON.stringify({ bulk_rename_festival: true, old_name: f.name, new_name: newName }),
                                });
                                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                setEditingFestival(null);
                                fetchFestivalNames();
                              } catch (err) { alert(`Rename failed: ${err.message}`); }
                            }}
                          >Save</button>
                          <button
                            className="px-3 py-1 rounded-lg text-xs font-semibold"
                            style={{ color: 'var(--text-muted)' }}
                            onClick={() => setEditingFestival(null)}
                          >Cancel</button>
                        </div>
                      ) : (
                        <>
                          <span className="font-display font-bold text-[15px]" style={{ color: 'var(--text-primary)' }}>{f.name}</span>
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
                            {f.count} event{f.count !== 1 ? 's' : ''}
                          </span>
                        </>
                      )}
                    </div>
                    {editingFestival?.name !== f.name && (
                      <div className="flex items-center gap-2">
                        <button
                          className="px-2 py-1 rounded-lg text-xs font-medium"
                          style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                          onClick={() => setEditingFestival({ name: f.name, newName: f.name })}
                          title="Rename this festival across all events"
                        >Rename</button>
                        <button
                          className="px-2 py-1 rounded-lg text-xs font-medium"
                          style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444' }}
                          onClick={async () => {
                            if (!window.confirm(`Remove festival name "${f.name}" from ${f.count} event(s)? The events will remain but lose their festival tag.`)) return;
                            try {
                              const res = await fetch('/api/admin', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${password}` },
                                body: JSON.stringify({ bulk_clear_festival: true, festival_name: f.name }),
                              });
                              if (!res.ok) throw new Error(`HTTP ${res.status}`);
                              fetchFestivalNames();
                            } catch (err) { alert(`Delete failed: ${err.message}`); }
                          }}
                          title="Remove festival name from all events (events stay)"
                        >Delete</button>
                      </div>
                    )}
                  </div>
                  {/* Show linked events */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {f.events.slice(0, 5).map(ev => (
                      <span key={ev.id} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                        {ev.artist_name} {ev.event_date ? `· ${new Date(ev.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}` : ''}
                      </span>
                    ))}
                    {f.events.length > 5 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>+{f.events.length - 5} more</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        
  );
}