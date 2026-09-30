import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared read queries. All of these run through the request-scoped client, so
 * RLS decides what comes back: rows belonging to the caller's household (see
 * `0025_household.sql`). The explicit `household_id` filters say the same thing
 * again on purpose, so a query never depends on a policy it cannot see.
 */

/**
 * NOTE ON ORDERING: PostgREST's `.order(col, { referencedTable })` sorts rows
 * WITHIN an embedded resource, not the top-level rows. Because each attendance
 * embeds exactly one event, using it to sort a list of attendances by event date
 * is a silent no-op - rows come back in arbitrary order. So every query that
 * needs date order sorts in JS after the fetch. At a personal calendar's scale
 * that costs nothing, and it removes a dependency on subtle PostgREST semantics.
 */
function byEventDate<T extends { event: { starts_at: string } }>(rows: T[], dir: 'asc' | 'desc'): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort(
    (a, b) => sign * (new Date(a.event.starts_at).getTime() - new Date(b.event.starts_at).getTime()),
  );
}

/** Columns every event card needs. Kept in one place so the shapes stay aligned. */
const EVENT_SELECT = `
  id, tm_id, name, starts_at, timezone, time_known, image_url, url, status,
  venue:venues ( id, name, city, region, country, timezone ),
  headliner:artists!events_headliner_id_fkey ( id, name, image_url )
`;

export interface EventRow {
  id: string;
  tm_id: string | null;
  name: string;
  starts_at: string;
  timezone: string | null;
  /**
   * False when only the DATE is known — `starts_at` then carries 20:00 venue-
   * local as a placeholder. Anything that renders or exports a clock time has
   * to check this, or it prints a time the user never gave us. See 0024.
   */
  time_known: boolean;
  image_url: string | null;
  url: string | null;
  status: string;
  venue: {
    id: string;
    name: string;
    city: string | null;
    region: string | null;
    country: string | null;
    /** Fallback render zone when the event row has none — see `format.eventZone`. */
    timezone: string | null;
  } | null;
  headliner: { id: string; name: string; image_url: string | null } | null;
}

export interface AttendanceWithEvent {
  id: string;
  state: string;
  source: string;
  ticket_ref: string | null;
  seat_info: string | null;
  price_cents: number | null;
  ticket_quantity: number | null;
  /** 1-5, or null if unrated. One rating per show for the whole household. */
  rating: number | null;
  review: string | null;
  event: EventRow;
}

/** Columns selected for every attendance row. */
const ATTENDANCE_SELECT =
  'id, state, source, ticket_ref, seat_info, price_cents, ticket_quantity, rating, review';

/** Shows the household is going to, soonest first. */
export async function getUpcoming(db: SupabaseClient, householdId: string) {
  const { data, error } = await db
    .from('attendances')
    .select(`${ATTENDANCE_SELECT}, event:events!inner ( ${EVENT_SELECT} )`)
    .eq('household_id', householdId)
    .in('state', ['going', 'interested'])
    .gte('events.starts_at', new Date().toISOString());

  if (error) throw error;
  return byEventDate((data ?? []) as unknown as AttendanceWithEvent[], 'asc');
}

/** Past shows. Anything whose start time has passed, newest first. */
export async function getArchive(db: SupabaseClient, householdId: string) {
  const { data, error } = await db
    .from('attendances')
    .select(`${ATTENDANCE_SELECT}, event:events!inner ( ${EVENT_SELECT} )`)
    .eq('household_id', householdId)
    .lt('events.starts_at', new Date().toISOString());

  if (error) throw error;
  return byEventDate((data ?? []) as unknown as AttendanceWithEvent[], 'desc');
}

export async function getEvent(db: SupabaseClient, eventId: string) {
  const { data, error } = await db.from('events').select(EVENT_SELECT).eq('id', eventId).maybeSingle();
  if (error) throw error;
  return data as unknown as EventRow | null;
}

/** The household's row for one show, if the show is on its list. */
export async function getAttendance(db: SupabaseClient, eventId: string, householdId: string) {
  const { data } = await db
    .from('attendances')
    .select(ATTENDANCE_SELECT)
    .eq('event_id', eventId)
    .eq('household_id', householdId)
    .maybeSingle();
  return data;
}

/** The household's shared note on a show. */
export async function getNote(db: SupabaseClient, eventId: string, householdId: string) {
  const { data } = await db
    .from('notes')
    .select('id, body, updated_at')
    .eq('event_id', eventId)
    .eq('household_id', householdId)
    .maybeSingle();
  return data;
}

/**
 * Which of these events already have a setlist cached.
 *
 * Reads `event_setlists` only — **no setlist.fm calls**. That distinction is the
 * whole design: setlist.fm is the strictest limit we deal with (it answers 403
 * rather than 429 when throttled), so fetching one per Archive row would be
 * both slow and a good way to get blocked. The event page fetches on demand and
 * caches; this just surfaces what that has already found.
 *
 * The consequence, stated plainly: a show whose setlist exists but has never
 * been opened shows no badge until someone opens it once.
 */
export async function getSetlistFlags(
  db: SupabaseClient,
  eventIds: string[],
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();

  const { data } = await db
    .from('event_setlists')
    .select('event_id')
    .in('event_id', eventIds)
    .eq('found', true)
    // A row with no songs is a setlist.fm stub, not a setlist. Badging it puts
    // a promise on the card that the event page cannot keep.
    .gt('song_count', 0);

  return new Set((data ?? []).map((r) => r.event_id as string));
}

/** Unreviewed ticket candidates in the household's shared Inbox, for the tab badge. */
export async function getPendingCount(db: SupabaseClient, householdId: string): Promise<number> {
  const { count } = await db
    .from('ingest_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('state', 'pending');

  return count ?? 0;
}
