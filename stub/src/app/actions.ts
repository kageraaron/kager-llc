'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEvent as tmGetEvent } from '@/lib/providers/ticketmaster';
import {
  upsertEvent,
  upsertJamBaseEvent,
  upsertSpotifyEvent,
  upsertBandsintownEvent,
  recordAttendance,
} from '@/lib/ingest/catalog';
import * as jambase from '@/lib/providers/jambase';
import { toInstant } from '@/lib/providers/bandsintown';
import { getCurrentUser } from '@/lib/auth';
import type { ParsedTicket } from '@/lib/types';
import {
  geocodePlace,
  cachedArtistConcerts,
  cachedBandsintownArtist,
  cachedBandsintownEvent,
} from '@/lib/cache';

/**
 * Server actions for everything the user does by hand.
 *
 * Writes go through the request-scoped client so RLS applies. The one exception
 * is catalog writes (artists/venues/events), which are global rows the user has
 * no direct insert rights on - those use the admin client after we have already
 * confirmed the caller is signed in.
 */

async function requireUser() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) throw new Error('Not signed in');
  return { supabase, user };
}


/** Add a Ticketmaster event to the user's calendar, creating the catalog rows if needed. */
export async function addEventByTmId(tmId: string, state: 'going' | 'interested' = 'going') {
  const { user } = await requireUser();

  const tmEvent = await tmGetEvent(tmId);
  if (!tmEvent) return { ok: false as const, error: 'Event not found' };

  const admin = createAdminClient();
  const eventId = await upsertEvent(admin, tmEvent);
  if (!eventId) return { ok: false as const, error: 'Could not save that event' };

  await recordAttendance(admin, { userId: user.id, eventId, source: 'manual' });
  if (state !== 'going') {
    await admin.from('attendances').update({ state }).eq('user_id', user.id).eq('event_id', eventId);
  }

  revalidatePath('/upcoming');
  revalidatePath('/browse');
  return { ok: true as const, eventId };
}

/**
 * Add a search result, from whichever provider produced it.
 *
 * Browse can return hits from any of the four providers in the same list, so
 * the result carries its source and this resolves it against the right API.
 *
 * Neither the Spotify nor the Bandsintown branch normally spends quota: both
 * re-read the cached artist response that produced the result in the first
 * place. That is why `query` is threaded through from the UI rather than the
 * event being fetched by id — there is no get-concert-by-id on either.
 */
export async function addEventFromSearch(
  source: 'ticketmaster' | 'jambase' | 'spotify' | 'bandsintown',
  id: string,
  /**
   * The artist query the result came from. Required for Spotify AND
   * Bandsintown, neither of which has a get-event-by-id endpoint we can afford
   * — the only route back to a row is the artist search that produced it. Both
   * searches are cached, so this normally spends nothing.
   */
  query?: string,
) {
  const { user } = await requireUser();
  const admin = createAdminClient();

  let eventId: string | null = null;

  if (source === 'spotify') {
    if (!query) return { ok: false as const, error: 'Could not save that event' };
    const result = await cachedArtistConcerts(query);
    const concert = result?.concerts.find((c) => c.id === id);
    if (!concert) return { ok: false as const, error: 'Event not found' };
    eventId = await upsertSpotifyEvent(admin, concert, {
      searched: query,
      spotifyArtistId: result?.artist?.id ?? null,
    });
  } else if (source === 'bandsintown') {
    if (!query) return { ok: false as const, error: 'Could not save that event' };
    const result = await cachedBandsintownArtist(query);
    const event = result?.events.find((e) => e.id === id);
    if (!event) return { ok: false as const, error: 'Event not found' };
    eventId = await upsertBandsintownEvent(admin, event, {
      searched: query,
      bandsintownArtistId: result?.artist?.id ?? null,
    });
  } else if (source === 'jambase') {
    const target = await jambase.getEventById(id);
    if (!target) return { ok: false as const, error: 'Event not found' };
    eventId = await upsertJamBaseEvent(admin, target);
  } else {
    const tmEvent = await tmGetEvent(id);
    if (!tmEvent) return { ok: false as const, error: 'Event not found' };
    eventId = await upsertEvent(admin, tmEvent);
  }

  if (!eventId) return { ok: false as const, error: 'Could not save that event' };

  await recordAttendance(admin, { userId: user.id, eventId, source: 'manual' });

  revalidatePath('/upcoming');
  revalidatePath('/browse');
  return { ok: true as const, eventId };
}

