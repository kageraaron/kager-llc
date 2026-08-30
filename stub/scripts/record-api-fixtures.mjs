#!/usr/bin/env node
/**
 * Record real provider responses to `test/fixtures/api/` so the test suite can
 * exercise the TRANSPORT layer without touching the network.
 *
 * ## Why this exists
 *
 * Three provider bugs in one day were all invisible to a green test suite, and
 * all for the same reason: the tests covered pure functions and the transport
 * was never exercised.
 *
 *  - Bandsintown was written against the Parse **MCP** envelope
 *    (`{ ok, result: { data } }`) and wired to the **REST** endpoint, which
 *    answers `{ status, data }`. Every call threw. `matchTicket` swallows a
 *    provider error, so the symptom was silence.
 *  - Spotify's batch `GET /artists?ids=` was removed for development-mode apps
 *    and answers 403, while the singular endpoint still works.
 *  - Development-mode artist objects no longer carry `genres` at all.
 *
 * Not one of those is visible in a normalizer unit test. All three are obvious
 * the moment a recorded response is replayed through the real client.
 *
 * ## Usage
 *
 *     node scripts/record-api-fixtures.mjs            # all providers
 *     node scripts/record-api-fixtures.mjs eventbrite # just one
 *
 * Reads keys from `.env.local`. Fixtures are committed; re-record when a
 * provider changes shape, and READ THE DIFF — a surprise there is the whole
 * point of the exercise.
 *
 * ## Secrets
 *
 * Responses are redacted before they are written (see `REDACT`), and endpoints
 * carrying personal data are deliberately not recorded: no Eventbrite
 * `/users/me`, no orders, no Gmail. Everything here is public catalog data.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'test/fixtures/api');

/** Field names whose values must never reach a committed file. */
const REDACT = new Set(['access_token', 'refresh_token', 'id_token', 'client_secret']);

/**
 * Env vars whose VALUES must never appear anywhere in a fixture — not in a
 * body, not in a URL, and not in a header.
 *
 * That last one is not hypothetical. Eventbrite echoes the private token back
 * in its `x-rate-limit` header (`token:<your key> 1/2000 reset=3600s`), so
 * recording the headers a client branches on leaked the key into a committed
 * file on the first run. Field-name redaction cannot catch that; scrubbing the
 * serialized output can.
 */
const SECRET_VARS = [
  'EVENTBRITE_API_KEY', 'PARSE_API_KEY', 'RAPID_API_KEY', 'TICKETMASTER_API_KEY',
  'JAMBASE_API_KEY', 'SETLISTFM_API_KEY', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PROD_SERVICE_ROLE_KEY', 'TOKEN_ENCRYPTION_KEY',
  'CRON_SECRET', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'INGEST_WEBHOOK_SECRET',
];

/**
 * Replace every known secret value in the serialized fixture, then verify none
 * survived. Throwing is the right failure: a leaked key in a committed file is
 * far worse than a missing fixture.
 */
function scrubSecrets(text) {
  let out = text;
  for (const name of SECRET_VARS) {
    const value = process.env[name];
    // Short values would match innocuous substrings; real keys are long.
    if (!value || value.length < 12) continue;
    out = out.split(value).join(`<redacted-${name}>`);
  }
  for (const name of SECRET_VARS) {
    const value = process.env[name];
    if (value && value.length >= 12 && out.includes(value)) {
      throw new Error(`refusing to write: ${name} survived scrubbing`);
    }
  }
  return out;
}

function loadEnv() {
  try {
    for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // Fine — the caller may have exported them already.
  }
}

/** Recursively blank anything sensitive, keeping the SHAPE intact. */
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        REDACT.has(k) ? `<redacted-${k}>` : redact(v),
      ]),
    );
  }
  return value;
}

/**
 * `transform` trims a recorded body before it is written.
 *
 * A full Spotify concerts response is ~280KB — 36 concerts, each with related
 * concerts and concept weights. Committing that makes the diff unreadable, which
 * defeats the point: the reason to commit a fixture is that you READ the diff
 * when it changes.
 */
async function record(name, url, init = {}, transform) {
  process.stdout.write(`  ${name} … `);
  try {
    const res = await fetch(url, init);
    const text = await res.text();

    let body;
    try {
      body = redact(JSON.parse(text));
      if (transform) body = transform(body);
    } catch {
      body = text.slice(0, 2000);
    }

    // The URL can carry a key in a query string; store only the path+query we
    // match on, never the headers we sent.
    const stored = {
      recordedAt: new Date().toISOString().slice(0, 10),
      url: url.replace(/([?&](?:api[_-]?key|key|apikey)=)[^&]+/gi, '$1<redacted>'),
      status: res.status,
      // Only the headers a client actually branches on.
      headers: Object.fromEntries(
        ['content-type', 'x-rate-limit', 'retry-after', 'x-ratelimit-requests-remaining']
          .map((h) => [h, res.headers.get(h)])
          .filter(([, v]) => v !== null),
      ),
      body,
    };

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      join(OUT_DIR, `${name}.json`),
      scrubSecrets(`${JSON.stringify(stored, null, 2)}\n`),
    );
    console.log(`${res.status} ✓`);
  } catch (err) {
    console.log(`FAILED — ${err.message}`);
  }
}

