import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inferTimezone } from '@/lib/timezone';
import { getArtistMetadata, isAppConfigured } from '@/lib/providers/spotify';
import { findArtistImage } from '@/lib/providers/artistImages';
import { getArtistLinks, resolveMbid } from '@/lib/providers/musicbrainz';
import { proposeCleanName } from '@/lib/ingest/cleanupNames';
import { pickHeadlinerName, normName } from '@/lib/ingest/catalog';

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
 * **6. Junk artist names.** Rows created by "Add it anyway", which uses the
 * email's parsed name for both the event and the artist — so a poor parse lands
 * twice. These have no provider to ask (that is why they exist), so the repair
 * only ever subtracts recognised noise. See `ingest/cleanupNames`.
 *
 * **7. Wrong headliners.** Ticketmaster's attraction list is ordered arbitrarily
 * and often omits the headliner, so events written before `pickHeadlinerName`
 * show a SUPPORT act on the card. The artist parsed from the user's own ticket
 * is the corrective, and it is already stored on the candidate.
 *
 * **8. Review cards for shows already added.** A pending candidate whose show
 * has since been confirmed from another email is a question with a known
 * answer. Deduplication stops new ones arising; this clears the ones that
 * predate it.
 *
 * **9. Duplicate events.** Two people at the same gig must point at ONE event
 * row or the friends tab cannot connect them. Manual adds used to skip
 * reconciliation entirely, so the same night exists twice.
 *
 * Every pass only fills a null, subtracts known noise, or rewrites a title that
 * is demonstrably a lineup join. Nothing a human typed is touched.
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
    namesCleaned: 0,
    namesMerged: 0,
    eventNamesCleaned: 0,
    headlinersFixed: 0,
    supersededCards: 0,
    eventsMerged: 0,
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

  /*
   * ---- 6. Junk artist names.
   *
   * Runs LAST so a renamed artist is picked up by the identity and image passes
   * on the NEXT run rather than being enriched under its old, wrong name.
   */
  const { data: allArtists } = await admin.from('artists').select('id, name, image_url');

  for (const artist of allArtists ?? []) {
    if (!artist.name) continue;
    const cleaned = proposeCleanName(artist.name);
    if (!cleaned) continue;

    /*
     * The clean name may already exist — "Eric Prydz - Artist Presale" and a
     * properly-parsed "Eric Prydz" can both be in the catalog. Renaming into it
     * would create a duplicate of exactly the kind `0021` just merged away, so
     * fold into the incumbent instead.
     */
    const { data: existing } = await admin
      .from('artists')
      .select('id, image_url')
      .ilike('name', cleaned)
      .neq('id', artist.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      await admin.from('events').update({ headliner_id: existing.id }).eq('headliner_id', artist.id);

      // Composite keys: insert-then-delete, never update — see `0021`.
      const { data: links } = await admin
        .from('event_artists')
        .select('event_id, billing')
        .eq('artist_id', artist.id);
      for (const l of links ?? []) {
        await admin
          .from('event_artists')
          .upsert(
            { event_id: l.event_id, artist_id: existing.id, billing: l.billing },
            { onConflict: 'event_id,artist_id', ignoreDuplicates: true },
          );
      }
      await admin.from('event_artists').delete().eq('artist_id', artist.id);
      await admin.from('user_artists').delete().eq('artist_id', artist.id);

      if (!existing.image_url && artist.image_url) {
        await admin.from('artists').update({ image_url: artist.image_url }).eq('id', existing.id);
      }
      await admin.from('artists').delete().eq('id', artist.id);
      fixed.namesMerged++;
      continue;
    }

    /*
     * Rename in place, and clear the enrichment markers: the identity and photo
     * resolved under the old name are about the wrong thing, and the next run
     * should look again under the corrected one.
     */
    const { error } = await admin
      .from('artists')
      .update({ name: cleaned, identity_checked_at: null, image_url: null })
      .eq('id', artist.id);
    if (error) {
      console.error('name cleanup failed', { id: artist.id, error: error.message });
      continue;
    }

    // The event usually carries the same junk string, for the same reason.
    await admin.from('events').update({ name: cleaned }).eq('name', artist.name);
    fixed.namesCleaned++;
  }

  /*
   * Event names are cleaned SEPARATELY, not only alongside their artist.
   *
   * The two drift apart. A re-scan can fix the artist — "Eric Prydz - Artist
   * Presale" became "Eric Prydz" once the suffix rule was broadened — while the
   * event row, written earlier, keeps the old string and shows it as the
   * subtitle on the event page. By then there is no artist with the junk name
   * left to key off.
   */
  const { data: allEvents } = await admin.from('events').select('id, name');

  for (const event of allEvents ?? []) {
    if (!event.name) continue;
    const cleaned = proposeCleanName(event.name);
    if (!cleaned) continue;

    const { error } = await admin.from('events').update({ name: cleaned }).eq('id', event.id);
    if (!error) fixed.eventNamesCleaned++;
  }

  /*
   * ---- 7. Headliners that are actually the support act.
   *
   * Re-decides using exactly the inputs `upsertEvent` now uses — the event name
   * and the artist off the ticket — but from stored data, so it repairs rows
   * without re-ingesting the email (which is skipped anyway once the user has
   * acted on it).
   */
  const { data: matched } = await admin
    .from('ingest_candidates')
    .select('matched_event_id, parsed')
    .not('matched_event_id', 'is', null)
    .in('state', ['pending', 'confirmed']);

  // Several candidates can point at one event; the shortest artist name is the
  // least likely to still carry a production suffix.
  const ticketArtist = new Map<string, string>();
  for (const c of matched ?? []) {
    const parsed = c.parsed as { artistName?: string };
    const name = parsed?.artistName?.trim();
    if (!name) continue;
    const key = c.matched_event_id as string;
    const prior = ticketArtist.get(key);
    if (!prior || name.length < prior.length) ticketArtist.set(key, name);
  }

  for (const [eventId, artistName] of ticketArtist) {
    const { data: event } = await admin
      .from('events')
      .select('id, name, headliner_id, artists!events_headliner_id_fkey ( name )')
      .eq('id', eventId)
      .maybeSingle();
    if (!event) continue;

    const current = (event.artists as { name?: string } | null)?.name ?? null;
    const { data: lineup } = await admin
      .from('event_artists')
      .select('artists ( name )')
      .eq('event_id', eventId);

    const attractionNames = (lineup ?? [])
      .map((l) => (l.artists as { name?: string } | null)?.name)
      .filter((n): n is string => !!n);

    const shouldBe = pickHeadlinerName(event.name ?? '', attractionNames, artistName);
    if (!shouldBe) continue;

    /*
     * Compare NORMALIZED, not exact.
     *
     * Ticketmaster styles an act "Fred again..", our email parse gives
     * "Fred Again". Same artist, and the provider's spelling is the better one
     * — an exact comparison would "fix" it into the worse version. This only
     * matters when the lineup rows are missing, since a present attraction
     * already wins on the same normalization inside `pickHeadlinerName`.
     */
    if (normName(shouldBe) === normName(current ?? '')) continue;

    const artistId = await ensureArtist(admin, shouldBe);
    if (!artistId || artistId === event.headliner_id) continue;

    const { error } = await admin
      .from('events')
      .update({ headliner_id: artistId })
      .eq('id', eventId);
    if (error) continue;

    await admin
      .from('event_artists')
      .upsert(
        { event_id: eventId, artist_id: artistId, billing: 'headliner' },
        { onConflict: 'event_id,artist_id', ignoreDuplicates: true },
      );
    fixed.headlinersFixed++;
  }

  /*
   * ---- 8. Pending review cards for a show already added.
   *
   * One gig produces several emails, and before deduplication existed each one
   * became its own card. A real inbox kept two "Kaskade -> Coachella" cards
   * from 01:33 alongside the correct "Kaskade -> Pier 48" the user had already
   * confirmed at 19:42 — the same show, asked three times, twice wrongly.
   *
   * `ingestEmail` now merges on `dedupe_key` before inserting, so no new ones
   * arise. This clears the backlog.
   */
  const { data: confirmed } = await admin
    .from('ingest_candidates')
    .select('user_id, dedupe_key')
    .eq('state', 'confirmed')
    .not('dedupe_key', 'is', null);

  /*
   * Keyed by USER as well as show. One person adding a gig says nothing about
   * whether the other went — a real pair of accounts had the same Kaskade
   * night confirmed on one and still pending on the other, correctly.
   */
  const settled = new Set((confirmed ?? []).map((c) => `${c.user_id}::${c.dedupe_key}`));

  const { data: stillPending } = await admin
    .from('ingest_candidates')
    .select('id, message_id, user_id, dedupe_key, confidence, created_at')
    .eq('state', 'pending')
    .not('dedupe_key', 'is', null)
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false });

  /*
   * Two reasons to drop a pending card, both from the era before
   * deduplication: the show has since been confirmed from another email, or
   * another PENDING card already asks the same question. The best of the
   * duplicates is kept — highest confidence, then most recent, which is the one
   * read by the newest extractors.
   */
  const keptPending = new Set<string>();

  for (const card of stillPending ?? []) {
    const key = `${card.user_id}::${card.dedupe_key}`;

    if (!settled.has(key)) {
      if (!keptPending.has(key)) {
        keptPending.add(key);
        continue;
      }
    }

    // Drop the card, but keep the message as the record of what was read —
    // flagged so the Inbox's "read but yielded nothing" list stays honest.
    const { error } = await admin.from('ingest_candidates').delete().eq('id', card.id);
    if (error) continue;

    if (card.message_id) {
      await admin
        .from('ingest_messages')
        .update({ status: 'duplicate_event' })
        .eq('id', card.message_id);
    }
    fixed.supersededCards++;
  }

  /*
   * ---- 9. Duplicate events for the same show.
   *
   * The pair that prompted this differed by SEVEN HOURS in stored value —
   * `2026-09-26 22:00` and `2026-09-27 05:00` are the same instant, one written
   * as naive local time from an email and one as a real UTC instant from
   * Ticketmaster. Same venue, same night, two rows, and neither user could see
   * the other was going.
   *
   * Same conservative rule as `reconcileEvent`: same venue AND within 12 hours.
   * The survivor is the row a PROVIDER wrote, which carries artwork, a real
   * timezone and a ticket URL that a hand-made row does not.
   */
  const { data: dupCandidates } = await admin
    .from('events')
    .select('id, name, venue_id, starts_at, headliner_id, tm_id, jambase_id, spotify_concert_id, bandsintown_id, eventbrite_id, image_url, url, timezone')
    .not('venue_id', 'is', null)
    .order('starts_at', { ascending: true });

  const seen: typeof dupCandidates = [];
  for (const ev of dupCandidates ?? []) {
    const twin = (seen ?? []).find(
      (s2) =>
        s2.venue_id === ev.venue_id &&
        Math.abs(new Date(s2.starts_at).getTime() - new Date(ev.starts_at).getTime()) <=
          12 * 3_600_000 &&
        // Same guard as `reconcileEvent`: a disagreeing headliner means two
        // different bands at one club on one night, not a duplicate.
        (!s2.headliner_id || !ev.headliner_id || s2.headliner_id === ev.headliner_id),
    );

    if (!twin) {
      seen!.push(ev);
      continue;
    }

    const hasProvider = (e: typeof ev) =>
      !!(e.tm_id || e.jambase_id || e.spotify_concert_id || e.bandsintown_id || e.eventbrite_id);
    const [winner, loser] = hasProvider(ev) && !hasProvider(twin) ? [ev, twin] : [twin, ev];

    const merged = await mergeEvents(admin, winner.id, loser.id);
    if (merged) {
      fixed.eventsMerged++;
      if (winner === ev) {
        seen!.splice(seen!.indexOf(twin), 1, ev);
      }
    }
  }

  return NextResponse.json({ ok: true, ...fixed });
}

