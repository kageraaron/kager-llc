import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as fixtures from './fixtures/emails';
import { normalizeEmail } from '@/lib/ingest/normalize';
import { runExtractors } from '@/lib/ingest/extractors';
import { looseExtract } from '@/lib/ingest/extractors/loose';
import { similarity } from '@/lib/ingest/match';
import type { RawEmailInput } from '@/lib/ingest/normalize';

/**
 * The experiment: could one loose reader replace the vendor parsers?
 *
 * Every fixture email is read twice, by the existing extractors (the reference:
 * each of those results is pinned by its own test) and by the loose reader,
 * which knows no vendor. The report at the end is the answer; the assertions
 * only hold the line on the two things that must not regress:
 *
 *   - it never invents a ticket from mail the reference rejects on purpose
 *     (marketing, a football game, a sold listing, a retail order);
 *   - when it does read a date, it is the event's date, not the order's.
 *
 * Name and venue are scored, not asserted. The catalog match is what decides
 * those in production, so "close" is useful and "exact" is not required.
 */

const day = (iso?: string) => iso?.slice(0, 10);
const close = (a?: string, b?: string) => !!a && !!b && similarity(a, b) >= 0.6;

const rows = Object.entries(fixtures as unknown as Record<string, RawEmailInput>).map(([name, raw]) => {
  const email = normalizeEmail(raw);
  const ref = runExtractors(email);
  const loose = looseExtract(email);
  const refName = ref?.ticket.artistName ?? ref?.ticket.eventName;
  const looseNames = loose ? [loose.artistName, loose.eventName, ...loose.alternates].filter(Boolean) : [];
  return {
    name,
    by: ref?.extractor ?? '-',
    ref: !!ref,
    loose: !!loose,
    date: !!ref && !!loose && day(ref.ticket.startsAt) === day(loose.startsAt),
    time: !!ref && !!loose && ref.ticket.startsAt === loose.startsAt,
    title: !!ref && !!loose && looseNames.some((n) => close(n, refName)),
    first: !!ref && !!loose && close(loose.artistName ?? loose.eventName, refName),
    venue: !!ref && !!loose && (!ref.ticket.venueName || close(loose.venueName, ref.ticket.venueName)),
    looseSays: loose ? `${loose.artistName ?? '?'}${loose.alternates.length ? ` (or ${loose.alternates.join(' / ')})` : ''} | ${loose.venueName ?? '-'} | ${loose.startsAt}` : '',
    refSays: ref ? `${refName ?? '?'} | ${ref.ticket.venueName ?? '-'} | ${ref.ticket.startsAt}` : '',
  };
});

describe('loose reader vs vendor parsers', () => {
  it('prints the comparison', () => {
    // Structured markup is read first whatever happens to the rest, so the
    // loose reader is scored against the layout parsers it might replace.
    const tickets = rows.filter((r) => r.ref && r.by !== 'jsonld');
    const pct = (n: number, d: number) => `${n}/${d} (${d ? Math.round((100 * n) / d) : 0}%)`;
    const report = [
      '',
      `Reference reads a ticket in ${tickets.length} of ${rows.length} fixtures.`,
      `  loose also reads one:          ${pct(tickets.filter((r) => r.loose).length, tickets.length)}`,
      `  same calendar date:            ${pct(tickets.filter((r) => r.date).length, tickets.length)}`,
      `  same date and time:            ${pct(tickets.filter((r) => r.time).length, tickets.length)}`,
      `  act is its first guess:        ${pct(tickets.filter((r) => r.first).length, tickets.length)}`,
      `  act is among its guesses:      ${pct(tickets.filter((r) => r.title).length, tickets.length)}`,
      `  venue agrees (where known):    ${pct(tickets.filter((r) => r.venue).length, tickets.length)}`,
      `Reference rejects ${rows.length - tickets.length}; loose wrongly reads ${rows.filter((r) => !r.ref && r.loose).length} of them.`,
      '',
      ...rows
        .filter((r) => r.by !== 'jsonld')
        .filter((r) => r.ref !== r.loose || (r.ref && (!r.date || !r.time || !r.title || !r.venue)))
        .flatMap((r) => [
          `  ${r.name} [${r.by}]${r.ref && !r.loose ? ' MISSED' : ''}${!r.ref && r.loose ? ' FALSE POSITIVE' : ''}${r.ref && r.loose && !r.date ? ' date' : ''}${r.ref && r.loose && r.date && !r.time ? ' time' : ''}${r.ref && r.loose && r.title && !r.first ? ' (act not first)' : ''}${r.ref && r.loose && !r.title ? ' title' : ''}${r.ref && r.loose && !r.venue ? ' venue' : ''}`,
          `      ref:   ${r.refSays || '(none)'}`,
          `      loose: ${r.looseSays || '(none)'}`,
        ]),
      '',
    ];
    console.log(report.join('\n'));
    // `LOOSE_REPORT=path npm test` also writes it to a file.
    if (process.env.LOOSE_REPORT) writeFileSync(process.env.LOOSE_REPORT, report.join('\n'));
    expect(rows.length).toBeGreaterThan(30);
  });

  it('never reads a ticket from mail the reference rejects', () => {
    expect(rows.filter((r) => !r.ref && r.loose).map((r) => r.name)).toEqual([]);
  });

  it('when it reads a date, it is the event date', () => {
    expect(rows.filter((r) => r.ref && r.loose && !r.date).map((r) => r.name)).toEqual([]);
  });
});
