import type { SupabaseClient } from '@supabase/supabase-js';
import { pickImage, type TMEvent, type TMAttraction, type TMVenue } from '@/lib/providers/ticketmaster';
import type { JBEvent, JBPerformer, JBVenue } from '@/lib/providers/jambase';
import { jbId, resolveStart, headlinerOf, ticketUrl, isFestival } from '@/lib/providers/jambase';
import type { SpotifyConcert } from '@/lib/providers/spotifyconcerts';
import { headlinerOf as spotifyHeadlinerOf } from '@/lib/providers/spotifyconcerts';
import type { BITEvent } from '@/lib/providers/bandsintown';
import { toInstant } from '@/lib/providers/bandsintown';
import type { CatalogCandidate } from '@/lib/ingest/match';

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

// ---------------------------------------------------------------- dispatch

/**
 * Persist whichever provider's candidate won the match.
 *
 * The matcher is provider-agnostic; the catalog is not — each source has its own
 * id column and upsert. This is the one place that knows how to get from a
 * `CatalogCandidate` back to a concrete row.
 */
export async function persistCandidate(
  db: SupabaseClient,
  candidate: CatalogCandidate,
  opts: { searched?: string } = {},
): Promise<string | null> {
  switch (candidate.source) {
    case 'ticketmaster':
      return upsertEvent(db, candidate.raw as TMEvent);
    case 'jambase':
      return upsertJamBaseEvent(db, candidate.raw as JBEvent);
    case 'spotify':
      return upsertSpotifyEvent(db, candidate.raw as SpotifyConcert, { searched: opts.searched });
    case 'bandsintown':
      return upsertBandsintownEvent(db, candidate.raw as BITEvent, { searched: opts.searched });
  }
}

// ---------------------------------------------------------------- Bandsintown

/**
 * Artists arrive as a name plus, for the searched artist only, a Bandsintown id.
 * Same shape of problem as the Spotify path: a lineup is billed as bare names.
 */
async function upsertBitArtist(
  db: SupabaseClient,
  name: string,
  bandsintownId?: string | null,
): Promise<string | null> {
  if (!name.trim()) return null;

  if (bandsintownId) {
    const { data, error } = await db
      .from('artists')
      .upsert({ bandsintown_id: bandsintownId, name }, { onConflict: 'bandsintown_id' })
      .select('id')
      .single();
    if (error) {
      console.error('upsertBitArtist failed', { bandsintownId, error: error.message });
      return null;
    }
    return data.id;
  }

  const { data: existing } = await db.from('artists').select('id').ilike('name', name).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db.from('artists').insert({ name }).select('id').single();
  if (error) {
    console.error('upsertBitArtist insert failed', { name, error: error.message });
    return null;
  }
  return data.id;
}

/**
 * Venues carry no id on Bandsintown list rows — only a name and a city string
 * like "San Francisco". So this is name+city matching, the same fallback the
 * Spotify path uses when `venueId` is null.
 *
 * That matching is what makes reconciliation work: a Spotify row already placed
 * "Public Works" in "San Francisco" with coordinates, and this finds that row
 * rather than inserting a second one beside it.
 */
async function upsertBitVenue(db: SupabaseClient, ev: BITEvent): Promise<string | null> {
  if (!ev.venueName) return null;

  let lookup = db.from('venues').select('id').ilike('name', ev.venueName);
  lookup = ev.city ? lookup.ilike('city', ev.city) : lookup.is('city', null);
  const { data: existing } = await lookup.maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from('venues')
    .insert({ name: ev.venueName, city: ev.city })
    .select('id')
    .single();
  if (error) {
    console.error('upsertBitVenue insert failed', { name: ev.venueName, error: error.message });
    return null;
  }
  return data.id;
}

/**
 * Persist a Bandsintown event into the shared catalog.
 *
 * Two things here that the other three upserts do not have to deal with.
 *
 * **1. The start time is a naive local wall time.** `2026-09-27T22:00:00` with
 * no zone. Writing that to Postgres as-is would be read back as UTC and put a
 * 22:00 San Francisco show at 15:00. So the zone is resolved in priority order:
 * the event's own `timezone` (present only on detail rows), then the timezone
 * another provider already stored on the matched venue row, and only then a bare
 * UTC anchor with `timezone` left null — which is exactly what the Spotify path
 * already does and what the UI already handles by falling back to the viewer's
 * zone.
 *
 * **2. It may be describing a show we already have.** Bandsintown is the LAST
 * provider consulted, so by the time we get here JamBase or Spotify has often
 * already written this event under its own id. `reconcileEvent` looks for that
 * row first and merges into it, rather than creating a duplicate the Upcoming
 * tab would show twice.
 */
