'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteAccount } from '@/app/actions';
import { createClient } from '@/lib/supabase/client';

/**
 * Account deletion, behind a typed confirmation.
 *
 * Collapsed by default and styled as a destructive action rather than sitting
 * in the ordinary button stack — this is the one control here that cannot be
 * undone, and it should not be adjacent to "Sign out" in a way that invites a
 * misclick.
 *
 * The typed word is re-checked on the server; this copy is only so the user
 * sees what they are agreeing to.
 */
export function DeleteAccountButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await deleteAccount(confirmation);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // The account is gone, but this browser still holds its session cookies.
      // Clearing them locally avoids a confusing bounce through a signed-in
      // state that no longer resolves to a user.
      await createClient().auth.signOut();
      router.push('/login');
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        className="muted"
        style={{ fontSize: 12, textDecoration: 'underline', marginTop: 24 }}
        onClick={() => setOpen(true)}
      >
        Delete my account
      </button>
    );
  }

  return (
    <section
      style={{
        marginTop: 24,
        padding: 14,
        border: '1px solid var(--accent)',
        borderRadius: 8,
      }}
    >
      <div className="section-label" style={{ margin: '0 0 6px' }}>Delete account</div>

      <p className="muted" style={{ margin: '0 0 10px', lineHeight: 1.6, fontSize: 12 }}>
        This removes your profile, the shows you&rsquo;re going to, your private notes,
        your friendships, and any connected mailbox &mdash; permanently, with no
        undo. Stub&rsquo;s access to your Google account is revoked at the same time.
      </p>
      <p className="muted" style={{ margin: '0 0 12px', lineHeight: 1.6, fontSize: 12 }}>
        Artists, venues and events stay &mdash; those are shared listings, not your
        data, and other people&rsquo;s timelines depend on them.
      </p>

      <label className="stack" style={{ gap: 4 }}>
        <span className="muted">Type DELETE to confirm</span>
        <input
          className="input"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="DELETE"
        />
      </label>

      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}

      <div className="spread" style={{ marginTop: 12, gap: 8 }}>
        <button
          className="btn"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setConfirmation('');
            setError(null);
          }}
        >
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={pending || confirmation.trim().toUpperCase() !== 'DELETE'}
          onClick={submit}
        >
          {pending ? 'Deleting…' : 'Delete permanently'}
        </button>
      </div>
    </section>
  );
}
