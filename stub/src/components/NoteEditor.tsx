'use client';

import { useState, useTransition } from 'react';
import { saveNote } from '@/app/actions';

/**
 * The household's note for one event. There is one per show per household
 * (`0025_household.sql`), so both people read and edit the same text; saving
 * overwrites whatever the other last wrote.
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
        <div className="section-label" style={{ margin: 0 }}>Note</div>
        <span className="muted" style={{ fontSize: 11 }}>Shared with your household</span>
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
