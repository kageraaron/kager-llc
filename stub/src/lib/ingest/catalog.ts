import type { SupabaseClient } from '@supabase/supabase-js';
import { pickImage, type TMEvent, type TMAttraction, type TMVenue } from '@/lib/providers/ticketmaster';
import type { JBEvent, JBPerformer, JBVenue } from '@/lib/providers/jambase';
import { jbId, resolveStart, headlinerOf, ticketUrl, isFestival } from '@/lib/providers/jambase';
import type { SpotifyConcert } from '@/lib/providers/spotifyconcerts';
import { headlinerOf as spotifyHeadlinerOf } from '@/lib/providers/spotifyconcerts';

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

// ---------------------------------------------------------------- JamBase


async function upsertJbArtist(db: SupabaseClient, p: JBPerformer): Promise<string | null> {
  const id = jbId(p.identifier);
  if (!id || !p.name) return null;

  const { data, error } = await db
    .from('artists')
    .upsert(
      {
        jambase_id: id,
        name: p.name,
        image_url: p.image || null,
        genres: (p.genre ?? []).slice(0, 6),
      },
      { onConflict: 'jambase_id' },
    )
    .select('id')
    .single();

  if (error) {
    console.error('upsertJbArtist failed', { id, error: error.message });
    return null;
  }
  return data.id;
}

async function upsertJbVenue(db: SupabaseClient, v: JBVenue): Promise<string | null> {
  const id = jbId(v.identifier);
  if (!id || !v.name) return null;

  const addr = v.address ?? {};
  const { data, error } = await db
    .from('venues')
    .upsert(
      {
        jambase_id: id,
        name: v.name,
        city: addr.addressLocality ?? null,
        region: addr.addressRegion?.alternateName ?? addr.addressRegion?.name ?? null,
        country: addr.addressCountry?.identifier ?? null,
        lat: v.geo?.latitude ?? null,
        lng: v.geo?.longitude ?? null,
        timezone: addr['x-timezone'] ?? null,
      },
      { onConflict: 'jambase_id' },
    )
    .select('id')
    .single();

  if (error) {
    console.error('upsertJbVenue failed', { id, error: error.message });
    return null;
  }
  return data.id;
}

/**
 * Persist a JamBase event into the shared catalog.
 *
 * Mirrors `upsertEvent` for Ticketmaster. The two can describe the same show;
 * they are not currently reconciled, which is a known gap — see TODO.
 */
export async function upsertJamBaseEvent(db: SupabaseClient, ev: JBEvent): Promise<string | null> {
  const id = jbId(ev.identifier);
  const startsAt = resolveStart(ev);
  if (!id || !startsAt || !ev.name) return null;

  const performers = ev.performer ?? [];
  const head = headlinerOf(ev);

  const artistIds: string[] = [];
  for (const p of performers.slice(0, 12)) {
    const artistId = await upsertJbArtist(db, p);
    if (artistId) artistIds.push(artistId);
  }
  const headlinerId = head ? await upsertJbArtist(db, head) : null;

  const venueId = ev.location ? await upsertJbVenue(db, ev.location) : null;

  const { data, error } = await db
    .from('events')
    .upsert(
      {
        jambase_id: id,
        name: ev.name,
        // Festivals deliberately have no headliner; the event name is the label.
        headliner_id: headlinerId ?? (isFestival(ev) ? null : artistIds[0] ?? null),
        venue_id: venueId,
        starts_at: startsAt,
        ends_at: ev.endDate && ev.endDate !== ev.startDate ? `${ev.endDate}T23:59:59Z` : null,
        timezone: ev.location?.address?.['x-timezone'] ?? null,
        status: ev.eventStatus ?? 'scheduled',
        url: ticketUrl(ev),
        image_url: ev.image || null,
        is_festival: isFestival(ev),
      },
      { onConflict: 'jambase_id' },
    )
    .select('id')
    .single();

  if (error) {
    console.error('upsertJamBaseEvent failed', { id, error: error.message });
    return null;
  }

  if (artistIds.length) {
    await db.from('event_artists').upsert(
      artistIds.map((artist_id) => ({
        event_id: data.id,
        artist_id,
        billing: artist_id === headlinerId ? 'headliner' : 'support',
      })),
      { onConflict: 'event_id,artist_id' },
    );
  }

  return data.id;
}

// ---------------------------------------------------------------- Spotify

/**
 * Artists here arrive as a bare name — the concerts payload bills a lineup as
 * `[{ name }]` with no per-artist id, so only the *searched* artist can be tied
 * to a Spotify id. Everyone else is matched on name or created without one.
 *
 * Name matching is `ilike` rather than `eq` so "the fratellis" finds "The
 * Fratellis" instead of inserting a duplicate beside it.
 */
