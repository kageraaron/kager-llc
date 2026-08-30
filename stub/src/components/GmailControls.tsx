'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { disconnectGmail } from '@/app/actions';

interface PageResult {
  days: number;
  nextPageToken: string | null;
  done: boolean;
  scanned: number;
  added: number;
  review: number;
  skipped: number;
  errors: number;
}

interface Totals {
  days: number;
  pages: number;
  scanned: number;
  added: number;
  review: number;
  skipped: number;
  errors: number;
  done: boolean;
}

/**
 * Lookback windows offered for a scan.
 *
 * The default 30 days is what the nightly cron uses. Anything longer is a
 * BACKFILL, and is deliberately a separate, explicit action: it walks pages of
 * old mail, and every confirmation that parses walks the provider cascade,
 * which spends metered quota.
 */
const WINDOWS = [
  { days: 30, label: 'Last 30 days' },
  { days: 365, label: 'Last year' },
  { days: 730, label: 'Last 2 years' },
  { days: 1825, label: 'Last 5 years' },
  { days: 3650, label: 'Last 10 years' },
];

/**
 * Ceiling on pages per click, so a runaway scan cannot loop forever against
 * Gmail. At 25 messages a page this is 5,000 messages, comfortably more than a
 * decade of ticket mail — and the button restarts where it left off if it ever
 * does get there.
 */
const MAX_PAGES = 200;

export function GmailControls({ email, status }: { email: string; status: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [pending, startTransition] = useTransition();
  const cancelled = useRef(false);

  async function scan(window: number) {
    setSyncing(true);
    setError(null);
    cancelled.current = false;

    const running: Totals = {
      days: window,
      pages: 0,
      scanned: 0,
      added: 0,
      review: 0,
      skipped: 0,
      errors: 0,
      done: false,
    };
    setTotals({ ...running });

    let pageToken: string | null = null;

    try {
      // One request per page. Progress is shown as it accumulates, because a
      // ten-year scan is not a thing to stare at a spinner through.
      do {
        const res = await fetch('/api/connect/gmail/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: window, pageToken }),
        });
        const json: PageResult & { error?: string } = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Scan failed');

        running.pages += 1;
        running.scanned += json.scanned;
        running.added += json.added;
        running.review += json.review;
        running.skipped += json.skipped;
        running.errors += json.errors;
        running.done = json.done;
        setTotals({ ...running });

        pageToken = json.nextPageToken;
      } while (pageToken && !cancelled.current && running.pages < MAX_PAGES);

      if (cancelled.current) running.done = false;
      setTotals({ ...running });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setSyncing(false);
    }
  }

  function disconnect() {
    if (!confirm('Disconnect Gmail? Stub will stop scanning for tickets.')) return;
    startTransition(async () => {
      await disconnectGmail();
      router.refresh();
    });
  }

  const busy = syncing || pending;
  const windowLabel = WINDOWS.find((w) => w.days === totals?.days)?.label.toLowerCase();

  return (
    <>
      <div className="row" style={{ gap: 8 }}>
        <select
          className="input"
          style={{ flex: 1 }}
          value={days}
          disabled={busy}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {WINDOWS.map((w) => (
            <option key={w.days} value={w.days}>{w.label}</option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={busy} onClick={() => scan(days)}>
          {syncing ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      {syncing && (
        <button className="btn btn-block" onClick={() => { cancelled.current = true; }}>
          Stop
        </button>
      )}

      {!syncing && (
        <p className="muted" style={{ margin: 0, lineHeight: 1.5, fontSize: 13 }}>
          Scanning again is safe. Stub re-reads mail it filed before its
          extractors improved, and never re-asks about anything you have already
          added or dismissed.
        </p>
      )}

      {days > 30 && !syncing && (
        <p className="muted" style={{ margin: 0, lineHeight: 1.5, fontSize: 13 }}>
          A long scan reads years of mail a page at a time and can take a few minutes.
          Confirmations for shows that have already happened will land in the Inbox to
          review rather than being added automatically — ticket sites only list shows
          that are still on sale.
        </p>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={disconnect}>
          Disconnect {email}
        </button>
      </div>

      {status === 'needs_reauth' && (
        <a className="btn btn-block" href="/api/connect/gmail/start">Reconnect</a>
      )}

      {totals && (
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          {syncing ? 'Scanned so far:' : 'Scanned'} {totals.scanned} message
          {totals.scanned === 1 ? '' : 's'}
          {windowLabel ? ` from the ${windowLabel}` : ''} ·{' '}
          <strong>{totals.added} added</strong> · {totals.review} to review ·{' '}
          {totals.skipped} not tickets
          {totals.errors > 0 && ` · ${totals.errors} errors`}
          {!syncing && !totals.done && totals.scanned > 0 && (
            <>
              <br />
              Stopped before the end of the window — scan again to pick up the rest.
            </>
          )}
          {!syncing && totals.scanned === 0 && (
            <>
              <br />
              Nothing matched the search in that window.
            </>
          )}
          {!syncing && totals.scanned > 0 && totals.added === 0 && totals.review === 0 && (
            <>
              <br />
              Everything found was already recorded, or was not a ticket confirmation.
            </>
          )}
        </p>
      )}

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
    </>
  );
}
