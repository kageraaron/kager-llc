/**
 * Date formatting for event times.
 *
 * Events are rendered in the VENUE's timezone, not the viewer's: a show at 8pm
 * in Brooklyn should read "8:00 PM" to someone looking at it from California.
 * That is why `events.timezone` is stored alongside `starts_at`.
 *
 * When that column is null the fallback matters more than it looks. These
 * helpers pass no `timeZone` option at all in that case, so `toLocaleString`
 * uses the RUNTIME's zone — and every page here is server-rendered, on Vercel,
 * in UTC. A 10pm San Francisco show stored correctly as `2026-09-28T05:00:00Z`
 * then renders as "Mon, Sep 28 · 5:00 AM". Use `eventZone` rather than reading
 * `event.timezone` directly, so a missing zone falls back to the venue's.
 */

import { inferTimezone } from '@/lib/timezone';

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

/**
 * The event's own zone, or the best stand-in for it.
 *
 * `events.timezone` first, then whatever another provider stored on the venue
 * row, then the venue's region. Null only when we know nothing at all about
 * where the show is — at which point the caller renders in the runtime zone and
 * there is genuinely nothing better to do.
 */
export function eventZone(event: {
  timezone?: string | null;
  venue?: { timezone?: string | null; region?: string | null; country?: string | null } | null;
}): string | null {
  return (
    event.timezone ??
    event.venue?.timezone ??
    inferTimezone(event.venue?.region, event.venue?.country)
  );
}

/**
 * The name to put on a card or a page heading.
 *
 * The headliner when there is one, because a provider's event TITLE is often a
 * whole bill ("Silva Bumpa and Dean Turnley") where the artist row is the thing
 * the user recognises. `||` rather than `??` on purpose: an artist row can carry
 * an empty name, and falling through to the event name is better than blank.
 */
export function displayEventName(event: {
  name: string;
  headliner?: { name: string | null } | null;
}): string {
  return event.headliner?.name || event.name;
}

/**
 * Monogram for the placeholder thumbnail, used when neither the event nor the
 * artist has an image. "Silva Bumpa" -> "SB", "Overmono" -> "OV".
 *
 * Everything after a co-billing separator is dropped first, so a two-act bill
 * gives the headliner's initials rather than one letter from each act.
 */
export function initials(name: string): string {
  const parts = name
    .replace(/\s+(?:and|&|\+|x|b2b|vs\.?)\s+.*$/i, '')
    .split(/[\s,]+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${[...parts[0]][0]}${[...parts[1]][0]}`.toUpperCase();
}

/** "4 tickets" / "1 ticket", or null when we never learned the count. */
export function formatQuantity(quantity?: number | null): string | null {
  if (quantity === null || quantity === undefined || quantity < 1) return null;
  return `${quantity} ticket${quantity === 1 ? '' : 's'}`;
}

/**
 * Which site an event URL actually points at.
 *
 * The event page hard-coded "Open on Ticketmaster", but `events.url` is written
 * by whichever provider won the match — so a Bandsintown-sourced show offered a
 * Ticketmaster button that opened bandsintown.com. Five providers write this
 * column; only one of them is Ticketmaster.
 *
 * Falls back to the bare hostname rather than a guess, so an unrecognised
 * vendor still gets an honest label.
 */
const VENDOR_HOSTS: [RegExp, string][] = [
  [/(^|\.)ticketmaster\./i, 'Ticketmaster'],
  [/(^|\.)livenation\./i, 'Live Nation'],
  [/(^|\.)eventbrite\./i, 'Eventbrite'],
  [/(^|\.)bandsintown\.com$/i, 'Bandsintown'],
  [/(^|\.)spotify\.com$/i, 'Spotify'],
  [/(^|\.)jambase\.com$/i, 'JamBase'],
  [/(^|\.)dice\.fm$/i, 'DICE'],
  [/(^|\.)axs\.com$/i, 'AXS'],
  [/(^|\.)seetickets\./i, 'See Tickets'],
  [/(^|\.)setlist\.fm$/i, 'setlist.fm'],
];

export function ticketVendorName(url?: string | null): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const [pattern, name] of VENDOR_HOSTS) {
    if (pattern.test(host)) return name;
  }
  return host.replace(/^www\./, '');
}
