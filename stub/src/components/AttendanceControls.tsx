'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setAttendanceState,
  setAttendanceVisibility,
  removeAttendance,
  addExistingEvent,
} from '@/app/actions';

interface Props {
  eventId: string;
  isPast: boolean;
  attendance: { state: string; visibility: string } | null;
}

export function AttendanceControls({ eventId, isPast, attendance }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Something went wrong');
      else router.refresh();
    });
  }

  if (!attendance) {
    return (
      <div className="stack">
        <button
          className="btn btn-primary btn-block"
          disabled={pending}
          onClick={() => run(() => addExistingEvent(eventId, isPast ? 'went' : 'going'))}
        >
          {isPast ? 'Add to archive' : "I'm going"}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  // Past events get went/missed; upcoming ones get going/interested.
  const states = isPast
    ? ([['went', 'Went'], ['missed', 'Missed']] as const)
    : ([['going', 'Going'], ['interested', 'Interested']] as const);

  return (
    <div className="stack">
      <div className="row" style={{ gap: 8 }}>
        {states.map(([value, label]) => (
          <button
            key={value}
            className={`btn ${attendance.state === value ? 'btn-primary' : ''}`}
            style={{ flex: 1 }}
            disabled={pending}
            onClick={() => run(() => setAttendanceState(eventId, value))}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="spread" style={{ padding: '10px 2px' }}>
        <span>
          Visible to friends
          <span className="muted" style={{ display: 'block', fontSize: 12 }}>
            Your note stays private either way
          </span>
        </span>
        <input
          type="checkbox"
          checked={attendance.visibility === 'friends'}
          disabled={pending}
          onChange={(e) =>
            run(() => setAttendanceVisibility(eventId, e.target.checked ? 'friends' : 'private'))
          }
        />
      </label>

      <button
        className="btn btn-block"
        disabled={pending}
        onClick={() => run(() => removeAttendance(eventId))}
      >
        Remove from Stub
      </button>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
