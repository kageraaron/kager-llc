import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared read queries. All of these run through the request-scoped client, so
 * RLS decides what comes back - notably, friends' attendances appear only when
 * the friendship is accepted AND the row is marked visibility='friends'.
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
  id, tm_id, name, starts_at, timezone, image_url, url, status,
  venue:venues ( id, name, city, region ),
  headliner:artists!events_headliner_id_fkey ( id, name, image_url )
`;

export interface EventRow {
  id: string;
  tm_id: string | null;
  name: string;
  starts_at: string;
  timezone: string | null;
  image_url: string | null;
  url: string | null;
  status: string;
  venue: { id: string; name: string; city: string | null; region: string | null } | null;
  headliner: { id: string; name: string; image_url: string | null } | null;
}

export interface AttendanceWithEvent {
  id: string;
  state: string;
  visibility: string;
  source: string;
  ticket_ref: string | null;
  seat_info: string | null;
  price_cents: number | null;
  /** 1-5, or null if unrated. Shared with friends, unlike `notes`. */
  rating: number | null;
  review: string | null;
  event: EventRow;
}

/** Columns selected for every attendance row. */
const ATTENDANCE_SELECT =
  'id, state, visibility, source, ticket_ref, seat_info, price_cents, rating, review';

/** Shows the signed-in user is going to, soonest first. */
export async function getUpcoming(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from('attendances')
    .select(`${ATTENDANCE_SELECT}, event:events!inner ( ${EVENT_SELECT} )`)
    .eq('user_id', userId)
    .in('state', ['going', 'interested'])
    .gte('events.starts_at', new Date().toISOString());

  if (error) throw error;
  return byEventDate((data ?? []) as unknown as AttendanceWithEvent[], 'asc');
}

/** Past shows. Anything whose start time has passed, newest first. */
export async function getArchive(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from('attendances')
    .select(`${ATTENDANCE_SELECT}, event:events!inner ( ${EVENT_SELECT} )`)
    .eq('user_id', userId)
    .lt('events.starts_at', new Date().toISOString());

  if (error) throw error;
  return byEventDate((data ?? []) as unknown as AttendanceWithEvent[], 'desc');
}

/**
 * Which friends are going to which upcoming events.
 * RLS does the access control; this just shapes the result by event.
 */
export async function getFriendsPlans(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from('attendances')
    .select(`
      id, user_id, state,
      profile:profiles!inner ( id, handle, display_name, avatar_url ),
      event:events!inner ( ${EVENT_SELECT} )
    `)
    .neq('user_id', userId)
    .eq('visibility', 'friends')
    .in('state', ['going', 'interested'])
    .gte('events.starts_at', new Date().toISOString());

  if (error) throw error;

  type Row = {
    id: string;
    user_id: string;
    state: string;
    profile: { id: string; handle: string; display_name: string; avatar_url: string | null };
    event: EventRow;
  };

  const byEvent = new Map<string, { event: EventRow; friends: Row['profile'][] }>();
  for (const row of byEventDate((data ?? []) as unknown as Row[], 'asc')) {
    const entry = byEvent.get(row.event.id) ?? { event: row.event, friends: [] };
    entry.friends.push(row.profile);
    byEvent.set(row.event.id, entry);
  }
  return [...byEvent.values()];
}

/** Friends attending one specific event. Powers the event detail page. */
export async function getFriendsAtEvent(db: SupabaseClient, eventId: string, userId: string) {
  const { data, error } = await db
    .from('attendances')
    .select('id, state, rating, review, profile:profiles!inner ( id, handle, display_name, avatar_url )')
    .eq('event_id', eventId)
    .eq('visibility', 'friends')
    .neq('user_id', userId)
    // 'went' included so friends' ratings show up on past shows.
    .in('state', ['going', 'interested', 'went']);

  if (error) throw error;
  return (data ?? []) as unknown as {
    id: string;
    state: string;
    rating: number | null;
    review: string | null;
    profile: { id: string; handle: string; display_name: string; avatar_url: string | null };
  }[];
}

export async function getEvent(db: SupabaseClient, eventId: string) {
  const { data, error } = await db.from('events').select(EVENT_SELECT).eq('id', eventId).maybeSingle();
  if (error) throw error;
  return data as unknown as EventRow | null;
}

export async function getMyAttendance(db: SupabaseClient, eventId: string, userId: string) {
  const { data } = await db
    .from('attendances')
    .select(ATTENDANCE_SELECT)
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

export async function getNote(db: SupabaseClient, eventId: string, userId: string) {
  const { data } = await db
    .from('notes')
    .select('id, body, updated_at')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

/** Count of unreviewed ingest candidates, for the Inbox tab badge. */
export async function getPendingCount(db: SupabaseClient, userId: string): Promise<number> {
  const { count } = await db
    .from('ingest_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('state', 'pending');
  return count ?? 0;
}
