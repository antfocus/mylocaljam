'use client';

import { Icons } from '@/components/Icons';

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '14px',
  outline: 'none',
};

export default function AdminLoginScreen({ password, setPassword, showPassword, setShowPassword, handleLogin }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <form onSubmit={handleLogin} className="w-full max-w-sm p-8 rounded-2xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-10 h-10 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--accent)', color: '#000000' }}>
            {Icons.settings}
          </div>
          <div className="font-display font-extrabold text-xl">Admin Panel</div>
        </div>
        <input type="text" name="username" autoComplete="username" defaultValue="admin" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }} tabIndex={-1} aria-hidden="true" />
        <label className="block font-display font-semibold text-[13px] text-brand-text-secondary mb-1.5">Password</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            style={{ ...inputStyle, paddingRight: '42px' }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(prev => !prev)}
            style={{
              position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            }}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
        <button type="submit" className="w-full mt-4 py-3 rounded-xl font-display font-semibold" style={{ background: 'var(--accent)', color: '#000000' }}>
          Login
        </button>
      </form>
    </div>
  );
}
