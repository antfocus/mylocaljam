'use client';

import { useEffect } from 'react';
import { Icons } from './Icons';

export default function Toast({ message, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!message) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2.5 px-6 py-3 rounded-xl border text-sm font-medium"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--accent)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        animation: 'slideUp 0.3s ease',
      }}
    >
      <span style={{ color: 'var(--accent)' }}>{Icons.check}</span>
      {message}
    </div>
  );
}
