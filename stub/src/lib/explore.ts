import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAttractionEvents, searchAttractions } from '@/lib/providers/ticketmaster';
import { upsertEvent } from '@/lib/ingest/catalog';

/**
 * Explore's data: upcoming shows by artists the household follows or has seen.
 *
 * Reading is `explore_events()` (0028), which only looks at the local catalog.
 * The catalog fills up on its own as anyone searches or scans mail, but an
 * artist nobody has searched for would never appear, so `refreshExploreArtists`
 * asks Ticketmaster directly about every artist Explore cares about. That is
 * the "bounded Ticketmaster refresh" `cron/announce` describes: Ticketmaster
 * allows 5,000 calls a day, and each artist is re-checked only every few days.
 *
 * Ticketmaster is the only provider used here on purpose. The others that know
 * small rooms (RapidAPI's Spotify proxy, Parse's Bandsintown) are metered in
 * the hundreds per month and stay behind explicit searches.
 */

export type ExploreReason = 'follow' | 'went' | 'ticket';

export interface ExploreMatch {
  event_id: string;
  artist_id: string;
  reason: ExploreReason;
}

/** The household's Explore matches. RLS-safe: scoped by current_household_id(). */
export async function getExploreMatches(db: SupabaseClient): Promise<ExploreMatch[]> {
  const { data, error } = await db.rpc('explore_events', { horizon_days: 365 });
  if (error) throw error;
  return (data ?? []) as ExploreMatch[];
}

/** Ticketmaster allows 5 requests a second; stay under it. */
const TM_SPACING_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "Tegan & Sara" and "Tegan and Sara" are the same act; so is case. */
const nameKey = (s: string) =>
  s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

export interface RefreshResult {
  checked: number;
  matched: number;
  events: number;
  stoppedEarly?: string;
}

/**
 * Ask Ticketmaster for upcoming shows by the artists Explore cares about,
 * stalest first, and write what it finds into the catalog.
 *
 * An artist without a Ticketmaster id is looked up by exact name first. The id
 * is saved onto OUR artist row before any event is written, because
 * `upsertEvent` keys artists on `tm_id`: without it, the first event would
 * create a second row for the same act.
 */
export async function refreshExploreArtists(
  admin: SupabaseClient,
  opts: { maxArtists: number; staleDays: number },
): Promise<RefreshResult> {
  const { data, error } = await admin.rpc('explore_artists');
  if (error) throw error;

  const cutoff = Date.now() - opts.staleDays * 86_400_000;
  const due = ((data ?? []) as { artist_id: string; name: string; tm_id: string | null; tm_checked_at: string | null }[])
    .filter((a) => !a.tm_checked_at || new Date(a.tm_checked_at).getTime() < cutoff)
    .sort((a, b) => (a.tm_checked_at ?? '').localeCompare(b.tm_checked_at ?? ''))
    .slice(0, opts.maxArtists);

  const result: RefreshResult = { checked: 0, matched: 0, events: 0 };

  for (const artist of due) {
    try {
      let attractionId = artist.tm_id;

      if (!attractionId) {
        const found = (await searchAttractions(artist.name, 10)).find(
          (a) => nameKey(a.name) === nameKey(artist.name),
        );
        await sleep(TM_SPACING_MS);

        if (found) {
          attractionId = found.id;
          // Claim the id unless another row already holds it (a leftover
          // duplicate); then that row's events are the ones we fetch.
          const { data: holder } = await admin
            .from('artists')
            .select('id')
            .eq('tm_id', found.id)
            .maybeSingle();
          if (!holder) {
            await admin.from('artists').update({ tm_id: found.id }).eq('id', artist.artist_id);
          }
        }
      }

      if (attractionId) {
        result.matched++;
        const events = await getAttractionEvents(attractionId, 50);
        await sleep(TM_SPACING_MS);
        for (const ev of events) {
          if (await upsertEvent(admin, ev)) result.events++;
        }
      }

      await admin
        .from('artists')
        .update({ tm_checked_at: new Date().toISOString() })
        .eq('id', artist.artist_id);
      result.checked++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Rate limited or out of quota: stop here, the rest stay due for next run.
      if (/Ticketmaster (429|401|403)/.test(message)) {
        result.stoppedEarly = message.slice(0, 200);
        break;
      }
      console.error('explore refresh failed for artist', { artist: artist.name, message });
    }
  }

  return result;
}
