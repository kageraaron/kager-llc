'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SetlistImport() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/import/setlistfm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Import failed');
      setResult(json);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ flexDirection: 'column', gap: 8 }}>
      <div className="spread">
        <strong>setlist.fm</strong>
        <span className="pill">Archive</span>
      </div>
      <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
        Import every show you have marked as attended. This is the best source for
        concerts from before you started using Stub.
      </p>

      <div className="row">
        <input
          className="input"
          placeholder="setlist.fm username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button className="btn btn-primary" disabled={busy || username.trim().length < 2} onClick={run}>
          {busy ? 'Importing...' : 'Import'}
        </button>
      </div>

      {result && (
        <p className="muted" style={{ margin: 0 }}>
          Imported {result.imported} of {result.total} shows
          {result.skipped > 0 && ` · ${result.skipped} could not be matched`}.
        </p>
      )}
      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
