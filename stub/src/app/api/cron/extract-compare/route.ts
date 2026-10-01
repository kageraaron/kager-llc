import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto';
import { buildTicketQuery, getMessage, listMessageIds, parseGmailMessage, refreshAccessToken } from '@/lib/providers/gmail';
import { normalizeEmail } from '@/lib/ingest/normalize';
import { runExtractors } from '@/lib/ingest/extractors';
import { eligible } from '@/lib/ingest/extractors/loose';
import { readTicket } from '@/lib/ingest/extractors/read';
import { llmConfigured, llmExtract } from '@/lib/ingest/llm';
import { htmlToText, senderDomain } from '@/lib/ingest/html';
import { isTicketSender } from '@/lib/retention';

export const dynamic = 'force-dynamic';
export const maxDuration = 3000;

/**
 * The experiment, on real mail: read each message with the layout parsers
 * alone and with the second pass (`readTicket`), and report what the second
 * pass changes: reads it repairs, reads it drops, and mail it reads that no
 * parser did.
 *
 *   GET /api/cron/extract-compare?days=400            both readers
 *   GET /api/cron/extract-compare?days=400&llm=10     also ask the model about
 *                                                     up to 10 that neither read
 *
 * READS ONLY. Nothing is written: no message row, no candidate, no event. What
 * comes back is counts, plus one line per message where the two disagree or
 * only one of them found a ticket, and only for mail from ticket sellers or
 * mail one of the readers took for a ticket. A message neither reader touched
 * is counted and never described.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get('days')) || 400, 1), 3650);
  const max = Math.min(Number(request.nextUrl.searchParams.get('max')) || 800, 1500);
  let llmLeft = Math.min(Number(request.nextUrl.searchParams.get('llm')) || 0, 120);

  const admin = createAdminClient();
  const { data: accounts } = await admin
    .from('email_accounts')
    .select('id, refresh_token')
    .eq('provider', 'gmail')
    .eq('status', 'active');

  const mask = (s: string) => s.replace(/\d{5,}/g, '#').slice(0, 90);
  const say = (t?: { artistName?: string; eventName?: string; venueName?: string; startsAt?: string; alternates?: string[] } | null) =>
    t ? `${t.artistName ?? t.eventName ?? '?'}${t.alternates?.length ? ` (or ${t.alternates.join(' / ')})` : ''} | ${t.venueName ?? '-'} | ${t.startsAt ?? '-'}` : null;

  const totals = { read: 0, parserRead: 0, unchanged: 0, repaired: 0, dropped: 0, fallbackCards: 0, unreadTicketLike: 0, llmAsked: 0, llmRead: 0, errors: 0 };
  const rows: Record<string, unknown>[] = [];

  for (const account of accounts ?? []) {
    if (!account.refresh_token) continue;
    const { access_token } = await refreshAccessToken(decryptToken(account.refresh_token));
    const ids = await listMessageIds(access_token, buildTicketQuery(days), max);

    for (const id of ids) {
      try {
        const email = normalizeEmail(parseGmailMessage(await getMessage(access_token, id)));
        totals.read++;
        const parser = runExtractors(email);
        const final = readTicket(email);
        const body = `${email.html ? htmlToText(email.html) : ''}\n${email.text}`;
        const ticketLike = eligible(email, body);
        if (!parser && !final && !ticketLike) continue;

        const row: Record<string, unknown> = {
          date: email.receivedAt.slice(0, 10),
          from: senderDomain(email.from),
          subject: isTicketSender(email.from) || parser || final ? mask(email.subject) : '(not a ticket seller)',
          parser: parser ? `[${parser.extractor}] ${say(parser.ticket)}` : null,
          final: final ? `[${final.extractor}] ${say(final.ticket)}` : null,
        };

        if (parser) {
          totals.parserRead++;
          if (!final) {
            totals.dropped++;
            row.kind = 'dropped by second pass';
          } else if (final.extractor !== parser.extractor) {
            totals.repaired++;
            row.kind = 'repaired by second pass';
          } else {
            totals.unchanged++;
            continue;
          }
        } else if (final) {
          totals.fallbackCards++;
          row.kind = 'loose fallback (review card)';
        } else {
          totals.unreadTicketLike++;
          row.kind = 'nobody read it';
          if (llmLeft > 0 && llmConfigured()) {
            llmLeft--;
            totals.llmAsked++;
            const read = await llmExtract(email);
            if (read) totals.llmRead++;
            row.llm = say(read) ?? '(not a ticket, or unreadable)';
          }
        }
        rows.push(row);
      } catch (err) {
        totals.errors++;
        console.error('extract-compare: message failed', err instanceof Error ? err.message.slice(0, 160) : err);
      }
    }
  }

  return NextResponse.json({ days, totals, rows });
}
