'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { disconnectGmail } from '@/app/actions';

interface SyncResult {
  scanned: number;
  added: number;
  review: number;
  skipped: number;
  errors: number;
}

/**
 * Rescan and disconnect for a connected Gmail account.
 *
 * The rescan matters for debugging: waiting up to 30 minutes for the cron to
 * find out whether a confirmation parses is a miserable feedback loop, and the
 * result breakdown says *why* nothing appeared — scanned-but-skipped is a
 * parser problem, scanned-zero is a query problem.
 */
export function GmailControls({ email, status }: { email: string; status: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function rescan() {
    setSyncing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/connect/gmail/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Scan failed');
      setResult(json);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setSyncing(false);
    }
  }

  function disconnect() {
    if (!confirm(`Disconnect ${email}? Stub will stop scanning it and delete the stored tokens.`)) {
      return;
    }
    startTransition(async () => {
      const res = await disconnectGmail();
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} disabled={syncing || pending} onClick={rescan}>
          {syncing ? 'Scanning…' : 'Check for new tickets'}
        </button>
        <button className="btn" disabled={syncing || pending} onClick={disconnect}>
          Disconnect
        </button>
      </div>

      {status !== 'active' && (
        <a className="btn btn-block" href="/api/connect/gmail/start">Reconnect</a>
      )}

      {result && (
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          Scanned {result.scanned} message{result.scanned === 1 ? '' : 's'} ·{' '}
          <strong>{result.added} added</strong> · {result.review} to review ·{' '}
          {result.skipped} not tickets
          {result.errors > 0 && ` · ${result.errors} errors`}
          {result.scanned === 0 && (
            <>
              <br />
              Nothing matched the search. Confirmations older than 30 days are not scanned.
            </>
          )}
          {result.scanned > 0 && result.added === 0 && result.review === 0 && (
            <>
              <br />
              Messages were found but none parsed as tickets — worth adding one as a
              test fixture.
            </>
          )}
        </p>
      )}

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
    </>
  );
}
