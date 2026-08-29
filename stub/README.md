# Stub

Concert tracker with automatic ticket detection. Where the Shop app scans your
inbox for tracking numbers, Stub scans it for **ticket confirmations** and
populates the shows you're going to — with manual add as the fallback when it
can't read one.

Next.js PWA, installable to the iOS home screen. Runs on free tiers end to end.

## What's here

| Area | Status |
|---|---|
| Google sign-in + email magic link | Built |
| Profiles, avatars, bio, friends | Built |
| Artist & event search (4 providers, cost-ordered) | Built |
| Upcoming / Archive tabs, manual add | Built |
| Private notes (owner-only, enforced in RLS) | Built |
| Friends-going on events | Built |
| Gmail scanning + review Inbox | Built |
| Forward-to-inbox address | Built, **switched off** — needs a domain |
| Bandsintown deep search + detail enrichment | Built — needs a Parse key |
| setlist.fm archive import | Built |
| Spotify favorites import | Built, capped at 5 users by Spotify |
| Web push day-before reminders | Built — add VAPID keys to send |
| Sign in with Apple, Apple Music import | **Not built** — needs paid Apple Developer |

## Three constraints worth knowing before you start

1. **Gmail's `gmail.readonly` is a restricted scope.** Production use requires
   Google verification plus an annual CASA Tier 2 assessment. Stub stays in OAuth
   **Testing** mode instead, which allows restricted scopes for up to **100
   explicitly listed test users** with no assessment. That's a hard cap.
2. **Spotify is not a sign-in provider here.** Since Feb 2026 a development-mode
   Spotify app is capped at **5 authorized users** and requires the developer to
   hold Premium. Using it for auth would cap the whole app at five people, so it's
   an optional import connection only.
3. **Apple needs $99/yr.** Sign in with Apple and MusicKit both require an active
   Apple Developer Program membership. Both are stubbed with TODOs.

## Setup

**See [SETUP.md](./SETUP.md) for click-by-click cloud Supabase setup** — about
10 minutes, no Docker. The short version:

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run dev
```

### 1. Supabase

Create a project, then run the migrations in order:

```bash
supabase link --project-ref <ref>
supabase db push               # applies supabase/migrations/*.sql
```

Copy the project URL, anon key, and service role key into `.env.local`.

In **Authentication → Providers**, enable Google and paste in your Google OAuth
client ID/secret. Add `<site>/auth/callback` to the provider's redirect list.

### 2. Token encryption key

```bash
openssl rand -base64 32        # -> TOKEN_ENCRYPTION_KEY
```

OAuth tokens are AES-256-GCM encrypted before they touch the database.

### 3. Ticketmaster

Free key, issued instantly at <https://developer.ticketmaster.com>.
5000 calls/day, 5 req/s.

### 4. Google OAuth (for Gmail scanning)

In Google Cloud Console → APIs & Services:

1. Enable the **Gmail API**.
2. Create an **OAuth client ID** (Web application).
3. Authorized redirect URI: `<site>/api/connect/gmail/callback`
4. On the consent screen, keep publishing status at **Testing** and add every
   user's Google account to the **Test users** list. Restricted scopes work here
   without review; they do not work in Production without a CASA assessment.

### 5. Seed the test accounts

```bash
supabase db reset          # runs migrations, then supabase/seed.sql
```

Or paste `supabase/seed.sql` into the SQL editor of a throwaway cloud project.
It creates five accounts, all password `stubdemo123`:

| Email | Handle | Role |
|---|---|---|
| `demo@stub.local` | `@you` | **sign in as this one** |
| `marisol@stub.local` | `@marisol` | friend |
| `dev@stub.local` | `@dev_okafor` | friend |
| `quinn@stub.local` | `@quinn` | friend |
| `sasha@stub.local` | `@sasha_lin` | **not** a friend — has a pending request to you |

The first four are mutually friends (all six pairs accepted). Sasha exists to
prove the negative case: she is going to a show you are going to, and must
never appear in your friend stack.

Several accounts have private notes reading **"IF YOU CAN READ THIS, RLS IS
BROKEN."** on shows you also attend. If that string ever renders in your UI,
the privacy model has failed — you will see it without running anything.

The seed is idempotent on fixed UUIDs and safe to re-run. **Never point it at a
database with real data.**

### 6. Optional

- **setlist.fm** key: <https://www.setlist.fm/settings/api> — enables archive import.
- **Bandsintown** via Parse: create a key at <https://parse.bot/settings>, set
  `PARSE_API_KEY`, and subscribe to the `bandsintown-com-api` listing. Enables
  the "Search harder" button and detail enrichment. **Check the balance first** —
  it is a small prepaid credit pool, not a monthly free tier, so leave
  `BANDSINTOWN_DAILY_CREDITS` at 25 unless you know yours refills.
- **Spotify**: create an app, add `<site>/api/connect/spotify/callback` as a
  redirect URI. Remember the 5-user ceiling.
- **Forward address**: see `workers/email-router/README.md`. Needs a domain on
  Cloudflare; until then leave `FEATURE_FORWARD_INBOX=false`.
- **Push reminders**: `npx web-push generate-vapid-keys`, then set
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`. On iOS these only
  reach users who added Stub to their home screen (16.4+).