/**
 * Fold one event row into another, repointing everything that references it.
 *
 * Seven tables point at `events`, and five of them CASCADE on delete — so the
 * order matters absolutely: repoint first, delete last. Getting it backwards
 * silently destroys attendances, which are the only record that someone went.
 *
 * `attendances`, `notes` and `sent_reminders` all carry a unique key including
 * `event_id`, so a repoint can collide with a row the winner already has. Those
 * use insert-then-delete rather than update, the same shape as `0021`.
 */
async function mergeEvents(
  db: ReturnType<typeof createAdminClient>,
  winnerId: string,
  loserId: string,
): Promise<boolean> {
  // Attendances: keep the winner's if both users have one, else move it over.
  const { data: losing } = await db.from('attendances').select('*').eq('event_id', loserId);
  for (const att of losing ?? []) {
    const { data: already } = await db
      .from('attendances')
      .select('id')
      .eq('event_id', winnerId)
      .eq('user_id', att.user_id)
      .limit(1)
      .maybeSingle();

    if (already) continue;
    const { id: _drop, event_id: _drop2, ...rest } = att;
    await db.from('attendances').insert({ ...rest, event_id: winnerId });
  }
  await db.from('attendances').delete().eq('event_id', loserId);

  for (const table of ['notes', 'sent_reminders', 'event_invites'] as const) {
    const { data: rows } = await db.from(table).select('*').eq('event_id', loserId);
    for (const r of rows ?? []) {
      const { id: _drop, event_id: _drop2, ...rest } = r as Record<string, unknown> & { id?: string };
      await db.from(table).insert({ ...rest, event_id: winnerId });
    }
    await db.from(table).delete().eq('event_id', loserId);
  }

  const { data: lineup } = await db.from('event_artists').select('artist_id, billing').eq('event_id', loserId);
  for (const l of lineup ?? []) {
    await db
      .from('event_artists')
      .upsert({ event_id: winnerId, artist_id: l.artist_id, billing: l.billing }, {
        onConflict: 'event_id,artist_id',
        ignoreDuplicates: true,
      });
  }

  await db.from('ingest_candidates').update({ matched_event_id: winnerId }).eq('matched_event_id', loserId);

  const { error } = await db.from('events').delete().eq('id', loserId);
  if (error) {
    console.error('event merge failed', { winnerId, loserId, error: error.message });
    return false;
  }
  return true;
}

/** Find an artist by name, or create one. Mirrors the catalog's name path. */
async function ensureArtist(
  db: ReturnType<typeof createAdminClient>,
  name: string,
): Promise<string | null> {
  const { data: existing } = await db
    .from('artists')
    .select('id')
    .ilike('name', name)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db.from('artists').insert({ name }).select('id').single();
  return error ? null : data.id;
}
