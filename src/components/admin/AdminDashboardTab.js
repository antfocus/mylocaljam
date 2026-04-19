'use client';

export default function AdminDashboardTab({
  events, artists, reports, venues, scraperHealth,
  eventsTotal, newEvents24h,
  dashDateRange, setDashDateRange, analyticsData, analyticsLoading,
  analyticsEnv, setAnalyticsEnv, fetchAnalytics,
  fetchEvents, fetchArtists, fetchScraperHealth, fetchReports,
  eventsSortField, eventsSortOrder, eventsStatusFilter, setEventsStatusFilter,
  setActiveTab, setVenuesFilter, setEventsRecentlyAdded,
  setEvents, setFlagsViewFilter, setEventsMissingTime, setEventsMissingImage,
  setArtistMissingFilters,
}) {
        // Compute Data Health metrics from existing state
        // Full image waterfall check: custom_image_url → event_image_url →
        // template.image_url → legacy image_url → artist.image_url
        const eventsWithoutImage = events.filter(e =>
          !e.custom_image_url && !e.event_image_url &&
          !e.event_templates?.image_url &&
          !e.image_url && !e.artists?.image_url
        ).length;
        const eventsMissingTimeCount = events.filter(e => e.is_time_tbd).length;
        const artistsWithoutBio = artists.filter(a => !a.bio).length;
        const pendingFlags = reports.filter(r => r.status === 'pending').length;
        const totalEvents = eventsTotal || events.length;
        const totalArtists = artists.length;

        const dateLabels = { today: 'Today', '7d': 'Last 7 Days', '30d': 'This Month', all: 'All Time' };

        const MetricCard = ({ label, value, sub, color, onClick }) => (
          <div
            onClick={onClick}
            style={{
              padding: '20px', borderRadius: '12px',
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', gap: '4px',
              cursor: onClick ? 'pointer' : 'default',
              transition: 'border-color 0.15s',
              ...(onClick ? { ':hover': { borderColor: '#E8722A' } } : {}),
            }}
            onMouseEnter={onClick ? (e) => { e.currentTarget.style.borderColor = '#E8722A'; } : undefined}
            onMouseLeave={onClick ? (e) => { e.currentTarget.style.borderColor = 'var(--border)'; } : undefined}
          >
            <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>
              {label}
            </span>
            <span style={{ fontSize: '28px', fontWeight: 800, color: color || 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.1 }}>
              {value}
            </span>
            {sub && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'DM Sans', sans-serif" }}>{sub}</span>}
          </div>
        );

        const SectionHeader = ({ title }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', marginTop: '24px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-secondary)', fontFamily: "'DM Sans', sans-serif" }}>
              {title}
            </span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>
        );

  return (
        <div>
          {/* Header + Date Filter + Env Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 className="font-display font-bold text-lg" style={{ fontFamily: "'DM Sans', sans-serif", margin: 0 }}>Dashboard</h2>
              {/* Environment switcher */}
              <div style={{ display: 'flex', gap: '0', background: 'var(--card-bg)', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                {[
                  { key: 'production', label: 'Prod' },
                  { key: 'dev', label: 'Dev' },
                ].map(env => (
                  <button
                    key={env.key}
                    onClick={() => { setAnalyticsEnv(env.key); fetchAnalytics(dashDateRange, env.key); }}
                    style={{
                      padding: '3px 10px', fontSize: '11px', fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                      background: analyticsEnv === env.key ? (env.key === 'production' ? '#22c55e22' : '#3B82F622') : 'transparent',
                      border: 'none',
                      color: analyticsEnv === env.key ? (env.key === 'production' ? '#22c55e' : '#3B82F6') : 'var(--text-muted)',
                    }}
                  >
                    {env.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'today', label: 'Today' },
                { key: '7d', label: '7 Days' },
                { key: '30d', label: 'Month' },
                { key: 'all', label: 'All Time' },
              ].map(seg => (
                <button
                  key={seg.key}
                  onClick={() => { setDashDateRange(seg.key); fetchAnalytics(seg.key); }}
                  style={{
                    padding: '6px 12px', fontSize: '12px', fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                    background: 'none', border: 'none',
                    color: dashDateRange === seg.key ? '#F0F0F5' : 'var(--text-muted)',
                    borderBottom: dashDateRange === seg.key ? '2px solid #E8722A' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {seg.label}
                </button>
              ))}
            </div>
          </div>

          {analyticsData?.error && (
            <div style={{ padding: '8px 12px', marginBottom: '12px', borderRadius: '8px', background: '#EF444422', color: '#F87171', fontSize: '12px', fontFamily: "'DM Sans', sans-serif" }}>
              ⚠ PostHog: {analyticsData.error}
            </div>
          )}

          {/* Fan Engagement */}
          <SectionHeader title="Fan Engagement" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            <MetricCard
              label="Total Unique Visitors"
              value={analyticsLoading ? '…' : (analyticsData?.uniqueVisitors ?? 0).toLocaleString()}
              sub={dateLabels[dashDateRange]}
              color={analyticsData?.uniqueVisitors > 0 ? '#3B82F6' : undefined}
            />
            <MetricCard
              label="Mobile Web"
              value={analyticsLoading ? '…' : (analyticsData?.mobile ?? 0).toLocaleString()}
              sub={analyticsData?.uniqueVisitors > 0 ? `${Math.round(((analyticsData?.mobile || 0) / analyticsData.uniqueVisitors) * 100)}% of visitors` : dateLabels[dashDateRange]}
            />
            <MetricCard
              label="Desktop Web"
              value={analyticsLoading ? '…' : (analyticsData?.desktop ?? 0).toLocaleString()}
              sub={analyticsData?.uniqueVisitors > 0 ? `${Math.round(((analyticsData?.desktop || 0) / analyticsData.uniqueVisitors) * 100)}% of visitors` : dateLabels[dashDateRange]}
            />
            <MetricCard
              label="Events Bookmarked"
              value={analyticsLoading ? '…' : (analyticsData?.bookmarks ?? 0).toLocaleString()}
              sub={dateLabels[dashDateRange]}
              color={analyticsData?.bookmarks > 0 ? '#A855F7' : undefined}
            />
          </div>

          {/* Venue Value */}
          <SectionHeader title="Venue Value (Outbound)" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            <MetricCard
              label="Venue Link Clicks"
              value={analyticsLoading ? '…' : (analyticsData?.venueClicks ?? 0).toLocaleString()}
              sub={dateLabels[dashDateRange]}
              color={analyticsData?.venueClicks > 0 ? '#E8722A' : undefined}
            />
            <MetricCard
              label="Top Venue"
              value={analyticsLoading ? '…' : (analyticsData?.topVenue || '—')}
              sub={analyticsData?.topVenueClicks > 0 ? `${analyticsData.topVenueClicks} clicks` : dateLabels[dashDateRange]}
              color={analyticsData?.topVenueClicks > 0 ? '#E8722A' : undefined}
            />
          </div>

          {/* Health & Inventory */}
          <SectionHeader title="Health & Inventory" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            {(() => {
              const ok = scraperHealth.filter(s => s.status === 'success').length;
              const fail = scraperHealth.filter(s => s.status === 'fail').length;
              const warn = scraperHealth.filter(s => s.status === 'warning').length;
              const total = scraperHealth.length;
              return (<>
                <MetricCard
                  label="Successful Syncs"
                  value={ok}
                  sub={`of ${total} scrapers${warn > 0 ? ` · ${warn} warning` : ''}`}
                  color="#22c55e"
                  onClick={() => {
                    setActiveTab('venues');
                    setVenuesFilter('success');
                    fetchScraperHealth();
                  }}
                />
                <MetricCard
                  label="Failing Scrapers"
                  value={fail}
                  sub={fail === 0 ? 'All scrapers healthy' : 'Click to view →'}
                  color={fail > 0 ? '#ef4444' : '#22c55e'}
                  onClick={fail > 0 ? () => {
                    setActiveTab('venues');
                    setVenuesFilter('fail');
                    fetchScraperHealth();
                  } : undefined}
                />
              </>);
            })()}
            <MetricCard
              label="New Events (24h)"
              value={newEvents24h}
              sub={newEvents24h === 0 ? 'No new additions' : 'Click to view →'}
              color={newEvents24h > 0 ? '#3B82F6' : 'var(--text-muted)'}
              onClick={newEvents24h > 0 ? () => {
                setEventsRecentlyAdded(true);
                setEventsMissingTime(false);
                setEventsMissingImage(false);
                setEventsStatusFilter('');
                setEvents([]);
                setActiveTab('events');
                fetchEvents(1, 'created_at', 'desc', '', false, true);
              } : undefined}
            />
            <MetricCard
              label="Total Events"
              value={totalEvents.toLocaleString()}
              sub="Published upcoming"
              color="#22c55e"
            />
            <MetricCard
              label="Total Artists"
              value={totalArtists.toLocaleString()}
              sub="In database"
              color="#22c55e"
            />
          </div>

          {/* Action Items / Triage */}
          <SectionHeader title="Action Items" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            <MetricCard
              label="Pending User Flags"
              value={pendingFlags}
              sub={pendingFlags === 0 ? 'Inbox zero' : 'Click to view →'}
              color={pendingFlags > 0 ? '#ef4444' : '#22c55e'}
              onClick={pendingFlags > 0 ? () => {
                setActiveTab('reports');
                setFlagsViewFilter('pending');
                fetchReports();
              } : undefined}
            />
            <MetricCard
              label="Events Missing Times"
              value={eventsMissingTimeCount}
              sub={eventsMissingTimeCount === 0 ? 'All events have times' : 'Click to view →'}
              color={eventsMissingTimeCount > 0 ? '#EAB308' : '#22c55e'}
              onClick={eventsMissingTimeCount > 0 ? () => {
                setActiveTab('events');
                setEventsMissingTime(true);
                setEventsMissingImage(false);
                setEventsRecentlyAdded(false);
                setEvents([]);
                fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter, true, false, false);
              } : undefined}
            />
            <MetricCard
              label="Events Missing Images"
              value={eventsWithoutImage}
              sub={eventsWithoutImage === 0 ? 'All clear' : 'Click to view →'}
              color={eventsWithoutImage > 0 ? '#EAB308' : '#22c55e'}
              onClick={eventsWithoutImage > 0 ? () => {
                setActiveTab('events');
                setEventsMissingImage(true);
                setEventsMissingTime(false);
                setEventsRecentlyAdded(false);
                setEvents([]);
                fetchEvents(1, eventsSortField, eventsSortOrder, eventsStatusFilter, false, false, true);
              } : undefined}
            />
            <MetricCard
              label="Artists Missing Bios"
              value={artistsWithoutBio}
              sub={artistsWithoutBio === 0 ? 'All clear' : 'Click to view →'}
              color={artistsWithoutBio > 0 ? '#EAB308' : '#22c55e'}
              onClick={artistsWithoutBio > 0 ? () => {
                setActiveTab('artists');
                setArtistMissingFilters({ bio: true, image_url: false, genres: false, vibes: false });
                fetchArtists('', false);
              } : undefined}
            />
          </div>
        </div>
        
  );
}