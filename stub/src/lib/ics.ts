import type { EventRow } from '@/lib/queries';

/**
 * iCalendar (RFC 5545) generation.
 *
 * Two consumers:
 *   - a single-event .ics download, for "add this to my calendar"
 *   - a subscribable feed of everything a user is going to, which Apple
 *     Calendar / Google Calendar re-poll on their own schedule
 *
 * Written by hand rather than pulled from a library: the spec surface we need
 * is small, and line folding is the only fiddly part.
 */

const PRODID = '-//Kager LLC//Stub//EN';

/** RFC 5545 escaping: backslash, semicolon, comma, newline. Order matters. */
function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Content lines must not exceed 75 octets. Continuations start with a single
 * space. We measure in UTF-8 bytes, not characters, or an artist name with an
 * accent can push a line over the limit and break strict parsers.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let start = 0;
  let limit = 75;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a multi-byte character: back off to a lead byte.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }
  return out.join('\r\n ');
}

/** UTC timestamp form: 20260418T030000Z */
function utc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface IcsEvent {
  id: string;
  title: string;
  startsAt: string;
  /** Venue timezone, used only for the human-readable location note. */
  timezone?: string | null;
  venueName?: string | null;
  city?: string | null;
  region?: string | null;
  url?: string | null;
  description?: string | null;
  /** Defaults to 3 hours, which is about right for a gig with support. */
  durationMinutes?: number;
}

export function eventToIcs(event: EventRow, opts: { note?: string } = {}): IcsEvent {
  return {
    id: event.id,
    title: event.headliner?.name ?? event.name,
    startsAt: event.starts_at,
    timezone: event.timezone,
    venueName: event.venue?.name,
    city: event.venue?.city,
    region: event.venue?.region,
    url: event.url,
    description: opts.note,
  };
}

function vevent(e: IcsEvent, now: Date): string[] {
  const start = new Date(e.startsAt);
  const end = new Date(start.getTime() + (e.durationMinutes ?? 180) * 60_000);
  const location = [e.venueName, e.city, e.region].filter(Boolean).join(', ');

  const lines = [
    'BEGIN:VEVENT',
    // Stable UID so re-importing updates the same entry instead of duplicating.
    `UID:${e.id}@stub.kager.llc`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${esc(e.title)}`,
  ];

  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (e.url) lines.push(`URL:${esc(e.url)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);

  lines.push(
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(e.title)} is tomorrow`,
    'END:VALARM',
    'END:VEVENT',
  );
  return lines;
}

export function buildIcs(events: IcsEvent[], opts: { calendarName?: string } = {}): string {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  if (opts.calendarName) {
    // X-WR-CALNAME is non-standard but is what Apple and Google actually read.
    lines.push(`X-WR-CALNAME:${esc(opts.calendarName)}`);
    lines.push(`NAME:${esc(opts.calendarName)}`);
    // Ask subscribers to re-poll every 6 hours rather than daily.
    lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT6H');
    lines.push('X-PUBLISHED-TTL:PT6H');
  }

  for (const e of events) lines.push(...vevent(e, now));
  lines.push('END:VCALENDAR');

  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Filename-safe slug for a downloaded .ics. */
export function icsFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'event'}.ics`;
}
