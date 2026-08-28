'use client';

import { useState, useTransition } from 'react';
import { saveNote } from '@/app/actions';

/**
 * Private note for one event. The "only you" line is not decoration - `notes`
 * has an owner-only RLS policy with no friend path, so this is literally true.
 */
export function NoteEditor({ eventId, initial }: { eventId: string; initial: string }) {
  const [body, setBody] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = body !== initial;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveNote(eventId, body);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section style={{ marginTop: 24 }}>
      <div className="spread">
        <div className="section-label" style={{ margin: 0 }}>Private note</div>
        <span className="muted" style={{ fontSize: 11 }}>Only you can see this</span>
      </div>

      <textarea
        className="input"
        style={{ marginTop: 8 }}
        value={body}
        placeholder="Who you went with, what they opened with, how the sound was..."
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
        {error && <span className="error" style={{ marginRight: 'auto' }}>{error}</span>}
        {saved && !dirty && <span className="muted" style={{ marginRight: 'auto' }}>Saved</span>}
        <button className="btn btn-primary" onClick={save} disabled={pending || !dirty}>
          {pending ? 'Saving...' : 'Save note'}
        </button>
      </div>
    </section>
  );
}
