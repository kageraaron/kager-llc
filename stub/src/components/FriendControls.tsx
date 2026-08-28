'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendFriendRequest, respondToFriendRequest } from '@/app/actions';

export function AddFriend() {
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    startTransition(async () => {
      const res = await sendFriendRequest(handle);
      if (res.ok) {
        setSent(true);
        setHandle('');
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} style={{ marginBottom: 8 }}>
      <div className="row">
        <input
          className="input"
          placeholder="Add by handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
        />
        <button className="btn btn-primary" type="submit" disabled={pending || handle.trim().length < 3}>
          Add
        </button>
      </div>
      {error && <p className="error" style={{ marginTop: 8 }}>{error}</p>}
      {sent && <p className="muted" style={{ marginTop: 8 }}>Request sent.</p>}
    </form>
  );
}

export function FriendRequestRow({
  profile,
}: {
  profile: { id: string; handle: string; display_name: string; avatar_url: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function respond(accept: boolean) {
    startTransition(async () => {
      await respondToFriendRequest(profile.id, accept);
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ alignItems: 'center' }}>
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="avatar" src={profile.avatar_url} alt="" />
      ) : (
        <div className="avatar" />
      )}
      <div className="body">
        <div className="title">{profile.display_name || profile.handle}</div>
        <div className="meta">@{profile.handle}</div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn" disabled={pending} onClick={() => respond(false)}>Ignore</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => respond(true)}>Accept</button>
      </div>
    </div>
  );
}