/**
 * Create a show by hand, for one no provider lists.
 *
 * This is Stub's equivalent of Shop letting you type a carrier and tracking
 * number when the inbox scan misses an order — and it is not a rare case.
 * An AXS-sold club show (Overmono DJ Set + Ben UFO, San Francisco, Sept 2026)
 * is absent from BOTH JamBase and Ticketmaster. Aggregator coverage of
 * afterparties and late-announced club nights is genuinely poor.
 *
 * The event is written to the shared catalog with no provider id, so it will
 * never collide with a synced row.
 */
export async function createManualEvent(input: {
  artistName: string;
  venueName?: string;
  city?: string;
  region?: string;
  /** Local wall time, "2026-09-27T22:00" from a datetime-local input. */
  startsAt: string;
  timezone?: string;
  url?: string;
}) {
  const { user } = await requireUser();

  const artistName = input.artistName.trim();
  if (artistName.length < 1) return { ok: false as const, error: 'Artist name is required' };

  const when = new Date(input.startsAt);
  if (Number.isNaN(when.getTime())) return { ok: false as const, error: 'That date is not valid' };

  const admin = createAdminClient();

  // Reuse an existing artist by name before creating another one, so manual
  // entries join up with synced shows by the same act.
  const { data: existingArtist } = await admin
    .from('artists')
    .select('id')
    .ilike('name', artistName)
    .limit(1)
    .maybeSingle();

  let artistId = existingArtist?.id ?? null;
  if (!artistId) {
    const { data } = await admin
      .from('artists')
      .insert({ name: artistName })
      .select('id')
      .single();
    artistId = data?.id ?? null;
  }

  let venueId: string | null = null;
  if (input.venueName?.trim()) {
    const { data: existingVenue } = await admin
      .from('venues')
      .select('id')
      .ilike('name', input.venueName.trim())
      .eq('city', input.city?.trim() ?? '')
      .limit(1)
      .maybeSingle();

    venueId = existingVenue?.id ?? null;
    if (!venueId) {
      const { data } = await admin
        .from('venues')
        .insert({
          name: input.venueName.trim(),
          city: input.city?.trim() || null,
          region: input.region?.trim() || null,
          timezone: input.timezone || null,
        })
        .select('id')
        .single();
      venueId = data?.id ?? null;
    }
  }

  const { data: event, error } = await admin
    .from('events')
    .insert({
      name: artistName,
      headliner_id: artistId,
      venue_id: venueId,
      starts_at: when.toISOString(),
      timezone: input.timezone || null,
      status: 'onsale',
      url: input.url?.trim() || null,
    })
    .select('id')
    .single();

  if (error || !event) {
    return { ok: false as const, error: error?.message ?? 'Could not create that show' };
  }

  if (artistId) {
    await admin
      .from('event_artists')
      .insert({ event_id: event.id, artist_id: artistId, billing: 'headliner' });
  }

  await recordAttendance(admin, { userId: user.id, eventId: event.id, source: 'manual' });

  revalidatePath('/upcoming');
  revalidatePath('/archive');
  return { ok: true as const, eventId: event.id };
}

/**
 * Add an event that already exists in our catalog. This is the path used from
 * the event detail page, where the row was loaded from `events` - no reason to
 * spend a Ticketmaster call re-fetching something we already have.
 */
export async function addExistingEvent(
  eventId: string,
  state: 'going' | 'interested' | 'went' = 'going',
) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from('attendances')
    .insert({ user_id: user.id, event_id: eventId, state, source: 'manual' });

  if (error && error.code !== '23505') return { ok: false as const, error: error.message };

  revalidatePath(`/event/${eventId}`);
  revalidatePath('/upcoming');
  revalidatePath('/archive');
  return { ok: true as const };
}

export async function setAttendanceState(
  eventId: string,
  state: 'going' | 'interested' | 'went' | 'missed',
) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from('attendances')
    .update({ state })
    .eq('user_id', user.id)
    .eq('event_id', eventId);

  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/event/${eventId}`);
  revalidatePath('/upcoming');
  revalidatePath('/archive');
  return { ok: true as const };
}

export async function setAttendanceVisibility(eventId: string, visibility: 'friends' | 'private') {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from('attendances')
    .update({ visibility })
    .eq('user_id', user.id)
    .eq('event_id', eventId);

  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/event/${eventId}`);
  return { ok: true as const };
}

export async function removeAttendance(eventId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from('attendances').delete().eq('user_id', user.id).eq('event_id', eventId);
  revalidatePath('/upcoming');
  revalidatePath('/archive');
  return { ok: true as const };
}

