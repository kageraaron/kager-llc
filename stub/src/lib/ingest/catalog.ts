import type { SupabaseClient } from '@supabase/supabase-js';
import { pickImage, type TMEvent, type TMAttraction, type TMVenue } from '@/lib/providers/ticketmaster';
import type { JBEvent, JBPerformer, JBVenue } from '@/lib/providers/jambase';
import { jbId, resolveStart, headlinerOf, ticketUrl, isFestival } from '@/lib/providers/jambase';
import type { SpotifyConcert, SpotifyLineupArtist } from '@/lib/providers/spotifyconcerts';
import { headlinerOf as spotifyHeadlinerOf } from '@/lib/providers/spotifyconcerts';
import { getArtistMetadata } from '@/lib/providers/spotify';
import { inferTimezone } from '@/lib/timezone';
import type { BITEvent } from '@/lib/providers/bandsintown';
import type { EBEvent } from '@/lib/providers/eventbrite';
import type { SFMSetlist } from '@/lib/providers/setlistfm';
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
    ticketQuantity?: number;
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
        ticket_quantity: params.ticketQuantity ?? undefined,
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
    ticket_quantity: params.ticketQuantity ?? null,
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
  imageUrl?: string | null,
): Promise<string | null> {
  if (!name.trim()) return null;

  /*
   * `image_url` is written only when we have one. An upsert writes exactly the
   * keys it is given, so omitting it leaves whatever a richer provider already
   * stored — and passing an explicit null would wipe it. Spotify is the only
   * source in the cascade with artwork for a club-circuit act, which is why a
   * Monarch booking rendered with a blank thumbnail before this.
   *
   * `genres` is NOT set here: the Web API no longer returns them to a
   * development-mode app, so they still come only from Ticketmaster/JamBase.
   */
  const extra = imageUrl ? { image_url: imageUrl } : {};

  if (spotifyArtistId) {
    const { data, error } = await db
      .from('artists')
      .upsert(
        { spotify_artist_id: spotifyArtistId, name, ...extra },
        { onConflict: 'spotify_artist_id' },
      )
      .select('id')
      .single();
    if (error) {
      console.error('upsertSpotifyArtist failed', { spotifyArtistId, error: error.message });
      return null;
    }
    return data.id;
  }

  const { data: existing } = await db
    .from('artists')
    .select('id, image_url')
    .ilike('name', name)
    .maybeSingle();
  if (existing) {
    // Fill a gap on a row another provider created; never overwrite what it set.
    if (imageUrl && !existing.image_url) {
      await db.from('artists').update({ image_url: imageUrl }).eq('id', existing.id);
    }
    return existing.id;
  }

  const { data, error } = await db.from('artists').insert({ name, ...extra }).select('id').single();
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
async function upsertSpotifyVenue(
  db: SupabaseClient,
  c: SpotifyConcert,
): Promise<{ id: string; timezone: string | null } | null> {
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
    /*
     * Read the incumbent BEFORE upserting. Ticketmaster and JamBase both store a
     * real IANA zone on the venue row, and reusing it is strictly better than
     * anything this payload can offer — Spotify reports a UTC offset only. The
     * upsert below never writes `timezone`, so an existing one survives.
     */
    const { data: prior } = await db
      .from('venues')
      .select('timezone')
      .eq('spotify_venue_id', c.venueId)
      .maybeSingle();

    const { data, error } = await db
      .from('venues')
      .upsert({ spotify_venue_id: c.venueId, ...row }, { onConflict: 'spotify_venue_id' })
      .select('id')
      .single();
    if (error) {
      console.error('upsertSpotifyVenue failed', { venueId: c.venueId, error: error.message });
      return null;
    }
    return { id: data.id, timezone: prior?.timezone ?? null };
  }

  let lookup = db.from('venues').select('id, timezone').ilike('name', c.venueName);
  lookup = c.city ? lookup.ilike('city', c.city) : lookup.is('city', null);
  const { data: existing } = await lookup.maybeSingle();
  if (existing) return { id: existing.id, timezone: existing.timezone ?? null };

  const { data, error } = await db.from('venues').insert(row).select('id').single();
  if (error) {
    console.error('upsertSpotifyVenue insert failed', { name: c.venueName, error: error.message });
    return null;
  }
  return { id: data.id, timezone: null };
}

/**
 * Narrow a set of Spotify artist ids to those whose stored row has no artwork,
 * or has no row at all. Returns them all if the lookup fails, since
 * over-fetching is a far better failure than silently skipping enrichment.
 */
