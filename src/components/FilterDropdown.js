'use client';

import { useState } from 'react';
import { Icons } from './Icons';

export default function FilterDropdown({ label, icon, items, selected, onToggle, onClear }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[13px] font-medium transition-all cursor-pointer whitespace-nowrap"
        style={{
          background: 'var(--bg-card)',
          borderColor: selected.length > 0 ? 'var(--accent)' : 'var(--border)',
          color: selected.length > 0 ? 'var(--accent)' : 'var(--text-primary)',
        }}
        onClick={() => setOpen(!open)}
      >
        {icon} {label} {selected.length > 0 && `(${selected.length})`}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute top-[calc(100%+4px)] left-0 z-50 min-w-[200px] max-h-[300px] overflow-y-auto rounded-xl border p-2"
            style={{
              background: 'var(--bg-elevated)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow)',
            }}
          >
            {selected.length > 0 && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-[13px] font-semibold mb-1 pb-3 border-b"
                style={{ color: 'var(--accent)', borderColor: 'var(--border)' }}
                onClick={onClear}
              >
                Clear all
              </div>
            )}
            {items.map((item) => {
              const isSelected = selected.includes(item);
              return (
                <div
                  key={item}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-[13px] transition-all"
                  style={{ color: isSelected ? 'var(--accent)' : 'var(--text-secondary)' }}
                  onClick={() => onToggle(item)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                    style={{
                      border: isSelected ? 'none' : '1.5px solid var(--text-muted)',
                      background: isSelected ? 'var(--accent)' : 'transparent',
                    }}
                  >
                    {isSelected && <span className="text-white text-[10px]">✓</span>}
                  </div>
                  {item}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