/** Private note. RLS on `notes` is owner-only, with no friend read path. */
export async function saveNote(eventId: string, body: string) {
  const { supabase, user } = await requireUser();

  if (body.trim() === '') {
    await supabase.from('notes').delete().eq('user_id', user.id).eq('event_id', eventId);
  } else {
    const { error } = await supabase
      .from('notes')
      .upsert({ user_id: user.id, event_id: eventId, body }, { onConflict: 'user_id,event_id' });
    if (error) return { ok: false as const, error: error.message };
  }

  revalidatePath(`/event/${eventId}`);
  return { ok: true as const };
}

/**
 * Rate a show, with an optional short review.
 *
 * Unlike `notes`, the review rides on the attendance row, so accepted friends
 * see it whenever visibility = 'friends'. That distinction is deliberate: notes
 * are for you, reviews are for the people you went with.
 *
 * Passing `null` as the rating clears both.
 */
export async function rateShow(eventId: string, rating: number | null, review?: string) {
  const { supabase, user } = await requireUser();

  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return { ok: false as const, error: 'Rating must be 1-5' };
  }
  if (review && review.length > 1000) {
    return { ok: false as const, error: 'Reviews are capped at 1000 characters' };
  }

  const { error } = await supabase
    .from('attendances')
    .update({
      rating,
      review: rating === null ? null : (review?.trim() || null),
      rated_at: rating === null ? null : new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('event_id', eventId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/event/${eventId}`);
  revalidatePath('/archive');
  return { ok: true as const };
}

// ---------------------------------------------------------------- friends

/** Friendships are stored as one canonical row with user_low < user_high. */
function pair(a: string, b: string) {
  return a < b ? { user_low: a, user_high: b } : { user_low: b, user_high: a };
}

export async function sendFriendRequest(handle: string) {
  const { supabase, user } = await requireUser();

  const { data: target } = await supabase
    .from('profiles')
    .select('id, handle')
    .eq('handle', handle.toLowerCase().replace(/^@/, ''))
    .maybeSingle();

  if (!target) return { ok: false as const, error: 'No one with that handle' };
  if (target.id === user.id) return { ok: false as const, error: 'That is you' };

  const { error } = await supabase
    .from('friendships')
    .insert({ ...pair(user.id, target.id), status: 'pending', requested_by: user.id });

  if (error) {
    // Unique violation: a row already exists in some state.
    if (error.code === '23505') return { ok: false as const, error: 'Already requested or connected' };
    return { ok: false as const, error: error.message };
  }

  revalidatePath('/friends');
  return { ok: true as const };
}

export async function respondToFriendRequest(otherUserId: string, accept: boolean) {
  const { supabase, user } = await requireUser();
  const p = pair(user.id, otherUserId);

  if (accept) {
    await supabase.from('friendships').update({ status: 'accepted' }).match(p);
  } else {
    await supabase.from('friendships').delete().match(p);
  }

  revalidatePath('/friends');
  return { ok: true as const };
}

export async function removeFriend(otherUserId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from('friendships').delete().match(pair(user.id, otherUserId));
  revalidatePath('/friends');
  return { ok: true as const };
}

// ---------------------------------------------------------------- profile

export async function updateProfile(input: {
  handle?: string;
  display_name?: string;
  bio?: string;
  home_city?: string;
}) {
  const { supabase, user } = await requireUser();

  const patch: Record<string, string> = {};
  if (input.handle !== undefined) {
    const handle = input.handle.toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
      return { ok: false as const, error: 'Handles are 3-24 characters: letters, numbers, underscore' };
    }
    patch.handle = handle;
  }
  if (input.display_name !== undefined) patch.display_name = input.display_name.slice(0, 80);
  if (input.bio !== undefined) patch.bio = input.bio.slice(0, 500);
  if (input.home_city !== undefined) patch.home_city = input.home_city.slice(0, 120);

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  if (error) {
    if (error.code === '23505') return { ok: false as const, error: 'That handle is taken' };
    return { ok: false as const, error: error.message };
  }

  // Moving city invalidates the cached coordinates. Null them rather than
  // geocoding inline — the geocoder allows one request per second, and nobody
  // should wait on it to save a bio. `resolveHomeLocation` refills them on the
  // next Browse visit. Service role because `0008` deliberately withholds
  // update rights on these columns from `authenticated`.
  if (patch.home_city !== undefined) {
    await createAdminClient()
      .from('profiles')
      .update({ home_lat: null, home_lng: null })
      .eq('id', user.id);
  }

  revalidatePath('/friends');
  return { ok: true as const };
}

export interface HomeLocation {
  city: string;
  lat: number;
  lng: number;
}

/**
 * The user's home city as coordinates, geocoded once and then remembered.
 *
 * This is what lets Browse open on "what's on near me" without ever prompting
 * for geolocation permission. `home_lat` / `home_lng` have existed since `0001`
 * and were never populated; this is what populates them.
 *
 * Returns null when no home city is set or the name does not resolve — Browse
 * falls back to the explicit "Near me" button in both cases.
 */
export async function resolveHomeLocation(): Promise<HomeLocation | null> {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('home_city')
    .eq('id', user.id)
    .maybeSingle();

  const city = profile?.home_city?.trim();
  if (!city) return null;

  // Coordinates are not readable through the request-scoped client: `0008`
  // narrows the `authenticated` select grant on `profiles` to a column list
  // that excludes them.
  const admin = createAdminClient();
  const { data: coords } = await admin
    .from('profiles')
    .select('home_lat, home_lng')
    .eq('id', user.id)
    .maybeSingle();

  if (coords?.home_lat != null && coords?.home_lng != null) {
    return { city, lat: coords.home_lat, lng: coords.home_lng };
  }

  const place = await geocodePlace(city);
  if (!place) return null;

  await admin
    .from('profiles')
    .update({ home_lat: place.lat, home_lng: place.lng })
    .eq('id', user.id);

  return { city: place.label, lat: place.lat, lng: place.lng };
}

/**
 * Disconnect Gmail in one step.
 *
 * Deletes the stored tokens outright rather than flagging the row inactive —
 * there is no reason to keep an encrypted refresh token for a connection the
 * user has just revoked.
 */
export async function disconnectGmail() {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from('email_accounts')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'gmail');

  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/settings/connections');
  revalidatePath('/upcoming');
  revalidatePath('/inbox');
  return { ok: true as const };
}

// ---------------------------------------------------------------- calendar

/**
 * Returns the caller's calendar subscription URL. The token is revoked from the
 * `authenticated` grant, so it can only be read server-side, via the admin
 * client, after we've confirmed who is asking.
 */
export async function getCalendarUrl() {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from('profiles')
    .select('calendar_token')
    .eq('id', user.id)
    .maybeSingle();

  if (!data?.calendar_token) return { ok: false as const, error: 'No calendar token' };

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  return { ok: true as const, url: `${base}/api/calendar/${data.calendar_token}` };
}

/** Invalidates the old feed URL. Existing subscribers stop receiving updates. */
export async function rotateCalendarToken() {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const token = randomBytes(24).toString('hex');
  const { error } = await admin
    .from('profiles')
    .update({ calendar_token: token })
    .eq('id', user.id);

  if (error) return { ok: false as const, error: error.message };

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  revalidatePath('/settings');
  return { ok: true as const, url: `${base}/api/calendar/${token}` };
}

// ---------------------------------------------------------------- inbox review

/** Confirm a low-confidence ingest candidate, creating the attendance for real. */
export async function confirmCandidate(candidateId: string) {
  const { supabase, user } = await requireUser();

  const { data: candidate } = await supabase
    .from('ingest_candidates')
    .select('id, matched_event_id, parsed')
    .eq('id', candidateId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!candidate) return { ok: false as const, error: 'Candidate not found' };
  if (!candidate.matched_event_id) {
    return { ok: false as const, error: 'No event matched - search for it in Browse instead' };
  }

  const admin = createAdminClient();
  await recordAttendance(admin, {
    userId: user.id,
    eventId: candidate.matched_event_id,
    source: 'gmail',
  });
  await supabase.from('ingest_candidates').update({ state: 'confirmed' }).eq('id', candidateId);

  revalidatePath('/inbox');
  revalidatePath('/upcoming');
  return { ok: true as const };
}

/**
 * Create the show by hand straight from a parsed candidate.
 *
 * The gap this closes: when no provider recognises the event, the candidate is
 * stored with `matched_event_id = null` and `confirmCandidate` refuses it
 * outright — "No event matched, search for it in Browse instead". That is a dead
 * end for exactly the shows aggregators are worst at, and it throws away a
 * perfectly good parse: we already know the artist, venue, city and start time
 * from the email. Retyping all of it into Browse is busywork.
 *
 * Everything is taken from the parsed ticket, so this is one click.
 */
export async function createEventFromCandidate(candidateId: string) {
  const { supabase, user } = await requireUser();

  const { data: candidate } = await supabase
    .from('ingest_candidates')
    .select('id, parsed, matched_event_id')
    .eq('id', candidateId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!candidate) return { ok: false as const, error: 'Candidate not found' };

  const parsed = candidate.parsed as ParsedTicket;
  const name = parsed.artistName ?? parsed.eventName;
  if (!name) return { ok: false as const, error: 'That email had no artist or event name' };
  if (!parsed.startsAt) return { ok: false as const, error: 'That email had no event date' };

  const created = await createManualEvent({
    artistName: name,
    venueName: parsed.venueName,
    city: parsed.city,
    region: parsed.region,
    startsAt: parsed.startsAt,
  });
  if (!created.ok) return created;

  const admin = createAdminClient();

  // Re-record with the ticket metadata: `createManualEvent` files it as
  // 'manual', but this one came from an email and carries a reference and a
  // price worth keeping.
  await recordAttendance(admin, {
    userId: user.id,
    eventId: created.eventId,
    source: 'gmail',
    ticketRef: parsed.ticketRef,
    seatInfo: parsed.seatInfo,
    priceCents: parsed.priceCents,
    purchasedAt: parsed.purchasedAt,
  });

  await supabase
    .from('ingest_candidates')
    .update({ state: 'confirmed', matched_event_id: created.eventId })
    .eq('id', candidateId);

  revalidatePath('/inbox');
  revalidatePath('/upcoming');
  return { ok: true as const, eventId: created.eventId };
}

export async function rejectCandidate(candidateId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from('ingest_candidates')
    .update({ state: 'rejected' })
    .eq('id', candidateId)
    .eq('user_id', user.id);

  revalidatePath('/inbox');
  return { ok: true as const };
}

/**
 * Fill in an event's missing timezone, ticket link and street address from
 * Bandsintown. **Spends one credit**, and only when there is something to gain.
 *
 * This is the "one provider to search, another to fetch details" split. The
 * cheap providers are good enough to FIND a show and place it on a list; they
 * are routinely missing the fields that matter once you have committed to going
 * — a real IANA zone (so the reminder fires at the right hour) and a vendor
 * ticket URL rather than a listings page.
 *
 * Guarded three ways, because a credit is expensive here:
 *
 *  1. It returns early if the row already has a timezone and a URL — most rows
 *     from Ticketmaster and JamBase do, so this typically costs nothing.
 *  2. It needs a `bandsintown_id`, so it only runs for events Bandsintown
 *     actually produced or was reconciled onto.
 *  3. The underlying `cachedBandsintownEvent` caches for 30 days and refuses to
 *     spend past the daily budget.
 */
export async function enrichEventDetails(eventId: string) {
  await requireUser();
  const admin = createAdminClient();

  const { data: event } = await admin
    .from('events')
    .select('id, bandsintown_id, timezone, url, venue_id')
    .eq('id', eventId)
    .maybeSingle();

  if (!event?.bandsintown_id) return { ok: false as const, error: 'Nothing to enrich' };
  if (event.timezone && event.url) return { ok: true as const, enriched: false };

  const details = await cachedBandsintownEvent(event.bandsintown_id);
  if (!details) return { ok: false as const, error: 'Details unavailable' };

  const timezone = event.timezone ?? details.timezone;

  /*
   * With a real zone in hand, the stored instant can finally be corrected. The
   * row was written from a naive local wall time anchored at UTC, so a 22:00
   * San Francisco show is sitting in the database at 22:00Z — seven hours early.
   * This is the only point in the pipeline where that is fixable.
   */
  const startsAt =
    !event.timezone && details.timezone && details.startsAtLocal
      ? toInstant(details.startsAtLocal, details.timezone)
      : null;

  await admin
    .from('events')
    .update({
      timezone,
      url: event.url ?? details.ticketUrl,
      ...(startsAt ? { starts_at: startsAt } : {}),
    })
    .eq('id', eventId);

  // The zone belongs on the venue too — every future show in that room gets it
  // for free, which is the whole point of a shared catalog.
  if (event.venue_id && details.timezone) {
    await admin
      .from('venues')
      .update({ timezone: details.timezone })
      .eq('id', event.venue_id)
      .is('timezone', null);
  }

  revalidatePath(`/event/${eventId}`);
  return { ok: true as const, enriched: true };
}
