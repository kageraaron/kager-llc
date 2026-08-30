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
  venue:venues ( id, name, city, region, country, timezone ),
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
  visibility: string;
  source: string;
  ticket_ref: string | null;
  seat_info: string | null;
  price_cents: number | null;
  ticket_quantity: number | null;
  /** 1-5, or null if unrated. Shared with friends, unlike `notes`. */
  rating: number | null;
  review: string | null;
  event: EventRow;
}

/** Columns selected for every attendance row. */
const ATTENDANCE_SELECT =
  'id, state, visibility, source, ticket_ref, seat_info, price_cents, ticket_quantity, rating, review';

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

export interface FriendAtEvent {
  id: string;
  state: string;
  rating: number | null;
  review: string | null;
  profile: { id: string; handle: string; display_name: string; avatar_url: string | null };
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
  return (data ?? []) as unknown as FriendAtEvent[];
}

/**
 * The same thing for a whole list of events, in one round trip.
 *
 * `/upcoming` used to call `getFriendsAtEvent` once per event to build its
 * avatar stacks. That is a query per row: fine at a dozen shows, and quietly
 * quadratic-feeling on a page that also has to wait for all of them. One
 * `.in()` and a group-by in JS gets the same result in a single request.
 *
 * Returns a Map so callers can look up by event id without re-scanning.
 */
export async function getFriendsAtEvents(
  db: SupabaseClient,
  eventIds: string[],
  userId: string,
): Promise<Map<string, FriendAtEvent[]>> {
  const byEvent = new Map<string, FriendAtEvent[]>();
  if (eventIds.length === 0) return byEvent;

  const { data, error } = await db
    .from('attendances')
    .select(
      'id, event_id, state, rating, review, profile:profiles!inner ( id, handle, display_name, avatar_url )',
    )
    .in('event_id', eventIds)
    .eq('visibility', 'friends')
    .neq('user_id', userId)
    .in('state', ['going', 'interested', 'went']);

  if (error) throw error;

  for (const row of (data ?? []) as unknown as (FriendAtEvent & { event_id: string })[]) {
    const list = byEvent.get(row.event_id);
    if (list) list.push(row);
    else byEvent.set(row.event_id, [row]);
  }
  return byEvent;
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

export interface FriendProfile {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
}

/**
 * The signed-in user's accepted friends, as profiles.
 *
 * The friendships table stores an unordered pair, so "who am I friends with"
 * needs the sides resolved before it can be joined to profiles. Two queries
 * rather than an embed: PostgREST cannot follow a relationship whose direction
 * depends on the row's own values.
 */
export async function getFriends(db: SupabaseClient, userId: string): Promise<FriendProfile[]> {
  const { data: rows, error } = await db
    .from('friendships')
    .select('user_low, user_high')
    .eq('status', 'accepted')
    .or(`user_low.eq.${userId},user_high.eq.${userId}`);

  if (error) throw error;

  const ids = (rows ?? []).map((r) => (r.user_low === userId ? r.user_high : r.user_low));
  if (ids.length === 0) return [];

  const { data: profiles } = await db
    .from('profiles')
    .select('id, handle, display_name, avatar_url')
    .in('id', ids);

  return (profiles ?? []) as FriendProfile[];
}

export interface EventInvite {
  id: string;
  event_id: string;
  message: string;
  state: string;
  created_at: string;
  from: FriendProfile;
  event: EventRow;
}

/** Shows friends have sent the user and which they have not answered yet. */
export async function getPendingEventInvites(
  db: SupabaseClient,
  userId: string,
): Promise<EventInvite[]> {
  const { data, error } = await db
    .from('event_invites')
    .select(`
      id, event_id, message, state, created_at,
      from:profiles!event_invites_from_user_id_fkey ( id, handle, display_name, avatar_url ),
      event:events!inner ( ${EVENT_SELECT} )
    `)
    .eq('to_user_id', userId)
    .eq('state', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as EventInvite[];
}

/** Friend ids this user has already sent a given event to. */
export async function getSentEventInvites(
  db: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<string[]> {
  const { data } = await db
    .from('event_invites')
    .select('to_user_id')
    .eq('event_id', eventId)
    .eq('from_user_id', userId);

  return (data ?? []).map((r) => r.to_user_id as string);
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

/**
 * Everything waiting in the Inbox, for the tab badge: unreviewed ticket
 * candidates plus shows friends have sent over. Both land on the same page, so
 * counting only one of them would leave the badge disagreeing with it.
 */
export async function getPendingCount(db: SupabaseClient, userId: string): Promise<number> {
  const [candidates, invites] = await Promise.all([
    db
      .from('ingest_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('state', 'pending'),
    db
      .from('event_invites')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', userId)
      .eq('state', 'pending'),
  ]);

  return (candidates.count ?? 0) + (invites.count ?? 0);
}