## The provider architecture

Four event providers, none of them complete, all of them metered differently.
This section is the reasoning behind which one gets asked what, and in what
order — it is the part of the codebase most likely to be changed by someone who
hasn't measured the trade-offs, so the measurements are written down.

### What each one costs, and what it is actually good at

| Provider | Free allowance | Cost of one artist query | Wins at | Cannot do |
|---|---|---|---|---|
| **Ticketmaster** | 5,000/day, 5/sec | ~free | US arena shows it sells tickets to; canonical event ids in emails | Whole-word matching only; blind to anything it doesn't sell |
| **JamBase** | 14-day trial quota | metered | **Location search**; festival lineups | Trial, not a free tier — expires |
| **Spotify** (spotify81 via RapidAPI) | **1,000/month** (~33/day) | 1 request | Partial names (`Chris L` → Chris Lake); canonical artist id; club circuit; every row has lat/lng | No location-only search at all |
| **Bandsintown** (via Parse) | **200 credits/month** (~6.6/day) | **1 credit** | Most accurate on club shows; **real IANA timezone**; **past tour dates** | No coordinates; no usable location search (see below) |

Two supporting providers are metered too: **setlist.fm** (~1/sec, answers `403`
rather than `429` when throttled) and **Nominatim** geocoding (a hard 1/sec).

The spread here is four orders of magnitude — Ticketmaster allows ~150,000 calls
a month, Bandsintown allows 200. Nearly every decision below falls out of that
one fact.

If 200/month stops being enough, Parse's paid tiers are **Hobby $30/mo for 1,000
credits** and **Developer $100/mo for 5,000**. Hobby is the first thing to buy —
at 5x the headroom it would let Bandsintown move ahead of Spotify for artist
queries, and would make deep search cheap enough to stop gating behind a button.
Nothing in the code needs to change but the two cap values.

### The cheapest search is the one you don't make

Before any of the tables above matter: **the local catalog is the first cache.**
`artists`, `venues` and `events` are shared global rows, not per-user, so every
show anyone has ever added is already in Postgres with its provider ids
attached. Adding the same show for a second user costs zero upstream calls.

That is also the answer to "are we caching artists and events in the DB or
locally?" — the catalog *is* the cache, and it is permanent rather than
TTL'd. The `search_cache` table in front of it exists only to absorb queries
that found nothing worth persisting.

### Two different cascades, deliberately

The same four providers are consulted in **opposite orders** on the two paths,
because the paths are answering different questions.

