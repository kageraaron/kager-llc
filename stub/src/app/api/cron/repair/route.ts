import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inferTimezone } from '@/lib/timezone';
import { getArtistMetadata, isAppConfigured } from '@/lib/providers/spotify';
import { findArtistImage } from '@/lib/providers/artistImages';

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
   * ---- 4. Artist photos by NAME, from free sources.
   *
   * Runs after pass 3, so anything the Spotify id path already resolved is
   * skipped. Bounded per run: this is a memory app's cosmetic layer, not
   * something worth spending the whole function budget on, and the next run
   * picks up where this one stopped because the filter is "still has no image".
   */
  const { data: faceless } = await admin
    .from('artists')
    .select('id, name')
    .is('image_url', null)
    .limit(MAX_IMAGE_LOOKUPS);

  for (const artist of faceless ?? []) {
    if (!artist.name) continue;
    fixed.imagesTried++;

    const found = await findArtistImage(artist.name);
    if (!found) continue;

    const { error } = await admin
      .from('artists')
      .update({ image_url: found.url })
      .eq('id', artist.id)
      .is('image_url', null);
    if (!error) fixed.imagesByName++;
  }

  return NextResponse.json({ ok: true, ...fixed });
}
