import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inferTimezone } from '@/lib/timezone';
import { getArtistMetadata, isAppConfigured } from '@/lib/providers/spotify';
import { findArtistImage } from '@/lib/providers/artistImages';
import { getArtistLinks, resolveMbid } from '@/lib/providers/musicbrainz';

/**
 * One-off repairs for catalog rows written before a provider bug was fixed.
 *
 * Re-ingesting the source email is NOT a way to fix these: ingestion dedupes on
 * a content hash, so a confirmation that has already been read is skipped
 * forever. The rows have to be repaired in place.
 *
 * Manual trigger only — no schedule. Every pass is idempotent and narrow enough
 * to run twice safely, but there is no reason to run it on a timer.
 *
 * ## What it fixes
 *
 * **1. Missing event timezones.** The Spotify concerts path wrote
 * `timezone: null` on every row, because the payload carries a UTC offset
 * rather than an IANA zone. The UI renders a zone-less event in the RUNTIME's
 * zone, which on Vercel is UTC, so a 22:00 San Francisco show stored correctly
 * as `2026-09-28T05:00:00Z` displayed as "Mon, Sep 28 · 5:00 AM". The instant
 * was right the whole time; only the zone to render it in was missing.
 *
 * **2. Localized lineup titles.** Spotify builds a multi-act title server-side
 * and localizes it from `Accept-Language`; the proxy we read it through is
 * pinned to Spanish and offers no way to override that. So a San Francisco
 * booking arrived titled "Silva Bumpa y Dean Turnley". New rows are rebuilt
 * from the lineup at write time; these are the ones already stored.
 *
 * **3. Missing artist artwork.** An artist with a `spotify_artist_id` but no
 * image falls back to initials on every card. Spotify's own Web API can supply
 * one, via client credentials — no user, no consent. Skipped entirely when
 * `SPOTIFY_CLIENT_ID`/`SECRET` are unset, and it costs one request per artist
 * (February 2026 removed the batch endpoint for development-mode apps), so it
 * asks only about artists that have no picture at all.
 *
 * **4. Artists with no Spotify id at all.** Most of the catalog, in practice —
 * a Bandsintown or setlist.fm row carries a bare name. Those are looked up by
 * NAME against free sources (Deezer, then Spotify search), which is the only
 * way a club-circuit act ever gets a face. See `providers/artistImages`.
 *
 * **4. Artist identity, from MusicBrainz.** Resolves an artist to their real
 * accounts on other platforms and stores the ids, so later lookups are exact
 * instead of fuzzy name searches.
 *
 * **5. Artist photos**, using those ids where they exist and a name search
 * where they do not. Deliberately ordered after identity: a Deezer id turns the
 * photo lookup from a guess into an exact fetch, and it only exists once pass 4
 * has run.
 *
 * Every pass only fills a null or rewrites a title that is demonstrably a
 * lineup join, so nothing a human entered is touched.
 */

export const maxDuration = 60;

/**
 * Artists to look up per run. Deezer allows 50 requests / 5 seconds, so this is
 * nowhere near its limit — the constraint is the 60-second function budget.
 * Whatever is left over is picked up next run, since the filter is simply
 * "still has no image".
 */
const MAX_IMAGE_LOOKUPS = 60;

/**
 * Artists to resolve against MusicBrainz per run.
 *
 * MusicBrainz allows **one request per second** and resolution costs two (a
 * name search, then a relations fetch), so this is the hard ceiling on how long
 * the pass can take: 15 artists is roughly 30 seconds, which fits inside the
 * function budget alongside everything else. `identity_checked_at` makes it
 * resumable — the next run takes the next fifteen.
 */
const MAX_IDENTITY_LOOKUPS = 15;

