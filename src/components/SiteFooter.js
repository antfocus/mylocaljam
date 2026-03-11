'use client';

export default function SiteFooter({ dark, onToggleTheme }) {
  return (
    <footer style={{
      background: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border)',
      padding: '40px 24px 24px',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '24px',
      }}>
        {/* Left: Brand */}
        <div>
          <span
            className="logo-text font-heading"
            style={{ fontSize: '22px', display: 'block', marginBottom: '8px' }}
          >
            myLocalJam
          </span>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '280px', lineHeight: 1.5 }}>
            Your go-to for discovering local live music, events, and community happenings.
          </p>
        </div>

        {/* Center: Links */}
        <nav style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
        }}>
          {['About', 'Contact', 'Add to the Jar', 'Privacy', 'Terms'].map(link => (
            <a key={link} href="#" className="footer-link" style={{ fontWeight: 500 }}>
              {link}
            </a>
          ))}
        </nav>

        {/* Right: Theme toggle + socials */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}>
          {/* Theme toggle */}
          <button
            onClick={onToggleTheme}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              transition: 'transform 0.3s ease, background 0.3s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'rotate(30deg)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'rotate(0deg)'}
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Copyright */}
      <div style={{
        maxWidth: '1200px',
        margin: '24px auto 0',
        paddingTop: '16px',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
        fontSize: '13px',
        color: 'var(--text-muted)',
      }}>
        © 2026 MyLocalJam. All rights reserved.
      </div>
    </footer>
  );
}
