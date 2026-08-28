/**
 * Date formatting for event times.
 *
 * Events are rendered in the VENUE's timezone, not the viewer's: a show at 8pm
 * in Brooklyn should read "8:00 PM" to someone looking at it from California.
 * That is why `events.timezone` is stored alongside `starts_at`.
 */

export function eventDateParts(iso: string, timeZone?: string | null) {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = timeZone ? { timeZone } : {};
  return {
    month: d.toLocaleDateString('en-US', { ...opts, month: 'short' }).toUpperCase(),
    day: d.toLocaleDateString('en-US', { ...opts, day: 'numeric' }),
    weekday: d.toLocaleDateString('en-US', { ...opts, weekday: 'short' }),
    year: d.toLocaleDateString('en-US', { ...opts, year: 'numeric' }),
  };
}

export function formatEventTime(iso: string, timeZone?: string | null): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = timeZone ? { timeZone } : {};
  return d.toLocaleTimeString('en-US', { ...opts, hour: 'numeric', minute: '2-digit' });
}

export function formatEventDate(iso: string, timeZone?: string | null): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = timeZone ? { timeZone } : {};
  return d.toLocaleDateString('en-US', {
    ...opts,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

/** "in 3 days" / "2 weeks ago" — used under upcoming and archived cards. */
export function relativeDay(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.round((then - Date.now()) / 86_400_000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  if (Math.abs(days) < 365) return rtf.format(Math.round(days / 30), 'month');
  return rtf.format(Math.round(days / 365), 'year');
}

export function formatPrice(cents?: number | null, currency = 'USD'): string | null {
  if (cents === null || cents === undefined) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function venueLine(venue?: {
  name?: string | null;
  city?: string | null;
  region?: string | null;
} | null): string {
  if (!venue) return '';
  return [venue.name, venue.city, venue.region].filter(Boolean).join(' · ');
}