async function missingArtwork(db: SupabaseClient, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];

  const { data, error } = await db
    .from('artists')
    .select('spotify_artist_id, image_url')
    .in('spotify_artist_id', ids);

  if (error) return ids;

  const known = new Set(
    (data ?? []).filter((a) => a.image_url).map((a) => a.spotify_artist_id as string),
  );
  return ids.filter((id) => !known.has(id));
}

/**
 * Persist a Spotify concert into the shared catalog.
 *
 * Mirrors `upsertJamBaseEvent`, with two things this payload makes us work for.
 *
 * **1. There is no IANA timezone.** The start time arrives as an instant with a
 * UTC offset (`2026-09-27T22:00-07:00`), and an offset is not a zone — it does
 * not say which DST rules apply. `timezone` used to be written as a flat null,
 * and because the UI renders a zone-less event in the RUNTIME's zone (UTC, on
 * Vercel) a 10pm San Francisco show read back as "Mon, Sep 28 · 5:00 AM". The
 * instant was always right; the zone to render it in was missing. So it is now
 * resolved from the venue row another provider already placed, and failing that
 * from the region — see `lib/timezone`.
 *
 * **2. Artist artwork is only in the `details` view.** `c.lineup` carries it,
 * `c.artists` is names alone. For a club-circuit act this is the only artwork
 * any provider in the cascade has. Where the `details` view is missing — the
 * proxy's `detailsLimit` caps how many concerts get one — Spotify's own Web API
 * fills the gap via `getArtistMetadata`, best-effort and only for acts with no
 * picture already.
 */
