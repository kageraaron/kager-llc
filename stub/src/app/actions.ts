'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/crypto';
import { getEvent as tmGetEvent } from '@/lib/providers/ticketmaster';
import {
  upsertEvent,
  upsertJamBaseEvent,
  upsertSpotifyEvent,
  upsertBandsintownEvent,
  recordAttendance,
  reconcileEvent,
} from '@/lib/ingest/catalog';
import * as jambase from '@/lib/providers/jambase';
import * as setlistfm from '@/lib/providers/setlistfm';
import { findCandidatesForTicket } from '@/lib/providers/ticketmaster';
import { fromTicketmaster, fromSetlistFm, scoreCandidate } from '@/lib/ingest/match';
import { inferTimezone, toInstant } from '@/lib/timezone';
import { getCurrentUser } from '@/lib/auth';
import { getHouseholdId } from '@/lib/household';
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

/**
 * The signed-in user plus their household. Shows, notes and the Inbox belong
 * to the household (see `0025_household.sql`), so every action on them filters
 * by it; RLS enforces the same boundary underneath.
 */
async function requireHousehold() {
  const { supabase, user } = await requireUser();
  const householdId = await getHouseholdId(supabase, user.id);
  return { supabase, user, householdId };
}

/**
 * Turn what the manual entry form gave us into a real instant.
 *
 * The form collects wall time — "8:00 PM at Monarch" — which is not an instant
 * until a zone is attached. Handing that straight to `new Date()` interprets it
 * in the SERVER's zone (UTC on Vercel), so a 10pm show was stored five hours
 * early. When we can name the venue's zone, resolve against that instead.
 */
function resolveManualStart(startsAt: string, timezone: string | null): string | null {
  // A value that already carries a zone is authoritative; do not second-guess it.
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(startsAt.trim());
  if (!hasZone && timezone) return toInstant(startsAt, timezone);

  const when = new Date(startsAt);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}