export async function upsertBandsintownEvent(
  db: SupabaseClient,
  ev: BITEvent,
  opts: { searched?: string; bandsintownArtistId?: string | null } = {},
): Promise<string | null> {
  if (!ev.id || !ev.startsAtLocal) return null;

  const venueId = await upsertBitVenue(db, ev);

  // Zone resolution, best source first.
  let timezone = ev.timezone;
  if (!timezone && venueId) {
    const { data: venue } = await db.from('venues').select('timezone').eq('id', venueId).maybeSingle();
    timezone = venue?.timezone ?? null;
  }
  const startsAt =
    toInstant(ev.startsAtLocal, timezone)
    ?? `${ev.startsAtLocal.replace(/Z$/, '')}Z`;

  const headlinerName = ev.artistName ?? opts.searched ?? null;
  const artistIds: string[] = [];
  for (const name of [...new Set([headlinerName, ...ev.lineup].filter((n): n is string => !!n))].slice(0, 12)) {
    const id = await upsertBitArtist(
      db,
      name,
      name === headlinerName ? opts.bandsintownArtistId ?? null : null,
    );
    if (id) artistIds.push(id);
  }
  const headlinerId = headlinerName
    ? await upsertBitArtist(db, headlinerName, opts.bandsintownArtistId ?? null)
    : null;

  // Does another provider already have this show?
  const existingId = await reconcileEvent(db, {
    startsAt,
    venueId,
    headlinerId,
    name: ev.name,
  });

  const row = {
    bandsintown_id: ev.id,
    name: ev.name,
    headliner_id: headlinerId,
    venue_id: venueId,
    starts_at: startsAt,
    timezone,
    status: 'scheduled',
    url: ev.ticketUrl ?? ev.eventUrl,
    is_festival: false,
  };

  if (existingId) {
    /*
     * Merge, do not overwrite. The existing row came from a provider we trust
     * for the fields it filled in — JamBase has images and festival flags,
     * Spotify has venue coordinates — so this only ADDS the Bandsintown id and
     * fills gaps. `starts_at` in particular is left alone: the incumbent's
     * value came with a real zone, and ours may be a bare UTC anchor.
     */
    const { data: current } = await db
      .from('events')
      .select('timezone, url')
      .eq('id', existingId)
      .maybeSingle();

    const { error } = await db
      .from('events')
      .update({
        bandsintown_id: ev.id,
        // Bandsintown's IANA zone is worth taking when nobody else had one —
        // it is the only source here that reports a real zone for club shows.
        timezone: current?.timezone ?? timezone,
        url: current?.url ?? row.url,
      })
      .eq('id', existingId);

    if (error) {
      console.error('reconcile update failed', { existingId, error: error.message });
      return existingId;
    }
    await linkEventArtists(db, existingId, artistIds, headlinerId);
    return existingId;
  }

  const { data, error } = await db
    .from('events')
    .upsert(row, { onConflict: 'bandsintown_id' })
    .select('id')
    .single();

  if (error) {
    console.error('upsertBandsintownEvent failed', { id: ev.id, error: error.message });
    return null;
  }

  await linkEventArtists(db, data.id, artistIds, headlinerId);
  return data.id;
}

/**
 * Find an existing catalog row describing the same show, from any provider.
 *
 * The catalog keys on provider ids, so two providers describing one gig produce
 * two rows unless something looks for the overlap. `ingest/match.sameShow` does
 * this for in-flight CANDIDATES; this is the persisted equivalent.
 *
 * Deliberately conservative — it would rather miss a duplicate than merge two
 * genuinely different shows, because a merge is much harder to undo than a
 * duplicate. So it requires a same-day start AND either the same venue row or
 * the same headliner. Two nights of one residency at one venue are a real risk,
 * which is why the window is the calendar day rather than `sameShow`'s 12 hours.
 */
async function reconcileEvent(
  db: SupabaseClient,
  ev: { startsAt: string; venueId: string | null; headlinerId: string | null; name: string },
): Promise<string | null> {
  if (!ev.venueId && !ev.headlinerId) return null;

  const t = new Date(ev.startsAt).getTime();
  if (Number.isNaN(t)) return null;
  const from = new Date(t - 12 * 3_600_000).toISOString();
  const to = new Date(t + 12 * 3_600_000).toISOString();

  let query = db
    .from('events')
    .select('id, venue_id, headliner_id')
    .gte('starts_at', from)
    .lte('starts_at', to)
    .is('bandsintown_id', null);

  // Venue is the stronger signal: an artist can play two cities in two days,
  // but two different shows rarely share a venue AND a day.
  if (ev.venueId) query = query.eq('venue_id', ev.venueId);
  else if (ev.headlinerId) query = query.eq('headliner_id', ev.headlinerId);

  const { data } = await query.limit(2);
  if (!data || data.length !== 1) return null;

  // Matched on venue+day alone? Require the headliner to agree, or be unknown
  // on one side — otherwise two bands at one club on one night would merge.
  if (ev.venueId && ev.headlinerId && data[0].headliner_id) {
    if (data[0].headliner_id !== ev.headlinerId) return null;
  }

  return data[0].id;
}

/** Shared by the Bandsintown paths; mirrors the tail of the other upserts. */
async function linkEventArtists(
  db: SupabaseClient,
  eventId: string,
  artistIds: string[],
  headlinerId: string | null,
) {
  if (!artistIds.length) return;
  await db.from('event_artists').upsert(
    artistIds.map((artist_id) => ({
      event_id: eventId,
      artist_id,
      billing: artist_id === headlinerId ? 'headliner' : 'support',
    })),
    { onConflict: 'event_id,artist_id' },
  );
}
