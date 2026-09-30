'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { renameHousehold } from '@/app/actions';

/** Inline rename for the household ("Home" until someone changes it). */
export function HouseholdName({ initial }: { initial: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== initial;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await renameHousehold(name);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          maxLength={80}
          value={name}
          aria-label="Household name"
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" disabled={pending || !dirty} onClick={save}>
          {pending ? 'Saving…' : 'Rename'}
        </button>
      </div>
      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
