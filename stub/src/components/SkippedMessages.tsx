import { formatEventDate } from '@/lib/format';

export interface SkippedMessage {
  id: string;
  subject: string | null;
  from_addr: string | null;
  received_at: string | null;
  status: string;
  error: string | null;
}

/**
 * Messages the Gmail query pulled in that produced no ticket.
 *
 * These are the interesting failures. A confirmation that no extractor
 * recognised is recorded as `ingest_messages.status = 'ignored'` and then
 * vanishes — the review queue only ever showed candidates that *did* parse, so
 * the one case worth debugging was the one case invisible from the UI.
 *
 * The intended workflow is: see a real confirmation listed here, scrub it into
 * `test/fixtures/emails.ts`, and fix the extractor against it. That is the only
 * way coverage improves, and it needs the subject and sender to be legible.
 */
export function SkippedMessages({ messages }: { messages: SkippedMessage[] }) {
  if (messages.length === 0) return null;

  return (
    <details style={{ marginTop: 24 }}>
      <summary
        className="section-label"
        style={{ cursor: 'pointer', listStyle: 'revert', marginBottom: 0 }}
      >
        Scanned, nothing found ({messages.length})
      </summary>

      <p className="muted" style={{ margin: '10px 0 12px' }}>
        Stub read these but couldn’t find a ticket in them. Most will be
        newsletters or marketing. If a real confirmation is in this list, that’s
        a parser gap worth reporting.
      </p>

      {messages.map((m) => (
        <div key={m.id} className="card">
          <div className="body">
            <div className="title">{m.subject || '(no subject)'}</div>
            <div className="meta">{m.from_addr || 'unknown sender'}</div>
            <div className="meta">
              {m.received_at ? formatEventDate(m.received_at) : 'no date'}
              {' · '}
              {m.status === 'error' ? 'Error while reading' : 'No ticket recognised'}
            </div>
            {/* Surfaced rather than swallowed: an error here is usually a
                provider outage mid-match, which is worth distinguishing from
                "this was never a ticket email". */}
            {m.error && (
              <div className="error" style={{ marginTop: 4 }}>
                {m.error}
              </div>
            )}
          </div>
        </div>
      ))}
    </details>
  );
}
