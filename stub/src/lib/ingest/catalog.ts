import type { SupabaseClient } from '@supabase/supabase-js';
import { pickImage, type TMEvent, type TMAttraction, type TMVenue } from '@/lib/providers/ticketmaster';

/**
 * Writes into the shared catalog tables (artists / venues / events).
 *
 * These are global rows, not per-user, so every function here takes a
 * service-role client - RLS grants authenticated users read-only access.
 * Everything upserts on the provider id so repeated syncs are idempotent.
 */

export async function upsertArtist(
  db: SupabaseClient,
  attraction: TMAttraction,
): Promise<string | null> {
  const genres = [
    ...new Set(
      (attraction.classifications ?? [])
        .flatMap((c) => [c.genre?.name, c.subGenre?.name])
        .filter((g): g is string => !!g && g !== 'Undefined'),
    ),
  ];

  // Ticketmaster sometimes hands us the MusicBrainz id directly, which saves a
  // rate-limited lookup against MusicBrainz itself.
  const mbid = attraction.externalLinks?.musicbrainz?.[0]?.id ?? null;

  const { data, error } = await db
    .from('artists')
    .upsert(
      {
        tm_id: attraction.id,
        name: attraction.name,
        mbid,
        image_url: pickImage(attraction.images),
        genres,
      },
      { onConflict: 'tm_id' },
    )
    .select('id')
    .single();

  if (error) {
    console.error('upsertArtist failed', { tm_id: attraction.id, error: error.message });
    return null;
  }
  return data.id;
}

export async function upsertVenue(db: SupabaseClient, venue: TMVenue): Promise<string | null> {
  const { data, error } = await db
    .from('venues')
    .upsert(
      {
        tm_id: venue.id,
        name: venue.name,
        city: venue.city?.name ?? null,
        region: venue.state?.stateCode ?? venue.state?.name ?? null,
        country: venue.country?.countryCode ?? null,
        lat: venue.location?.latitude ? Number(venue.location.latitude) : null,
        lng: venue.location?.longitude ? Number(venue.location.longitude) : null,
        timezone: venue.timezone ?? null,
      },
      { onConflict: 'tm_id' },
    )
    .select('id')
    .single();

  if (error) {
    console.error('upsertVenue failed', { tm_id: venue.id, error: error.message });
    return null;
  }
  return data.id;
}

/** Resolve a Ticketmaster event into a local `events` row id, creating the graph as needed. */
export async function upsertEvent(db: SupabaseClient, ev: TMEvent): Promise<string | null> {
  const attractions = ev._embedded?.attractions ?? [];
  const tmVenue = ev._embedded?.venues?.[0];

  const artistIds: string[] = [];
  for (const a of attractions) {
    const id = await upsertArtist(db, a);
    if (id) artistIds.push(id);
  }

  const venueId = tmVenue ? await upsertVenue(db, tmVenue) : null;

  const startsAt = ev.dates?.start?.dateTime
    ?? (ev.dates?.start?.localDate
      ? `${ev.dates.start.localDate}T${ev.dates.start.localTime ?? '20:00:00'}`
      : null);

  if (!startsAt) {
    console.warn('upsertEvent skipped: no start date', { tm_id: ev.id });
    return null;
  }

  const { data, error } = await db
    .from('events')
    .upsert(
      {
        tm_id: ev.id,
        name: ev.name,
        headliner_id: artistIds[0] ?? null,
        venue_id: venueId,
        starts_at: startsAt,
        timezone: ev.dates?.timezone ?? tmVenue?.timezone ?? null,
        status: ev.dates?.status?.code ?? 'onsale',
        url: ev.url ?? null,
        image_url: pickImage(ev.images),
      },
      { onConflict: 'tm_id' },
    )
    .select('id')
    .single();

  if (error) {
    console.error('upsertEvent failed', { tm_id: ev.id, error: error.message });
    return null;
  }

  if (artistIds.length) {
    await db.from('event_artists').upsert(
      artistIds.map((artist_id, i) => ({
        event_id: data.id,
        artist_id,
        billing: i === 0 ? 'headliner' : 'support',
      })),
      { onConflict: 'event_id,artist_id' },
    );
  }

  return data.id;
}

/**
 * Record that a user is going to an event. Idempotent on (user_id, event_id):
 * a re-scan of the same confirmation must not create a duplicate, and must not
 * clobber a state the user has since set by hand.
 */
export async function recordAttendance(
  db: SupabaseClient,
  params: {
    userId: string;
    eventId: string;
    source: 'manual' | 'gmail' | 'forward' | 'setlistfm';
    ticketRef?: string;
    seatInfo?: string;
    priceCents?: number;
    purchasedAt?: string;
  },
): Promise<void> {
  const { data: existing } = await db
    .from('attendances')
    .select('id')
    .eq('user_id', params.userId)
    .eq('event_id', params.eventId)
    .maybeSingle();

  if (existing) {
    // Fill in ticket metadata we may not have had before, but leave state alone.
    await db
      .from('attendances')
      .update({
        ticket_ref: params.ticketRef ?? undefined,
        seat_info: params.seatInfo ?? undefined,
        price_cents: params.priceCents ?? undefined,
        purchased_at: params.purchasedAt ?? undefined,
      })
      .eq('id', existing.id);
    return;
  }

  await db.from('attendances').insert({
    user_id: params.userId,
    event_id: params.eventId,
    state: 'going',
    visibility: 'friends',
    source: params.source,
    ticket_ref: params.ticketRef ?? null,
    seat_info: params.seatInfo ?? null,
    price_cents: params.priceCents ?? null,
    purchased_at: params.purchasedAt ?? null,
  });
}
