'use client';

import { useState } from 'react';
import { isSameDay, getVenueColor } from '@/lib/utils';
import { Icons } from './Icons';

export default function CalendarView({ events, selectedDate, onSelectDate }) {
  const [viewMonth, setViewMonth] = useState(new Date());

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const today = new Date();

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    const d = daysInPrev - firstDay + i + 1;
    cells.push({ day: d, date: new Date(year, month - 1, d), otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: new Date(year, month, d), otherMonth: false });
  }
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, date: new Date(year, month + 1, d), otherMonth: true });
    }
  }

  const eventsByDate = {};
  events.forEach((ev) => {
    const key = new Date(ev.event_date).toDateString();
    if (!eventsByDate[key]) eventsByDate[key] = [];
    eventsByDate[key].push(ev);
  });

  return (
    <div>
      {/* Nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          className="p-2 rounded-lg transition-colors hover:bg-white/5"
          onClick={() => setViewMonth(new Date(year, month - 1))}
        >
          {Icons.chevLeft}
        </button>
        <span className="font-display font-bold text-xl">
          {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button
          className="p-2 rounded-lg transition-colors hover:bg-white/5"
          onClick={() => setViewMonth(new Date(year, month + 1))}
        >
          {Icons.chevRight}
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-0.5 mb-6">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center py-2 font-display font-semibold text-xs text-brand-text-muted uppercase tracking-widest">
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          const key = cell.date.toDateString();
          const dayEvents = eventsByDate[key] || [];
          const isToday_ = isSameDay(cell.date, today);
          const isSelected = selectedDate && isSameDay(cell.date, selectedDate);
          return (
            <div
              key={i}
              className={`relative aspect-square sm:aspect-square max-sm:min-h-[48px] p-1.5 rounded-lg cursor-pointer transition-all border ${
                cell.otherMonth ? 'opacity-30' : ''
              } ${isToday_ ? 'border-brand-accent' : 'border-transparent'} ${
                isSelected ? 'border-brand-accent' : ''
              }`}
              style={{
                background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-secondary)',
              }}
              onClick={() => onSelectDate(cell.date)}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-card)'; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
            >
              <div className="font-display font-semibold text-[13px] text-brand-text mb-0.5">{cell.day}</div>
              <div className="flex gap-[3px] flex-wrap">
                {dayEvents.slice(0, 5).map((ev, j) => (
                  <div
                    key={j}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: ev.venue_color || getVenueColor(ev.venue_name || ev.venues?.name) }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