export async function upsertSpotifyEvent(
  db: SupabaseClient,
  c: SpotifyConcert,
  opts: { searched?: string; spotifyArtistId?: string | null } = {},
): Promise<string | null> {
  const headlinerName = spotifyHeadlinerOf(c, opts.searched);

  // Names alone on older callers; the lineup when we have the richer view.
  const lineup: SpotifyLineupArtist[] = c.lineup?.length
    ? c.lineup
    : c.artists.map((name) => ({ name, spotifyArtistId: null, imageUrl: null }));

  const billed = lineup.slice(0, 12);

  /*
   * One Web API call for the whole bill, not one per act. `/v1/artists` takes
   * up to 50 ids, and a lineup is at most a dozen — so this is a single request
   * regardless of how long the bill is, and none at all when the app has no
   * credentials configured.
   */
  /*
   * Web API lookups only for acts the payload gave NO picture for.
   *
   * Two filters, both load-bearing. The payload's own image is the same URL the
   * Web API would return, so asking about an act we already have artwork for
   * spends a request to learn nothing — and since February 2026 removed the
   * batch endpoint, that is one request PER ACT. The database check then skips
   * artists a previous ingest already resolved, which is what keeps the
   * multi-year Gmail backfill (which persists hundreds of events in a row) from
   * re-asking the same questions hundreds of times.
   *
   * In the steady state both filters are empty and no request is made at all.
   */
  const needArtwork = billed
    .filter((a) => !a.imageUrl && a.spotifyArtistId)
    .map((a) => a.spotifyArtistId as string);
  const metadata = await getArtistMetadata(await missingArtwork(db, needArtwork));

  /** The payload's image, or Spotify's own when the payload had none. */
  const artworkFor = (artist: SpotifyLineupArtist | undefined, id: string | null) =>
    artist?.imageUrl ?? (id ? metadata.get(id)?.imageUrl ?? null : null);

  const artistIds: string[] = [];
  for (const artist of billed) {
    // The searched artist's id is authoritative; the payload's is next best.
    const spotifyId =
      artist.name === headlinerName
        ? opts.spotifyArtistId ?? artist.spotifyArtistId ?? null
        : artist.spotifyArtistId ?? null;

    const id = await upsertSpotifyArtist(
      db,
      artist.name,
      spotifyId,
      artworkFor(artist, spotifyId),
    );
    if (id) artistIds.push(id);
  }

  const headliner = lineup.find((a) => a.name === headlinerName);
  const headlinerSpotifyId = opts.spotifyArtistId ?? headliner?.spotifyArtistId ?? null;
  const headlinerId = headlinerName
    ? await upsertSpotifyArtist(
        db,
        headlinerName,
        headlinerSpotifyId,
        artworkFor(headliner, headlinerSpotifyId),
      )
    : null;

  const venue = await upsertSpotifyVenue(db, c);
  const venueId = venue?.id ?? null;
  const timezone = venue?.timezone ?? inferTimezone(c.region, c.country);

  const { data, error } = await db
    .from('events')
    .upsert(
      {
        spotify_concert_id: c.id,
        name: c.title,
        headliner_id: headlinerId,
        venue_id: venueId,
        starts_at: c.startsAt,
        timezone,
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

  // Backfill the venue's zone so the next provider to touch this row inherits
  // it instead of re-deriving. Only when it had none — never overwrite a real
  // one with an inferred one.
  if (venueId && !venue?.timezone && timezone) {
    await db.from('venues').update({ timezone }).eq('id', venueId).is('timezone', null);
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
    case 'eventbrite':
      return upsertEventbriteEvent(db, candidate.raw as EBEvent);
    case 'setlistfm':
      return upsertSetlistFmEvent(db, candidate.raw as SFMSetlist, { searched: opts.searched });
  }
}

// ---------------------------------------------------------------- setlist.fm

/**
 * Persist a show from setlist.fm.
 *
 * This is the ARCHIVE path: it only ever runs for a ticket whose date has
 * already passed, because that is the one case no listing provider can serve.
 *
 * What it does and does not know:
 *
 *  - **Date, not time.** A setlist records the night. Anchored at 20:00 in the
 *    venue's inferred zone, which is honest to the day and vague about the hour
 *    — exactly the precision the source has.
 *  - **No ticket URL.** `url` points at the setlist.fm page, which for a past
 *    show is the useful link anyway.
 *  - **No image.** Artist artwork still comes from the artist row.
 *
 * There is no provider-id column for setlist.fm on `events`; these rows are
 * keyed by reconciliation against what is already there, and created fresh only
 * when nothing matches. That is deliberate — a past show is written once and
 * never re-synced, so an upsert key would buy nothing.
 */
export async function upsertSetlistFmEvent(
  db: SupabaseClient,
  sl: SFMSetlist,
  opts: { searched?: string } = {},
): Promise<string | null> {
  const artistName = sl.artist?.name ?? opts.searched;
  const [day, month, year] = (sl.eventDate ?? '').split('-');
  if (!artistName || !day || !month || !year) return null;

  const city = sl.venue?.city;
  const region = city?.stateCode ?? city?.state ?? null;
  const country = city?.country?.code ?? null;
  const timezone = inferTimezone(region, country);

  const venueId = sl.venue?.name
    ? await upsertSetlistFmVenue(db, {
        name: sl.venue.name,
        city: city?.name ?? null,
        region,
        country,
        lat: city?.coords?.lat ?? null,
        lng: city?.coords?.long ?? null,
        timezone,
      })
    : null;

  const startsAt =
    toInstant(`${year}-${month}-${day}T20:00:00`, timezone) ??
    `${year}-${month}-${day}T20:00:00Z`;

  const artistId = await upsertSpotifyArtist(db, artistName);

  const existingId = await reconcileEvent(
    db,
    { startsAt, venueId, headlinerId: artistId, name: artistName },
    null,
  );
  if (existingId) return existingId;

  const { data, error } = await db
    .from('events')
    .insert({
      name: artistName,
      headliner_id: artistId,
      venue_id: venueId,
      starts_at: startsAt,
      timezone,
      status: 'completed',
      url: sl.url ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('upsertSetlistFmEvent failed', { id: sl.id, error: error.message });
    return null;
  }

  if (artistId) await linkEventArtists(db, data.id, [artistId], artistId);
  return data.id;
}

/** Name+city venue matching, the same fallback the Spotify and BIT paths use. */
async function upsertSetlistFmVenue(
  db: SupabaseClient,
  v: {
    name: string;
    city: string | null;
    region: string | null;
    country: string | null;
    lat: number | null;
    lng: number | null;
    timezone: string | null;
  },
): Promise<string | null> {
  let lookup = db.from('venues').select('id, timezone').ilike('name', v.name);
  lookup = v.city ? lookup.ilike('city', v.city) : lookup.is('city', null);
  const { data: existing } = await lookup.maybeSingle();

  if (existing) {
    if (!existing.timezone && v.timezone) {
      await db.from('venues').update({ timezone: v.timezone }).eq('id', existing.id).is('timezone', null);
    }
    return existing.id;
  }

  const { data, error } = await db.from('venues').insert(v).select('id').single();
  if (error) {
    console.error('upsertSetlistFmVenue failed', { name: v.name, error: error.message });
    return null;
  }
  return data.id;
}

// ---------------------------------------------------------------- Eventbrite

/**
 * Persist an Eventbrite event.
 *
 * The simplest of the upserts, because the payload is the least ambiguous one
 * we get. Two things worth noting.
 *
 * **There is no artist.** Eventbrite sells tickets to *events*; it has no
 * performer entity at all. So no `event_artists` rows and no headliner — the
 * event name is the billing, exactly as it is for a festival. The card falls
 * back to the event name and its initials, which for "Silva Bumpa" is the right
 * answer anyway.
 *
 * **It reconciles.** Eventbrite runs FIRST in the cascade, so it usually writes
 * the row before any other provider sees the show. But an artist search from
 * Browse can have created a Spotify or JamBase row for the same gig earlier, and
 * that row may have a headliner and lineup this one cannot supply. So the same
 * `reconcileEvent` the Bandsintown path uses is applied here: merge into the
 * incumbent rather than creating a duplicate, and — unlike that path — the
 * timezone and image ARE worth overwriting with, because Eventbrite is
 * first-party to the ticket and the incumbent's are frequently missing.
 */
export async function upsertEventbriteEvent(
  db: SupabaseClient,
  ev: EBEvent,
): Promise<string | null> {
  const venueId = ev.venueName ? await upsertEventbriteVenue(db, ev) : null;

  const existingId = await reconcileEvent(
    db,
    { startsAt: ev.startsAt, venueId, headlinerId: null, name: ev.name },
    'eventbrite_id',
  );

  const row = {
    eventbrite_id: ev.id,
    name: ev.name,
    venue_id: venueId,
    starts_at: ev.startsAt,
    timezone: ev.timezone,
    status: ev.status === 'live' ? 'onsale' : ev.status,
    url: ev.url,
    image_url: ev.imageUrl,
  };

  if (existingId) {
    /*
     * Fill gaps, but take NAME and ZONE outright.
     *
     * Both are cases where the incumbent's value is not merely absent, it is
     * actively worse, and this provider is first-party to the ticket:
     *
     *  - `timezone` is `null` by construction on a Spotify-written row — the
     *    bug this whole provider fixes. Preferring the incumbent would preserve
     *    the fault we came to correct.
     *  - `name` on that same row is a lineup join localized by the proxy, so a
     *    Browse search can have already stored "Silva Bumpa y Dean Turnley".
     *    Eventbrite knows what the promoter actually called it.
     *
     * `url` and `image_url` are left to the incumbent, because there a richer
     * provider genuinely may have had something better first.
     */
    const { data: current } = await db
      .from('events')
      .select('image_url, url')
      .eq('id', existingId)
      .maybeSingle();

    const { error } = await db
      .from('events')
      .update({
        eventbrite_id: ev.id,
        name: ev.name,
        timezone: ev.timezone,
        url: current?.url ?? row.url,
        image_url: current?.image_url ?? row.image_url,
      })
      .eq('id', existingId);

    if (error) {
      console.error('Eventbrite reconcile failed', { existingId, error: error.message });
    }
    return existingId;
  }

  const { data, error } = await db
    .from('events')
    .upsert(row, { onConflict: 'eventbrite_id' })
    .select('id')
    .single();

  if (error) {
    console.error('upsertEventbriteEvent failed', { id: ev.id, error: error.message });
    return null;
  }
  return data.id;
}

/**
 * Venue rows from an Eventbrite payload.
 *
 * Name+city matching, like the Spotify and Bandsintown paths, so a venue another
 * provider already placed is reused rather than duplicated. Eventbrite carries
 * the IANA zone on the EVENT rather than the venue, so it is copied down here —
 * that is what lets a later provider inherit a correct zone for this room.
 */
async function upsertEventbriteVenue(db: SupabaseClient, ev: EBEvent): Promise<string | null> {
  if (!ev.venueName) return null;

  let lookup = db.from('venues').select('id, timezone').ilike('name', ev.venueName);
  lookup = ev.city ? lookup.ilike('city', ev.city) : lookup.is('city', null);
  const { data: existing } = await lookup.maybeSingle();

  if (existing) {
    if (!existing.timezone && ev.timezone) {
      await db.from('venues').update({ timezone: ev.timezone }).eq('id', existing.id).is('timezone', null);
    }
    return existing.id;
  }

  const { data, error } = await db
    .from('venues')
    .insert({
      name: ev.venueName,
      city: ev.city,
      region: ev.region,
      country: ev.country,
      lat: ev.lat,
      lng: ev.lng,
      timezone: ev.timezone,
    })
    .select('id')
    .single();

  if (error) {
    console.error('upsertEventbriteVenue failed', { name: ev.venueName, error: error.message });
    return null;
  }
  return data.id;
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
  /**
   * The caller's own provider-id column. Rows that already carry one are
   * excluded, so a re-sync reconciles against OTHER providers' rows rather than
   * trying to merge a row into itself.
   *
   * `null` for a provider with no id column of its own — setlist.fm — where
   * there is no self-match to avoid and excluding anything would only prevent
   * legitimate merges. A past show that Bandsintown also has is the SAME gig,
   * and should join that row rather than duplicate it.
   */
  ownIdColumn: 'bandsintown_id' | 'eventbrite_id' | null = 'bandsintown_id',
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
    .lte('starts_at', to);

  if (ownIdColumn) query = query.is(ownIdColumn, null);

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
