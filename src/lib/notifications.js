/**
 * notifications.js — event reminder scheduling
 *
 * Uses the browser Notifications API + setTimeout.
 * Reminders are persisted in localStorage so they survive page refreshes.
 * When the app loads, pending reminders are re-scheduled automatically.
 *
 * Future: swap setTimeout for a real push server (Supabase Edge Functions)
 * so reminders fire even when the browser is closed.
 */

const STORAGE_KEY = 'mlj_reminders';
const REMIND_BEFORE_MS = 60 * 60 * 1000; // 1 hour before event

// ── Permission ────────────────────────────────────────────────────────────────
export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationsGranted() {
  return notificationsSupported() && Notification.permission === 'granted';
}

// ── Storage helpers ───────────────────────────────────────────────────────────
function loadReminders() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function saveReminders(reminders) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders)); } catch {}
}

// In-memory map of active timeouts: eventId → timeoutId
const activeTimeouts = {};

// ── Schedule a reminder for one event ────────────────────────────────────────
export function scheduleReminder(event) {
  if (!notificationsGranted()) return;
  if (!event?.id || !event?.date) return;

  const timeStr = event.start_time || '20:00';
  const eventDateTime = new Date(`${event.date}T${timeStr}`);
  if (isNaN(eventDateTime)) return;

  const reminderAt = new Date(eventDateTime.getTime() - REMIND_BEFORE_MS);
  const delay = reminderAt.getTime() - Date.now();

  // Don't schedule if reminder time has already passed
  if (delay <= 0) return;

  // Persist to localStorage
  const reminders = loadReminders();
  reminders[event.id] = {
    id:          event.id,
    name:        event.name || event.artist_name || 'Event',
    venue:       event.venue || event.venue_name || '',
    date:        event.date,
    start_time:  timeStr,
    reminderAt:  reminderAt.toISOString(),
  };
  saveReminders(reminders);

  // Clear any existing timeout for this event
  if (activeTimeouts[event.id]) clearTimeout(activeTimeouts[event.id]);

  activeTimeouts[event.id] = setTimeout(() => {
    fireNotification(reminders[event.id]);
    // Clean up storage after firing
    const updated = loadReminders();
    delete updated[event.id];
    saveReminders(updated);
    delete activeTimeouts[event.id];
  }, delay);
}

// ── Cancel a reminder ─────────────────────────────────────────────────────────
export function cancelReminder(eventId) {
  if (!eventId) return;
  if (activeTimeouts[eventId]) {
    clearTimeout(activeTimeouts[eventId]);
    delete activeTimeouts[eventId];
  }
  const reminders = loadReminders();
  delete reminders[eventId];
  saveReminders(reminders);
}

// ── Fire the actual notification ──────────────────────────────────────────────
function fireNotification(reminder) {
  if (!notificationsGranted()) return;
  try {
    const timeLabel = formatTime12(reminder.start_time);
    new Notification(`🎵 Starting in 1 hour: ${reminder.name}`, {
      body:    reminder.venue ? `${timeLabel} at ${reminder.venue}` : timeLabel,
      icon:    '/myLocaljam_Logo_v4.png',
      badge:   '/myLocaljam_Logo_v4.png',
      tag:     `mlj-event-${reminder.id}`,
    });
  } catch (e) {
    console.warn('Notification failed:', e);
  }
}

function formatTime12(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const period = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 || 12;
  const mins = m ? `:${String(m).padStart(2, '0')}` : '';
  return `${h12}${mins}${period}`;
}

// ── Re-schedule all pending reminders (call on app load) ─────────────────────
export function rehydrateReminders() {
  if (!notificationsGranted()) return;
  const reminders = loadReminders();
  const now = Date.now();
  const stale = [];

  for (const [id, reminder] of Object.entries(reminders)) {
    const reminderAt = new Date(reminder.reminderAt).getTime();
    const delay = reminderAt - now;
    if (delay <= 0) {
      stale.push(id);
      continue;
    }
    if (activeTimeouts[id]) clearTimeout(activeTimeouts[id]);
    activeTimeouts[id] = setTimeout(() => {
      fireNotification(reminder);
      const updated = loadReminders();
      delete updated[id];
      saveReminders(updated);
      delete activeTimeouts[id];
    }, delay);
  }

  // Clean up stale reminders
  if (stale.length) {
    const cleaned = loadReminders();
    stale.forEach(id => delete cleaned[id]);
    saveReminders(cleaned);
  }
}