// ---------------------------------------------------------------- providers

/** The Monarch booking behind the original timezone bug, everywhere it appears. */
const EB_EVENT = '1998116550390';
const SPOTIFY_ARTIST = '2dPLkqesvPXpIlP65JoLrf'; // Silva Bumpa

const providers = {
  async eventbrite() {
    const key = process.env.EVENTBRITE_API_KEY;
    if (!key) return console.log('  (skipped — EVENTBRITE_API_KEY unset)');
    const h = { Authorization: `Bearer ${key}`, Accept: 'application/json' };

    await record(
      'eventbrite.event',
      `https://www.eventbriteapi.com/v3/events/${EB_EVENT}/?expand=venue`,
      { headers: h },
    );
    // Pins that public search is gone — if this stops being 404, Eventbrite
    // could answer "what's on near me" and belongs in Browse.
    await record(
      'eventbrite.search-removed',
      'https://www.eventbriteapi.com/v3/events/search/?q=music',
      { headers: h },
    );
    await record('eventbrite.event-not-found', 'https://www.eventbriteapi.com/v3/events/1/', {
      headers: h,
    });
  },

  async bandsintown() {
    const key = process.env.PARSE_API_KEY;
    if (!key) return console.log('  (skipped — PARSE_API_KEY unset)');
    const id = process.env.BANDSINTOWN_SCRAPER_ID || '25ccb7dd-ea12-4f2c-bb0a-966dbe1228e3';
    const h = { 'X-API-Key': key, Accept: 'application/json' };

    // THE one to keep. This is the REST envelope (`{status, data}`) that the
    // client was not reading, and it costs a credit to learn again.
    await record(
      'bandsintown.artist-events',
      `https://api.parse.bot/scraper/${id}/get_artist_events_by_name?artist_name=KETTAMA`,
      { headers: h },
    );
    await record(
      'bandsintown.past-events',
      `https://api.parse.bot/scraper/${id}/get_artist_past_events?artist=15142594-kettama`,
      { headers: h },
    );
  },

  async spotifyweb() {
    const id = process.env.SPOTIFY_CLIENT_ID;
    const secret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!id || !secret) return console.log('  (skipped — SPOTIFY_CLIENT_ID/SECRET unset)');

    const basic = Buffer.from(`${id}:${secret}`).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    const token = (await tokenRes.clone().json()).access_token;

    await record('spotifyweb.token', 'https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });

    const h = { Authorization: `Bearer ${token}` };
    await record('spotifyweb.artist', `https://api.spotify.com/v1/artists/${SPOTIFY_ARTIST}`, {
      headers: h,
    });
    // Pins the February 2026 removal: batch is 403, singular is 200.
    await record(
      'spotifyweb.artists-batch-forbidden',
      `https://api.spotify.com/v1/artists?ids=${SPOTIFY_ARTIST}`,
      { headers: h },
    );
  },

  async spotifyconcerts() {
    const key = process.env.RAPID_API_KEY;
    if (!key) return console.log('  (skipped — RAPID_API_KEY unset)');

    // Records the Spanish lineup title we cannot turn off.
    await record(
      'spotifyconcerts.artist-search',
      'https://spotify81.p.rapidapi.com/partner/search-concert-artists?query=Silva%20Bumpa&details=true&parsed=true',
      { headers: { 'x-rapidapi-host': 'spotify81.p.rapidapi.com', 'x-rapidapi-key': key } },
      // Keep the Monarch booking (the Spanish multi-act title), one single-act
      // show, and one festival. That is every shape `normalizeConcert` branches
      // on, at 2% of the size.
      (body) => {
        const all = body?.data?.concerts?.concerts ?? [];
        const keep = [
          all.find((c) => c.venueName === 'Monarch'),
          all.find((c) => (c.artists ?? []).length === 1 && !c.festival),
          all.find((c) => c.festival),
        ].filter(Boolean);
        for (const c of keep) {
          // `relatedConcerts` is pure noise for our purposes and most of the bytes.
          if (c.details) delete c.details.relatedConcerts;
        }
        return { ...body, data: { ...body.data, concerts: { concerts: keep } } };
      },
    );
  },
};

// ---------------------------------------------------------------- main

loadEnv();
const only = process.argv[2];
const names = only ? [only] : Object.keys(providers);

for (const name of names) {
  if (!providers[name]) {
    console.error(`Unknown provider "${name}". Known: ${Object.keys(providers).join(', ')}`);
    process.exit(1);
  }
  console.log(`\n${name}`);
  await providers[name]();
}
console.log(`\nWrote to ${OUT_DIR}`);
