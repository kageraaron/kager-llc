'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Google only: the same sign-in as Stub, through the suite's one Supabase. */
export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next =
    typeof window !== 'undefined'
      ? (() => {
          const raw = new URLSearchParams(window.location.search).get('next');
          return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
        })()
      : '/';

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="empty">
        <h2>Refund</h2>
        <p>Money back when prices drop after you buy. Sign in with the Google account you use for Stub.</p>
        <div className="actions">
          <button className="btn btn-primary btn-block" disabled={busy} onClick={signIn}>
            {busy ? 'Opening Google…' : 'Sign in with Google'}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </main>
  );
}