/** Add a Ticketmaster event to the household's list, creating the catalog rows if needed. */
export async function addEventByTmId(tmId: string, state: 'going' | 'interested' = 'going') {
  const { user, householdId } = await requireHousehold();

  const tmEvent = await tmGetEvent(tmId);
  if (!tmEvent) return { ok: false as const, error: 'Event not found' };

  const admin = createAdminClient();
  const eventId = await upsertEvent(admin, tmEvent);
  if (!eventId) return { ok: false as const, error: 'Could not save that event' };

  await recordAttendance(admin, { userId: user.id, eventId, source: 'manual' });
  if (state !== 'going') {
    await admin.from('attendances').update({ state }).eq('household_id', householdId).eq('event_id', eventId);
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
  /** ISO-3166 alpha-2, when the form knows it. Disambiguates "CA". */
  country?: string;
  /**
   * Local wall time, "2026-09-27T22:00". When `timeKnown` is false the time
   * half is a placeholder the form supplied, not something the user typed.
   */
  startsAt: string;
  /**
   * False when the user gave a date but no time — only offered for past shows,
   * where remembering the date but not the doors time is the normal case.
   */
  timeKnown?: boolean;
  timezone?: string;
  url?: string;
}) {
  const { user } = await requireUser();

  const artistName = input.artistName.trim();
  if (artistName.length < 1) return { ok: false as const, error: 'Artist name is required' };

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

  /*
   * Where the show IS decides its zone, not where the user is typing from.
   *
   * `input.timezone` is the browser's zone, which the form passes as a guess.
   * It used to win over everything, so an LA user logging an 8pm London show
   * stored 8pm Los Angeles: the card still read "8:00 PM" (it was labelled with
   * the same wrong zone), but the instant was 8 hours late — wrong in the
   * calendar feed and the reminder, and far enough outside `reconcileEvent`'s
   * ±12h window at larger offsets to duplicate a provider row instead of
   * joining it. The venue's own zone, then the region, and only then the guess.
   */
  let venueId: string | null = null;
  let placeZone = inferTimezone(input.region, input.country);
  if (input.venueName?.trim()) {
    const { data: existingVenue } = await admin
      .from('venues')
      .select('id, timezone')
      .ilike('name', input.venueName.trim())
      .eq('city', input.city?.trim() ?? '')
      .limit(1)
      .maybeSingle();

    venueId = existingVenue?.id ?? null;
    placeZone = existingVenue?.timezone || placeZone;
    if (!venueId) {
      const { data } = await admin
        .from('venues')
        .insert({
          name: input.venueName.trim(),
          city: input.city?.trim() || null,
          region: input.region?.trim() || null,
          country: input.country?.trim() || null,
          // Only a zone derived from the place. A venue row outlives this one
          // show, and the browser's guess would be wrong for every later reader.
          timezone: placeZone,
        })
        .select('id')
        .single();
      venueId = data?.id ?? null;
    }
  }
  const timezone = placeZone || input.timezone || null;

  const startsAt = resolveManualStart(input.startsAt, timezone);
  if (!startsAt) return { ok: false as const, error: 'That date is not valid' };

  /*
   * Does the catalog already have this show?
   *
   * Without this every manual add — and every "Add it anyway" from the Inbox,
   * which routes through here — created a brand-new row, even when the same gig
   * was already present from a provider or from another user. Two real pairs:
   *
   *   Parcels, Regency Ballroom, 26 Sep   (email)  +  (Ticketmaster)
   *   Lightning in a Bottle 2027          (email)  +  (the other user's email)
   *
   * Two rows for one night means the household's list shows it twice, and a
   * show added from each person's inbox never joins up. Reusing the existing
   * row also inherits whatever a provider knew that an email did not —
   * artwork, a real timezone, a ticket URL.
   */
  const existingId = await reconcileEvent(
    admin,
    { startsAt, venueId, headlinerId: artistId, name: artistName },
    null,
  );
  const isPast = new Date(startsAt).getTime() < Date.now();

  if (existingId) {
    await recordAttendance(admin, { userId: user.id, eventId: existingId, source: 'manual' });
    revalidatePath('/upcoming');
    revalidatePath('/archive');
    return { ok: true as const, eventId: existingId, isPast };
  }

  const { data: event, error } = await admin
    .from('events')
    .insert({
      name: artistName,
      headliner_id: artistId,
      venue_id: venueId,
      starts_at: startsAt,
      timezone,
      time_known: input.timeKnown !== false,
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
  /*
   * `isPast` tells the caller which list the show actually joined. The Add
   * sheet closes and refreshes in place, which silently does nothing when a
   * past show is added from Upcoming — the row lands in Archive, so from the
   * user's side the form just vanished.
   */
  return { ok: true as const, eventId: event.id, isPast };
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
  const { supabase, householdId } = await requireHousehold();
  const { error } = await supabase
    .from('attendances')
    .update({ state })
    .eq('household_id', householdId)
    .eq('event_id', eventId);

  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/event/${eventId}`);
  revalidatePath('/upcoming');
  revalidatePath('/archive');
  return { ok: true as const };
}

export async function removeAttendance(eventId: string) {
  const { supabase, householdId } = await requireHousehold();
  await supabase.from('attendances').delete().eq('household_id', householdId).eq('event_id', eventId);
  revalidatePath('/upcoming');
  revalidatePath('/archive');
  return { ok: true as const };
}

/**
 * Correct the ticket details on a show already on the household's list.
 *
 * Quantity and price are read out of a confirmation email when the receipt
 * exposes them, but plenty do not — a guest-list add has no price at all, and a
 * transfer has no order table. This is the manual path for those, and for the
 * cases where the heuristics guessed wrong.
 *
 * Passing `null` clears a field; omitting it leaves it alone.
 */
export async function setTicketDetails(
  eventId: string,
  input: { ticketQuantity?: number | null; priceCents?: number | null },
) {
  const { supabase, householdId } = await requireHousehold();

  const patch: Record<string, number | null> = {};

  if (input.ticketQuantity !== undefined) {
    const q = input.ticketQuantity;
    if (q !== null && (!Number.isInteger(q) || q < 1 || q > 100)) {
      return { ok: false as const, error: 'Ticket count must be between 1 and 100' };
    }
    patch.ticket_quantity = q;
  }

  if (input.priceCents !== undefined) {
    const p = input.priceCents;
    // 1,000,000 cents is $10,000 — comfortably above any real order, and low
    // enough to catch a dollars-entered-as-cents slip.
    if (p !== null && (!Number.isFinite(p) || p < 0 || p > 1_000_000)) {
      return { ok: false as const, error: 'That price does not look right' };
    }
    patch.price_cents = p === null ? null : Math.round(p);
  }

  if (Object.keys(patch).length === 0) return { ok: true as const };

  const { error } = await supabase
    .from('attendances')
    .update(patch)
    .eq('event_id', eventId)
    .eq('household_id', householdId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/event/${eventId}`);
  revalidatePath('/upcoming');
  revalidatePath('/archive');
  return { ok: true as const };
}

/** The household's shared note on a show. `user_id` records who last wrote it. */
export async function saveNote(eventId: string, body: string) {
  const { supabase, user, householdId } = await requireHousehold();

  if (body.trim() === '') {
    await supabase.from('notes').delete().eq('household_id', householdId).eq('event_id', eventId);
  } else {
    const { error } = await supabase
      .from('notes')
      .upsert(
        { user_id: user.id, household_id: householdId, event_id: eventId, body },
        { onConflict: 'household_id,event_id' },
      );
    if (error) return { ok: false as const, error: error.message };
  }

  revalidatePath(`/event/${eventId}`);
  return { ok: true as const };
}

/**
 * Rate a show, with an optional short review. One rating per show for the
 * household; it rides on the attendance row.
 *
 * Passing `null` as the rating clears both.
 */
export async function rateShow(eventId: string, rating: number | null, review?: string) {
  const { supabase, householdId } = await requireHousehold();

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
    .eq('household_id', householdId)
    .eq('event_id', eventId);

  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/event/${eventId}`);
  revalidatePath('/archive');
  return { ok: true as const };
}

// ---------------------------------------------------------------- household

/**
 * A link that brings someone into this household.
 *
 * Single-use and good for 14 days (`household_invites`). The existing unused
 * link is reused rather than minting one per click, so a URL already sent in a
 * text keeps working; `rotate` revokes it and makes a fresh one.
 */
export async function getHouseholdInviteUrl(rotate = false) {
  const { supabase, user, householdId } = await requireHousehold();
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  if (rotate) {
    await supabase.from('household_invites').delete().eq('household_id', householdId).is('used_at', null);
  } else {
    const { data: existing } = await supabase
      .from('household_invites')
      .select('token')
      .eq('household_id', householdId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return { ok: true as const, url: `${base}/join/${existing.token}` };
  }

  // 24 bytes of randomness, hex-encoded: the same shape as the calendar token.
  const token = randomBytes(24).toString('hex');
  const { error } = await supabase
    .from('household_invites')
    .insert({ token, household_id: householdId, created_by: user.id });
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/settings');
  return { ok: true as const, url: `${base}/join/${token}` };
}

/**
 * Join the household an invite link names. The database does the checking and
 * the merge in one transaction (`redeem_household_invite`): anything already in
 * the joiner's own household — shows, notes, Inbox — is folded in, with
 * duplicate shows merged rather than doubled.
 */
export async function joinHousehold(token: string) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase.rpc('redeem_household_invite', { invite_token: token });
  if (error) {
    const reason = /already used/.test(error.message)
      ? 'That invite link has already been used'
      : /expired/.test(error.message)
        ? 'That invite link has expired'
        : /not found/.test(error.message)
          ? 'That invite link is not valid'
          : 'Could not join that household';
    return { ok: false as const, error: reason };
  }

  const householdId = await getHouseholdId(supabase, user.id);
  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, profile:profiles ( display_name, handle )')
    .eq('household_id', householdId);

  const others = ((members ?? []) as unknown as { user_id: string; profile: { display_name: string; handle: string } | null }[])
    .filter((m) => m.user_id !== user.id)
    .map((m) => m.profile?.display_name || m.profile?.handle || 'someone');

  revalidatePath('/', 'layout');
  return { ok: true as const, others };
}

/** Rename the household ("Home" by default). */
export async function renameHousehold(name: string) {
  const { supabase, householdId } = await requireHousehold();
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return { ok: false as const, error: 'Give it a name' };

  const { error } = await supabase.from('households').update({ name: trimmed }).eq('id', householdId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/settings');
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

  revalidatePath('/settings');
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
 * Disconnect a Gmail inbox in one step — yours by default, or, with
 * `accountId`, either household member's (both are admins; RLS limits it to
 * the household).
 *
 * Deletes the stored tokens outright rather than flagging the row inactive —
 * there is no reason to keep an encrypted refresh token for a connection that
 * has just been revoked.
 */
export async function disconnectGmail(accountId?: string) {
  const { supabase, user } = await requireUser();

  let query = supabase.from('email_accounts').delete().eq('provider', 'gmail');
  query = accountId ? query.eq('id', accountId) : query.eq('user_id', user.id);
  const { error } = await query;

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

// ---------------------------------------------------------------- manual match

/**
 * A listing that might be the show the user is typing in by hand.
 *
 * Trimmed from `CatalogCandidate` on purpose: that carries the provider's whole
 * raw payload, which has no business crossing to the client.
 */
export interface ManualMatch {
  source: 'ticketmaster' | 'setlistfm';
  id: string;
  name: string;
  startsAt: string | null;
  /**
   * The show's date exactly as the listing states it, "2026-05-10". Render and
   * record THIS, never a date derived from `startsAt`: Ticketmaster's date-only
   * listings arrive as midnight UTC, which reads as the previous day anywhere
   * in the Americas.
   */
  localDate: string | null;
  venueName: string | null;
  city: string | null;
  confidence: number;
}

/** Below this a candidate is noise, and offering it costs the user a decision. */
const MANUAL_MATCH_FLOOR = 0.5;

/**
 * Look for the show the user is adding by hand, in ONE provider.
 *
 * The full `matchTicket` cascade is deliberately not reused here. Its own
 * documentation says the ordering is affordable "ONLY on the ingestion path":
 * Bandsintown is ~200 credits a month behind a 99/day cap and Spotify is 1,000
 * a month, and manual entry is by definition the case those two are least
 * likely to answer — `ManualEventForm` exists for "club nights, afterparties,
 * DIY bills". Spending the scarcest quota there would be backwards.
 *
 * So one provider, chosen by direction, and both are effectively free:
 *
 * - **Past** → setlist.fm. Purpose-built for shows that already happened, and
 *   free for non-commercial use.
 * - **Future** → Ticketmaster. 5,000 requests a day.
 *
 * Never applied automatically. The caller shows what came back and the user
 * decides — the matcher's own comments record a Kaskade ticket confidently
 * resolving to Coachella, and a wrong row propagates into Archive, the friend
 * feed and the artist catalog.
 */
export async function lookupManualShow(input: {
  artistName: string;
  venueName?: string;
  city?: string;
  region?: string;
  /** Local wall time, as the form has it. */
  startsAt: string;
  timezone?: string;
}) {
  await requireUser();

  const artistName = input.artistName.trim();
  if (!artistName || !input.startsAt) return { ok: true as const, matches: [] };

  // Same precedence as `createManualEvent`: the place first, the browser last.
  const zone = inferTimezone(input.region, null) ?? input.timezone ?? null;
  const startsAt = resolveManualStart(input.startsAt, zone);
  if (!startsAt) return { ok: true as const, matches: [] };

  const ticket: ParsedTicket = {
    artistName,
    venueName: input.venueName?.trim() || undefined,
    city: input.city?.trim() || undefined,
    region: input.region?.trim() || undefined,
    startsAt,
  };

  const isPast = new Date(startsAt).getTime() < Date.now();

  try {
    const candidates = isPast
      ? (await setlistfm.searchSetlists(artistName, startsAt, zone))
          .slice(0, 5)
          .map((sl) => fromSetlistFm(sl, artistName))
      : (await findCandidatesForTicket(ticket)).map(fromTicketmaster);

    const matches: ManualMatch[] = candidates
      .map((c) => ({ c, scored: scoreCandidate(ticket, c) }))
      .filter(({ scored }) => scored.confidence >= MANUAL_MATCH_FLOOR)
      .sort((a, b) => b.scored.confidence - a.scored.confidence)
      .slice(0, 3)
      .map(({ c, scored }) => ({
        source: c.source as 'ticketmaster' | 'setlistfm',
        id: c.id,
        name: c.artistName ?? c.name,
        startsAt: c.startsAt,
        localDate:
          c.source === 'ticketmaster'
            ? ((c.raw as { dates?: { start?: { localDate?: string } } }).dates?.start?.localDate ?? null)
            : // setlist.fm candidates are zone-less wall times, so the prefix IS the date.
              (c.startsAt?.slice(0, 10) ?? null),
        venueName: c.venueName,
        city: c.city,
        confidence: scored.confidence,
      }));

    return { ok: true as const, matches };
  } catch (err) {
    // A provider being down must never block adding a show by hand.
    console.error('lookupManualShow failed', err);
    return { ok: true as const, matches: [] };
  }
}

// ---------------------------------------------------------------- trmnl

/**
 * Returns the caller's TRMNL polling URL — the one pasted into a private
 * plugin's "Polling URL" field. Same handling as the calendar token: revoked
 * from the `authenticated` grant, so it is read server-side through the admin
 * client once we know who is asking.
 */
export async function getTrmnlUrl() {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data } = await admin
    .from('profiles')
    .select('trmnl_token')
    .eq('id', user.id)
    .maybeSingle();

  if (!data?.trmnl_token) return { ok: false as const, error: 'No TRMNL token' };

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  return { ok: true as const, url: `${base}/api/trmnl/${data.trmnl_token}` };
}

/**
 * Invalidates the old polling URL. The plugin keeps polling the dead one and
 * TRMNL renders its error state, so the display has to be repointed by hand —
 * which is the intended outcome of a rotation, not a bug.
 */
export async function rotateTrmnlToken() {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const token = randomBytes(24).toString('hex');
  const { error } = await admin
    .from('profiles')
    .update({ trmnl_token: token })
    .eq('id', user.id);

  if (error) return { ok: false as const, error: error.message };

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  revalidatePath('/settings');
  return { ok: true as const, url: `${base}/api/trmnl/${token}` };
}

// ---------------------------------------------------------------- inbox review

/** Confirm a low-confidence ingest candidate, creating the attendance for real. */
export async function confirmCandidate(candidateId: string) {
  const { supabase, user, householdId } = await requireHousehold();

  const { data: candidate } = await supabase
    .from('ingest_candidates')
    .select('id, matched_event_id, parsed')
    .eq('id', candidateId)
    .eq('household_id', householdId)
    .maybeSingle();

  if (!candidate) return { ok: false as const, error: 'Candidate not found' };
  if (!candidate.matched_event_id) {
    return { ok: false as const, error: 'No event matched - search for it in Browse instead' };
  }

  const admin = createAdminClient();
  const parsed = candidate.parsed as ParsedTicket;
  await recordAttendance(admin, {
    userId: user.id,
    eventId: candidate.matched_event_id,
    source: 'gmail',
    ticketRef: parsed.ticketRef,
    seatInfo: parsed.seatInfo,
    priceCents: parsed.priceCents,
    ticketQuantity: parsed.ticketQuantity,
    purchasedAt: parsed.purchasedAt,
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
  const { supabase, user, householdId } = await requireHousehold();

  const { data: candidate } = await supabase
    .from('ingest_candidates')
    .select('id, parsed, matched_event_id')
    .eq('id', candidateId)
    .eq('household_id', householdId)
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
    ticketQuantity: parsed.ticketQuantity,
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
  const { supabase, householdId } = await requireHousehold();
  await supabase
    .from('ingest_candidates')
    .update({ state: 'rejected' })
    .eq('id', candidateId)
    .eq('household_id', householdId);

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

// ---------------------------------------------------------------- account

/**
 * Delete the caller's account and everything belonging to them.
 *
 * Four things have to happen, and only the first is automatic:
 *
 * 1. **Database rows.** `auth.users` → `profiles` cascades to the rows that
 *    are personal: email accounts, push subscriptions, sent reminders,
 *    user_artists and household membership. Household rows
 *    (shows, notes, the shared Inbox) stay with the household — their
 *    `user_id` "added by" is nulled — and a household whose last member
 *    leaves is deleted with everything in it (`0025_household.sql`).
 *
 * 2. **The Google grant.** Cascading the row deletes our copy of the refresh
 *    token but leaves Stub listed in the user's Google account with
 *    `gmail.readonly` still granted. For a restricted scope that is not good
 *    enough, so the token is revoked at Google first.
 *
 * 3. **Storage.** Avatar objects live in the `avatars` bucket and are NOT
 *    reachable from any foreign key, so cascade does not touch them. They have
 *    to be removed explicitly or they outlive the account.
 *
 * 4. **Catalog rows are deliberately kept.** `artists`, `venues` and `events`
 *    are shared global facts, not personal data — a show still happened after
 *    someone leaves, and deleting them would corrupt other users' timelines.
 *
 * Ordering matters: revoke and clear storage BEFORE deleting the user, because
 * afterwards there is no row left to tell us which token or which files.
 */
export async function deleteAccount(confirmation: string) {
  const { user } = await requireUser();

  /*
   * Typed confirmation, checked server-side.
   *
   * A client-side-only check would be a UI nicety rather than a guard: this is
   * a server action, reachable by anyone who can call it with a session. The
   * cost of an accidental invocation is total and unrecoverable, so the intent
   * has to be proven where it cannot be skipped.
   */
  if (confirmation.trim().toUpperCase() !== 'DELETE') {
    return { ok: false as const, error: 'Type DELETE to confirm' };
  }

  const admin = createAdminClient();

  // 1. Revoke the Google grant while we can still read the token.
  const { data: accounts } = await admin
    .from('email_accounts')
    .select('refresh_token')
    .eq('user_id', user.id)
    .eq('provider', 'gmail');

  for (const account of accounts ?? []) {
    if (!account.refresh_token) continue;
    try {
      await revokeGoogleToken(decryptToken(account.refresh_token));
    } catch (err) {
      // A revoke failure must not strand the user in an undeletable account.
      // Their copy of the token is destroyed either way by the cascade below;
      // what survives is only the grant listed in their Google account, which
      // they can remove themselves.
      console.error('google token revoke failed during account deletion', err);
    }
  }

  // 2. Storage — not covered by any cascade.
  try {
    const { data: files } = await admin.storage.from('avatars').list(user.id);
    if (files?.length) {
      await admin.storage
        .from('avatars')
        .remove(files.map((f) => `${user.id}/${f.name}`));
    }
  } catch (err) {
    console.error('avatar cleanup failed during account deletion', err);
  }

  // 3. The user row, which cascades everything else.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('deleteAccount failed', error.message);
    return { ok: false as const, error: 'Could not delete the account' };
  }

  return { ok: true as const };
}

/**
 * Tell Google to drop the grant.
 *
 * Revoking a refresh token invalidates the whole grant, so Stub disappears from
 * the user's third-party access list rather than lingering with a restricted
 * scope attached. Google answers 200 on success and 400 for a token that is
 * already invalid, which is a no-op we can ignore.
 */
async function revokeGoogleToken(refreshToken: string): Promise<void> {
  const res = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }),
  });
  if (!res.ok && res.status !== 400) {
    throw new Error(`google revoke returned ${res.status}`);
  }
}