async function upsertSpotifyArtist(
  db: SupabaseClient,
  name: string,
  spotifyArtistId?: string | null,
): Promise<string | null> {
  if (!name.trim()) return null;

  if (spotifyArtistId) {
    const { data, error } = await db
      .from('artists')
      .upsert({ spotify_artist_id: spotifyArtistId, name }, { onConflict: 'spotify_artist_id' })
      .select('id')
      .single();
    if (error) {
      console.error('upsertSpotifyArtist failed', { spotifyArtistId, error: error.message });
      return null;
    }
    return data.id;
  }

  const { data: existing } = await db.from('artists').select('id').ilike('name', name).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db.from('artists').insert({ name }).select('id').single();
  if (error) {
    console.error('upsertSpotifyArtist insert failed', { name, error: error.message });
    return null;
  }
  return data.id;
}

/**
 * Venue rows, keyed on the Spotify venue id when there is one.
 *
 * There is often not: Arena Joondalup comes back with a `venueName` and
 * coordinates but `venueId: null`. Upserting on a null key would collapse every
 * such venue onto one row, so those fall back to a name+city lookup and an
 * insert. The partial unique index in `0012` is what makes that safe.
 */
async function upsertSpotifyVenue(db: SupabaseClient, c: SpotifyConcert): Promise<string | null> {
  if (!c.venueName) return null;

  const row = {
    name: c.venueName,
    city: c.city,
    region: c.region,
    country: c.country,
    lat: c.lat,
    lng: c.lng,
  };

  if (c.venueId) {
    const { data, error } = await db
      .from('venues')
      .upsert({ spotify_venue_id: c.venueId, ...row }, { onConflict: 'spotify_venue_id' })
      .select('id')
      .single();
    if (error) {
      console.error('upsertSpotifyVenue failed', { venueId: c.venueId, error: error.message });
      return null;
    }
    return data.id;
  }

  let lookup = db.from('venues').select('id').ilike('name', c.venueName);
  lookup = c.city ? lookup.ilike('city', c.city) : lookup.is('city', null);
  const { data: existing } = await lookup.maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db.from('venues').insert(row).select('id').single();
  if (error) {
    console.error('upsertSpotifyVenue insert failed', { name: c.venueName, error: error.message });
    return null;
  }
  return data.id;
}

/**
 * Persist a Spotify concert into the shared catalog.
 *
 * Mirrors `upsertJamBaseEvent`. `timezone` is left null: the payload carries a
 * UTC offset on the start time but no IANA zone, and an offset cannot be turned
 * into one (it does not say which DST rules apply). The venue coordinates are
 * stored, so a zone can be derived later if it ever matters.
 */
export async function upsertSpotifyEvent(
  db: SupabaseClient,
  c: SpotifyConcert,
  opts: { searched?: string; spotifyArtistId?: string | null } = {},
): Promise<string | null> {
  const headlinerName = spotifyHeadlinerOf(c, opts.searched);

  const artistIds: string[] = [];
  for (const name of c.artists.slice(0, 12)) {
    // Only the searched artist can carry a Spotify id; the rest bill by name.
    const id = await upsertSpotifyArtist(
      db,
      name,
      name === headlinerName ? opts.spotifyArtistId ?? null : null,
    );
    if (id) artistIds.push(id);
  }
  const headlinerId = headlinerName
    ? await upsertSpotifyArtist(db, headlinerName, opts.spotifyArtistId ?? null)
    : null;

  const venueId = await upsertSpotifyVenue(db, c);

  const { data, error } = await db
    .from('events')
    .upsert(
      {
        spotify_concert_id: c.id,
        name: c.title,
        headliner_id: headlinerId,
        venue_id: venueId,
        starts_at: c.startsAt,
        timezone: null,
        status: 'scheduled',
        url: c.url,
        is_festival: c.isFestival,
      },
      { onConflict: 'spotify_concert_id' },
    )
    .select('id')
    .single();

  if (error) {
    console.error('upsertSpotifyEvent failed', { id: c.id, error: error.message });
    return null;
  }

  if (artistIds.length) {
    await db.from('event_artists').upsert(
      artistIds.map((artist_id) => ({
        event_id: data.id,
        artist_id,
        billing: artist_id === headlinerId ? 'headliner' : 'support',
      })),
      { onConflict: 'event_id,artist_id' },
    );
  }

  return data.id;
}