```
INGESTION — automatic, one shot per email, accuracy matters, volume is low
Gmail poller ─┐
              ├─> normalize ─> dedupe ─> extract ─> match ─> auto-add (>=0.80)
Email Worker ─┘                                        └─> review Inbox (<0.80)

  match cascade, cheapest first, STOPS at the first confident answer:
  Ticketmaster ──> JamBase ──> Spotify ──> Bandsintown
    ~free           trial      1 req/mo     1 credit
```

```
BROWSE — interactive, fires on typing, volume is high
  artist query ──> Spotify (cached 6h) ──> JamBase ──> Ticketmaster
  location query ─────────────────────> JamBase ──> Ticketmaster
  "Search harder" button ──────────────> Bandsintown   (explicit, 1 credit)
```

**Why ingestion goes cheapest-first.** Every provider below the one that answers
is a call not made. Ticketmaster is effectively free and handles the common case
(a Ticketmaster confirmation email carrying its own event id, which scores 1.0
immediately). The scarce providers are reached only when the cheap ones have
already failed — which is precisely the small-venue case they are good at. This
is not a compromise: spending the scarce quota *only* on genuine misses is
strictly better than spending it on every Ticketmaster miss.

**Why Bandsintown sits below Spotify** despite being the more accurate of the
two: it is ~5x scarcer per month and its balance is the only one that does not
visibly refill. When both would answer, the cheaper one should.

**Why Browse inverts this for deep search.** By the time the user taps "Search
harder", they have already seen a cheap result and judged it wrong or missing.
Re-running Spotify and JamBase first would just re-serve the answer they
rejected. So the deep path goes straight to Bandsintown and falls through to the
ordinary cascade only if it finds nothing.

**Why Bandsintown is never automatic.** Browse debounces at 320ms but still
fires while typing. One session of someone playing with the search box would
spend the entire ~200-credit balance. The `?deep=1` gate is the whole defence.

### Search versus detail — the split

Yes: **one tier finds the show, a different one enriches it.**

The cheap providers are good enough to locate a show and put it on a list. They
are routinely missing the fields that only matter once you have committed to
going:

