import type { SFMFullSetlist } from '@/lib/providers/setlistfm';
import { countSongs } from '@/lib/providers/setlistfm';

/**
 * The songs actually played at a past show, from setlist.fm.
 *
 * Rendered only for events that have happened. Covers and tape tracks are
 * annotated because that detail is the whole reason to look a setlist up.
 */
export function Setlist({ setlist }: { setlist: SFMFullSetlist }) {
  const sets = setlist.sets?.set ?? [];
  const total = countSongs(setlist);
  if (total === 0) return null;

  let n = 0;

  return (
    <section style={{ marginTop: 24 }}>
      <div className="spread">
        <div className="section-label" style={{ margin: 0 }}>Setlist</div>
        <span className="muted" style={{ fontSize: 11 }}>
          {total} song{total === 1 ? '' : 's'} · setlist.fm
        </span>
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '12px 14px',
          marginTop: 8,
        }}
      >
        {sets.map((set, si) => (
          <div key={si} style={{ marginTop: si > 0 ? 14 : 0 }}>
            {(set.encore || set.name) && (
              <div
                className="muted"
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {set.encore ? `Encore${set.encore > 1 ? ` ${set.encore}` : ''}` : set.name}
              </div>
            )}

            <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {(set.song ?? []).map((song, i) => {
                n++;
                return (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '4px 0',
                      fontSize: 14,
                      lineHeight: 1.4,
                    }}
                  >
                    <span
                      className="muted"
                      style={{ minWidth: 20, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {n}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      {song.name || <span className="muted">(unknown)</span>}
                      {song.cover && (
                        <span className="muted" style={{ fontSize: 12 }}>
                          {' '}· {song.cover.name} cover
                        </span>
                      )}
                      {song.with && (
                        <span className="muted" style={{ fontSize: 12 }}>
                          {' '}· with {song.with.name}
                        </span>
                      )}
                      {song.tape && (
                        <span className="muted" style={{ fontSize: 12 }}> · tape</span>
                      )}
                      {song.info && (
                        <span className="muted" style={{ fontSize: 12, display: 'block' }}>
                          {song.info}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}

        {setlist.url && (
          <a
            className="muted"
            style={{ fontSize: 11, display: 'block', marginTop: 12, textDecoration: 'underline' }}
            href={setlist.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            View on setlist.fm
          </a>
        )}
      </div>
    </section>
  );
}