/** Same separator set as the provider's `titleFor`, for the same reason. */
const TITLE_SEPARATORS =
  /\s*(?:,|&|\+|\band\b|\by\b|\be\b|\bet\b|\bund\b|\ben\b|\bi\b|\boch\b|\bog\b|\bja\b|\bmed\b)\s*/gi;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const fixed = {
    venueZones: 0,
    eventZones: 0,
    titles: 0,
    artists: 0,
    artistsSkipped: false,
    imagesByName: 0,
    imagesTried: 0,
    identityResolved: 0,
    identityTried: 0,
    imagesFromId: 0,
  };

  // ---- 1a. Venue zones, derived from the region we already store.
  const { data: venues } = await admin
    .from('venues')
    .select('id, region, country')
    .is('timezone', null)
    .not('region', 'is', null);

  for (const venue of venues ?? []) {
    const zone = inferTimezone(venue.region, venue.country);
    if (!zone) continue;
    const { error } = await admin
      .from('venues')
      .update({ timezone: zone })
      .eq('id', venue.id)
      .is('timezone', null);
    if (!error) fixed.venueZones++;
  }

  // ---- 1b. Event zones, taken from the venue. Runs after 1a so it benefits
  //          from the zones just derived.
  const { data: events } = await admin
    .from('events')
    .select('id, venue:venues ( timezone, region, country )')
    .is('timezone', null)
    .not('venue_id', 'is', null);

  type EventWithVenue = {
    id: string;
    venue: { timezone: string | null; region: string | null; country: string | null } | null;
  };

  for (const event of (events ?? []) as unknown as EventWithVenue[]) {
    const zone =
      event.venue?.timezone ?? inferTimezone(event.venue?.region, event.venue?.country);
    if (!zone) continue;
    const { error } = await admin
      .from('events')
      .update({ timezone: zone })
      .eq('id', event.id)
      .is('timezone', null);
    if (!error) fixed.eventZones++;
  }

  // ---- 2. Titles that are nothing but a localized lineup join.
  //
  // Scoped to Spotify-sourced rows: they are the only ones whose title is
  // GENERATED rather than written by a promoter. The billed acts come from
  // `event_artists`, which is the same lineup the title was built from.
  const { data: spotifyEvents } = await admin
    .from('events')
    .select('id, name, event_artists ( artists ( name ) )')
    .not('spotify_concert_id', 'is', null);

  type EventWithLineup = {
    id: string;
    name: string;
    event_artists: { artists: { name: string } | null }[];
  };

  for (const event of (spotifyEvents ?? []) as unknown as EventWithLineup[]) {
    const names = event.event_artists
      .map((ea) => ea.artists?.name)
      .filter((n): n is string => !!n);
    if (names.length < 2) continue;

    const parts = event.name.split(TITLE_SEPARATORS).map((p) => p.trim()).filter(Boolean);
    if (parts.length !== names.length) continue;

    const billed = new Set(names.map(norm));
    if (!parts.every((p) => billed.has(norm(p)))) continue;

    /*
     * `event_artists` has no billing ORDER, only a headliner flag, so rebuild
     * in the order the stored title already used. That preserves the promoter's
     * billing and changes nothing but the conjunction.
     */
    const inTitleOrder = parts.map((p) => names.find((n) => norm(n) === norm(p))!);
    const rebuilt = joinNames(inTitleOrder);
    if (rebuilt === event.name) continue;

    const { error } = await admin.from('events').update({ name: rebuilt }).eq('id', event.id);
    if (!error) fixed.titles++;
  }

  // ---- 3. Artist artwork and genres, from Spotify's own Web API.
  //
  // Only rows that already carry a Spotify artist id, and only where something
  // is actually missing — this never overwrites artwork another provider set.
  if (!isAppConfigured()) {
    fixed.artistsSkipped = true;
  } else {
    const { data: needs } = await admin
      .from('artists')
      .select('id, spotify_artist_id')
      .not('spotify_artist_id', 'is', null)
      .is('image_url', null);

    const metadata = await getArtistMetadata(
      (needs ?? []).map((a) => a.spotify_artist_id as string),
    );

    for (const artist of needs ?? []) {
      const meta = metadata.get(artist.spotify_artist_id as string);
      if (!meta?.imageUrl) continue;

      const { error } = await admin
        .from('artists')
        .update({ image_url: meta.imageUrl })
        .eq('id', artist.id)
        .is('image_url', null);
      if (!error) fixed.artists++;
    }
  }

  /*
   * ---- 4. Artist identity, from MusicBrainz.
   *
   * `identity_checked_at` is set on every attempt, successful or not. Without
   * that the pass cannot distinguish "MusicBrainz has no entry for this artist"
   * from "not looked at yet", and would re-query the same unresolvable names
   * every run — at one request per second, forever.
   */
  /*
   * Never checked, or checked long enough ago to be worth revisiting —
   * MusicBrainz is a wiki, so an artist absent today may be added next month.
   * The index on `identity_checked_at nulls first` serves this ordering.
   */
  const recheckBefore = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: unresolved } = await admin
    .from('artists')
    .select('id, name, mbid, spotify_artist_id, deezer_artist_id')
    .or(`identity_checked_at.is.null,identity_checked_at.lt.${recheckBefore}`)
    .order('identity_checked_at', { ascending: true, nullsFirst: true })
    .limit(MAX_IDENTITY_LOOKUPS);

  for (const artist of unresolved ?? []) {
    if (!artist.name) continue;
    fixed.identityTried++;

    // Ticketmaster hands us an MBID directly for some artists; only pay for a
    // name search when we do not already have one.
    const mbid = artist.mbid ?? (await resolveMbid(artist.name));
    const links = mbid ? await getArtistLinks(mbid) : null;

    const patch: Record<string, unknown> = { identity_checked_at: new Date().toISOString() };
    if (mbid && !artist.mbid) patch.mbid = mbid;
    if (links) {
      patch.links = links;
      /*
       * Only ever FILL these, never overwrite. Both columns carry a partial
       * unique index, so writing an id another artist already holds fails the
       * whole update — and a provider that set one directly had better evidence
       * than a name search does.
       */
      if (links.deezerArtistId && !artist.deezer_artist_id) {
        patch.deezer_artist_id = links.deezerArtistId;
      }
      if (links.spotifyArtistId && !artist.spotify_artist_id) {
        patch.spotify_artist_id = links.spotifyArtistId;
      }
      fixed.identityResolved++;
    }

    const { error } = await admin.from('artists').update(patch).eq('id', artist.id);
    if (error) console.error('identity update failed', { id: artist.id, error: error.message });
  }

  /*
   * ---- 5. Artist photos, from free sources.
   *
   * Runs AFTER identity resolution on purpose. Pass 4 may have just stored a
   * Deezer id for these very artists, and with one the lookup below becomes an
   * exact fetch instead of a name search — no `namesMatch`, no chance of the
   * wrong face. Running images first would waste that on every new artist,
   * since the id only lands a pass later.
   *
   * Bounded per run, and resumable: the filter is "still has no image", so the
   * next run continues where this one stopped.
   */
  const { data: faceless } = await admin
    .from('artists')
    .select('id, name, deezer_artist_id, spotify_artist_id')
    .is('image_url', null)
    .limit(MAX_IMAGE_LOOKUPS);

  for (const artist of faceless ?? []) {
    if (!artist.name) continue;
    fixed.imagesTried++;

    // A stored Deezer id makes this an exact fetch with no name matching at all.
    const found = await findArtistImage(artist.name, {
      deezerArtistId: artist.deezer_artist_id,
      spotifyArtistId: artist.spotify_artist_id,
    });
    if (!found) continue;
    if (artist.deezer_artist_id) fixed.imagesFromId++;

    const { error } = await admin
      .from('artists')
      .update({ image_url: found.url })
      .eq('id', artist.id)
      .is('image_url', null);
    if (!error) fixed.imagesByName++;
  }

  return NextResponse.json({ ok: true, ...fixed });
}
