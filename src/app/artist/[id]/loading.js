/**
 * loading.js — Next.js streaming fallback for /artist/[id]
 *
 * Renders a branded skeleton while the server component fetches artist data.
 * Prevents the "Artist Not Found" screen from flashing before data resolves.
 */
export default function ArtistLoading() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0D0D12',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
    }}>
      {/* Top bar skeleton */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: '#1E1E2C', borderBottom: '1px solid #2A2A3A',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }}>
          <span style={{ color: '#FFFFFF' }}>my</span>
          <span style={{ color: '#E8722A' }}>Local</span>
          <span style={{ color: '#3AADA0' }}>Jam</span>
        </span>
        <div style={{
          width: '120px', height: '36px', borderRadius: '999px',
          background: '#2A2A3A',
        }} />
      </header>

      {/* Content skeleton */}
      <main style={{
        flex: 1, width: '100%', maxWidth: '560px',
        margin: '0 auto', padding: '20px 16px 120px',
      }}>
        {/* Artist image skeleton */}
        <div style={{
          width: '200px', height: '200px', borderRadius: '12px',
          background: '#1E1E2C', marginBottom: '20px',
        }} />

        {/* Name skeleton */}
        <div style={{ width: '60%', height: '32px', borderRadius: '8px', background: '#1E1E2C', marginBottom: '12px' }} />

        {/* Genre pills skeleton */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          <div style={{ width: '100px', height: '24px', borderRadius: '999px', background: '#1E1E2C' }} />
          <div style={{ width: '80px', height: '24px', borderRadius: '999px', background: '#1E1E2C' }} />
          <div style={{ width: '90px', height: '24px', borderRadius: '999px', background: '#1E1E2C' }} />
        </div>

        {/* Bio skeleton */}
        <div style={{ width: '100%', height: '14px', borderRadius: '4px', background: '#1E1E2C', marginBottom: '8px' }} />
        <div style={{ width: '90%', height: '14px', borderRadius: '4px', background: '#1E1E2C', marginBottom: '8px' }} />
        <div style={{ width: '75%', height: '14px', borderRadius: '4px', background: '#1E1E2C', marginBottom: '24px' }} />

        {/* Upcoming shows skeleton */}
        <div style={{ width: '45%', height: '24px', borderRadius: '6px', background: '#1E1E2C', marginBottom: '16px' }} />
        <div style={{ width: '100%', height: '72px', borderRadius: '12px', background: '#1E1E2C', marginBottom: '10px' }} />
        <div style={{ width: '100%', height: '72px', borderRadius: '12px', background: '#1E1E2C' }} />
      </main>
    </div>
  );
}
