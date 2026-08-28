'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Google is the primary sign-in, with a magic link as fallback.
 *
 * Spotify is NOT offered here on purpose: since Feb 2026 a development-mode
 * Spotify app is capped at five authorized users, so using it for auth would
 * cap the entire app at five people. It is a per-user connection instead,
 * offered from Settings. Apple sign-in needs a paid Apple Developer membership
 * and is intentionally not wired up yet.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password sign-in exists only so the seeded test accounts are reachable:
  // a magic link to demo@stub.local would go nowhere. Off unless explicitly
  // enabled, so production keeps external sign-in only.
  const passwordLogin = process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === 'true';

  const supabase = createClient();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
    else window.location.href = '/upcoming';
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.04em' }}>Stub</div>
          <p className="muted" style={{ marginTop: 6 }}>
            Every show you&rsquo;re going to, and every show you went to.
          </p>
        </div>

        <div className="stack">
          <button className="btn btn-primary btn-block" onClick={signInWithGoogle} disabled={busy}>
            Continue with Google
          </button>

          <div className="row" style={{ margin: '6px 0' }}>
            <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--border)' }} />
            <span className="muted" style={{ fontSize: 12 }}>or</span>
            <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--border)' }} />
          </div>

          {sent ? (
            <p className="muted" style={{ textAlign: 'center' }}>
              Check <strong>{email}</strong> for your sign-in link.
            </p>
          ) : (
            <form onSubmit={passwordLogin ? signInWithPassword : sendMagicLink} className="stack">
              <input
                className="input"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              {passwordLogin && (
                <input
                  className="input"
                  type="password"
                  required
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              )}
              <button
                className="btn btn-block"
                type="submit"
                disabled={busy || !email || (passwordLogin && !password)}
              >
                {passwordLogin ? 'Sign in' : 'Email me a link'}
              </button>
            </form>
          )}

          {passwordLogin && (
            <p className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
              Test accounts: <code>demo@stub.local</code> / <code>stubdemo123</code>
            </p>
          )}

          {error && <p className="error">{error}</p>}
        </div>

        <p className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 28, lineHeight: 1.5 }}>
          Connecting Gmail is optional and happens later, from Settings.
          Stub reads only ticket confirmations and never stores the emails themselves.
        </p>
      </div>
    </main>
  );
}