- a real **IANA timezone**, so the day-before reminder fires at the right hour.
  The Spotify proxy gives only a UTC offset, which cannot be converted to a zone
  (an offset doesn't say which DST rules apply). Bandsintown's
  `get_event_details` gives `America/Los_Angeles` outright.
- a **vendor ticket URL** rather than a listings page.
- a **street address**.

`enrichEventDetails` (in `app/actions.ts`) spends one credit to fill those in,
and is guarded three ways: it returns early if the row already has a timezone
and a URL, it requires a `bandsintown_id`, and the underlying fetch is cached
for 30 days behind the daily budget. Most rows never trigger it.

It is also the only point in the pipeline where a **wrong stored time can be
corrected**. Bandsintown list rows carry a naive local wall time
(`2026-09-27T22:00:00`, no zone), so a row written from one is anchored at UTC —
a 22:00 San Francisco show sits in the database seven hours early. Once the real
zone arrives, `enrichEventDetails` rewrites `starts_at` *and* writes the zone
onto the venue row, so every future show in that room gets it for free.

### Reconciling the same show from different sources

The catalog keys on provider ids (`tm_id`, `jambase_id`, `spotify_concert_id`,
`bandsintown_id`), so four providers describing one gig would produce four rows
unless something looks for the overlap. Two mechanisms handle it, at two
different stages:

**In flight**, `sameShow` in `ingest/match.ts` collapses duplicate *candidates*
before scoring. This matters more than it sounds: without it, two providers both
finding the right show read as "two strong scores — ambiguous" and the ticket
would be pushed to manual review precisely when we are most confident. Start
times are compared with a deliberately generous 12-hour window, because
providers disagree about doors vs. stage time and about date-only values.

**At persist time**, `reconcileEvent` in `ingest/catalog.ts` looks for an
existing row before inserting, and merges into it. It is intentionally
conservative — it would rather miss a duplicate than merge two different shows,
because a merge is much harder to undo. So it requires a same-day start **and**
either the same venue row or the same headliner, and it refuses when the two
rows name different headliners (two bands at one club on one night).

A merge **adds and fills gaps, never overwrites**: JamBase brought the image and
the festival flag, Spotify brought the venue coordinates, Bandsintown brings the
timezone and its own id. `starts_at` is left alone, because the incumbent's
value came with a real zone and the newcomer's may be a bare UTC anchor.

Venue rows do most of the quiet work here. Bandsintown list rows have no venue
id at all, so `upsertBitVenue` matches on name + city — which finds the row
Spotify already created for "Public Works" in "San Francisco", complete with
coordinates, instead of inserting a second one beside it.

### Caching: what, where, and for how long

Everything is cached in **Postgres, not in process**. Vercel runs each request in
a short-lived independently-scaled function, so an in-memory cache would be cold
on most requests and shared with nobody — which is exactly where the wins are.
"What's on near me" is the same upstream query for everyone in a city.

| What | Table | Hit TTL | Miss TTL | Why that number |
|---|---|---|---|---|
| Catalog (artists/venues/events) | `events` et al. | **permanent** | — | A show that happened is a fact. This is the real cache. |
| Bandsintown artist tour | `search_cache` | **24h** | 6h | Scarcest provider. A tour changes over days; a day-old answer costs nothing and the credit does. |
| Bandsintown event detail | `search_cache` | **30d** | 30d | Venues and timezones do not move. |
| Bandsintown past events | `search_cache` | **30d** | — | Tour history is append-only; the tail never changes. |
| Spotify concerts | `search_cache` | 6h | 6h | 1000/month ≈ 33/day. Budget control, not latency. |
| JamBase / Ticketmaster search | `search_cache` | 5m | — | Cheap enough that freshness wins. |
| Geocoded places | `search_cache` | 30d | 1h | A city does not move. A miss is usually a typo still being fixed. |
| Setlists | `event_setlists` | **forever** | 3d | A past setlist never changes. |

Three details in there that are easy to get wrong and were:

1. **Negative caching is not optional.** setlist.fm entries are added by users
   days after a show, so without caching the *miss* every view of an archived
   event re-hit an API that answers `403` when throttled.
2. **A cached miss must be distinguishable from a cache miss.** Payloads are
   wrapped (`{ place: null }`, `{ event: null }`) rather than stored bare —
   otherwise every unresolvable query re-hits the provider forever.
3. **A provider *error* is never cached as a miss.** That would poison the entry
   for the full TTL on a transient outage.

Cache keys are normalised so trivially different queries share an entry:
case-folded and whitespace-collapsed text, and coordinates rounded to ~1km so
two people in the same neighbourhood share one upstream call.

### A hard budget, not just a cache

Every other provider is metered in requests, and overrunning gets you a `429` to
back off from. Bandsintown is metered in **credits off a small prepaid balance**,
and overrunning does not throttle — it empties the account. Worse, the remaining
balance is only reported in the response, i.e. after the credit is already spent.

So the budget is enforced *locally, before the call*. Migration `0014` adds
`provider_spend`, an append-only ledger; `0016` adds a month-to-date rollup
beside the daily one, so each guard is one indexed query.

**Three ceilings, doing three different jobs:**

| Cap | Default | What it protects against |
|---|---|---|
| `BANDSINTOWN_MONTHLY_CREDITS` | 180 | The real quota. 180 against a real 200 leaves ~10% headroom, because Parse resets on its own clock and our month boundary is UTC. |
| `BANDSINTOWN_DAILY_CREDITS` | 25 | A burst limiter, not a budget — stops one runaway afternoon eating the month in an hour. Deliberately above 200/30, since real usage is lumpy. |
| `BANDSINTOWN_DEEP_PER_USER` | 5/day | One person spending the whole friend group's month via "Search harder". Cache hits don't count. |

A daily cap alone was the wrong shape of guard and briefly shipped that way: 25/day
permits 750 a month, 3.75x the allowance, so the budget could be honoured every
single day and still blow the month.

The guard is advisory rather than transactional: two concurrent requests can both
pass a check only one should. That is an accepted trade — the cap sits far below
the real ceiling so a small overshoot is harmless, and a lock would serialise
every search. The ledger also stores the upstream-reported balance alongside our
own count, so drift between the two is visible.

It does **fail closed**, though. `creditsSpentToday` returns `null` rather than
`0` when the ledger cannot be read, and `checkBudget` refuses on `null`. An
unreadable ledger means we do not know what has been spent, and guessing
"nothing" against a balance that does not refill is the one genuinely expensive
mistake available here. Refusing costs nothing by comparison — Bandsintown
degrades to the other three providers, which every call site already handles.

**Deploy ordering:** migration `0014` must be applied before the app deploys with
`PARSE_API_KEY` set. Without the columns, `upsertBandsintownEvent` spends a credit
and then fails on `bandsintown_id` — caught, logged, and surfaced only as "Could
not save that event". Applied to both dev and prod as of 2026-08-29; a fresh
environment needs it before its first deploy.

### Efficiency audit

Measured against the four providers as wired today.

**What is working**

- The catalog absorbs all repeat traffic. Second and subsequent users adding the
  same show cost nothing upstream.
- Browse's expensive path is capped by a 6-hour Spotify TTL shared across all
  users, so a city's worth of people searching one artist costs one request.
- The ingestion cascade short-circuits. A Ticketmaster confirmation email with an
  embedded event id scores 1.0 on the first provider and never reaches the other
  three.
- Bandsintown cannot be reached by typing at all.
- Geocoding, the one provider with a hard 1/sec limit, is cached for 30 days and
  keyed on rounded coordinates.

**Known gaps, in priority order**

1. **Browse still doesn't read the local catalog first.** Events already synced
   into `events` are re-fetched from a provider on every search; the `pg_trgm`
   index exists for this and is unused. This is the single biggest remaining
   win — it would make the most common searches free. (Carried over from
   TODO §5.8.3.)
2. **`sameShow` runs only over in-flight candidates.** Rows persisted from
   different providers at different times are reconciled only when a Bandsintown
   write passes through `reconcileEvent`; a JamBase row and a Spotify row added a
   week apart still duplicate. A backfill pass over `events` would clean them up.
3. **The daily budget is per-deployment, not per-user.** One user can consume the
   whole day's Bandsintown allowance with repeated deep searches. A per-user
   rate limit belongs in front of the `?deep=1` path.
4. **`ticket.artistName` drives three separate provider lookups** with the same
   string. When the cascade runs to completion the same artist is resolved
   against JamBase, Spotify and Bandsintown independently. Only the last two are
   cached under a shared key.
5. **JamBase is a 14-day trial, not a free tier.** Every call site already
   degrades via `isConfigured()`, but when it lapses, location search has no
   replacement — Spotify has no location endpoint and Bandsintown's is unusable
   (below). Ticketmaster is the only fallback and it is much thinner.

### Two Bandsintown endpoints that do not work as documented

Both verified live on 2026-08-29, both worth knowing before someone tries to
"fix" the architecture by using them:

1. **The `country` / `region` filters on the artist endpoints are broken.**
   `get_artist_events_by_name("Overmono", country: "US")` returns an **empty**
   events array, while the identical call with no filter returns the US dates
   (Hollywood Palladium, Public Works, Cermak Hall, Terminal 5). Never pass them.
   Fetch worldwide — it is the same one credit — and filter locally.

2. **`get_city_events` ignores `start_date` and `end_date`.** A request for
   2026-09-26..2026-09-28 came back with events dated 2026-08-29. It is also
   metro-wide with no radius control (a `san-francisco-ca` query returns San
   Jose, Napa and Petaluma), pages only ~10 rows, and costs **3 credits a page**.

   That combination makes it strictly worse than JamBase at the one job it
   looked useful for, so it is deliberately not wired in. **Bandsintown is an
   artist-query and event-detail provider here, nothing else.**

### The case that justifies a fourth provider

`Overmono @ Public Works, San Francisco, 2026-09-27` — a club show absent from
both Ticketmaster and JamBase, and the reason manual entry exists. Bandsintown
returns it, with the whole tour, for one credit. Spotify has it too, which is
what makes the pair worth having: they agree on the club circuit that the two
cheap providers are blind to, and Bandsintown adds the timezone and the past
dates that Spotify cannot supply.

None of the four is complete, which is why **manual entry is always offered** and
not just when a search comes back empty.

## How the ingestion pipeline works

```
Gmail poller ─┐
              ├─> normalize ─> dedupe ─> extract ─> match ─> auto-add (>=0.80)
Email Worker ─┘                                          └─> review Inbox (<0.80)
```

- **Extractors** live in `src/lib/ingest/extractors/`. `jsonld.ts` runs first and
  does the heavy lifting: Ticketmaster, Eventbrite and others embed schema.org
  `EventReservation` markup in confirmation emails, which is far more reliable
  than scraping table-soup HTML and covers vendors we've never seen. Vendor
  modules in `vendors.ts` handle the rest.
- **Matching** (`match.ts`) scores candidates on name, date, venue and city, then
  auto-adds above `AUTO_ADD_THRESHOLD` (0.80). Near-ties are sent to review even
  when scoring high, because two nights of the same tour are genuinely ambiguous.
  Which providers it consults, and why in that order, is covered above.
- **Privacy**: only extracted fields and a SHA-256 content hash are stored. Email
  bodies are never persisted.

### When a real email doesn't parse

Add it (scrubbed) to `test/fixtures/emails.ts` and fix the extractor against it.
That's the intended workflow — the fixture suite is the regression net.

## Verification

```bash
npm test                       # extractor + matcher unit tests (offline)
npm run test:live              # real queries + RLS against a seeded project
npx tsc --noEmit               # typecheck
npm run build                  # production build

# Privacy guarantees, against a throwaway Supabase project:
node scripts/verify-rls.mjs
```

Signed in as `demo@stub.local` against the seed, you should see:

- **Upcoming** — 4 shows; Japanese Breakfast and Turnstile badged *From Gmail*.
  Japanese Breakfast shows a **2**-avatar stack (Marisol + Dev), not 3 — Sasha
  is going but is not your friend.
- **Archive** — 2 shows, grouped by year.
- **Inbox** — badge `2`; one 62% match, one *No match found*.
- **Friends** — 3 friends, 1 pending request from Sasha, plus *what your friends
  are going to* (Wednesday, Sunset Rollercoaster).
- **Event detail** — Japanese Breakfast shows only *your* note about the taqueria.
- **`/profile/quinn`** — her Slowdive show, but **not** her private Big Thief one.

Anything different there is a real bug, not a seeding artifact.

`verify-rls.mjs` creates two users, makes them friends, and asserts that notes
never leak, that `visibility` is honoured in both directions, and that OAuth
token columns aren't selectable by the client. **It creates and deletes users —
never point it at a database with real data.**

### On device

Open the Vercel preview on your iPhone → Share → Add to Home Screen. Confirm it
opens standalone and the tab bar clears the home indicator.

## Note on repo conventions

The rest of this monorepo is client-side-only by design (see the root README's
"zero-server" principle). Stub deliberately breaks that: it needs a database,
stored OAuth tokens, and cron. There's no way to scan a mailbox on a schedule
from a static page.
