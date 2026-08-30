# Stub

Concert **memory** app with automatic ticket detection. Where the Shop app scans
your inbox for tracking numbers, Stub scans it for **ticket confirmations** and
builds a record of the shows you're going to and the ones you've been to.

**It is not a discovery app.** Search and purchase are things other apps already
do well; the `/browse` route still exists but is not in the tab bar. The job here
is the stub in your pocket after the show — the date, the room, the lineup, the
setlist, what you paid, who else went. That framing decides most trade-offs
below, and in particular it is why the provider budget goes on *enriching what
you already have* rather than on searching for what you might want.

Next.js PWA, installable to the iOS home screen. Runs on free tiers end to end.

## What's here

| Area | Status |
|---|---|
| Google sign-in + email magic link | Built |
| Profiles, avatars, bio, friends | Built |
| Artist & event search (5 providers, first-party then cost-ordered) | Built |
| Upcoming / Archive tabs, manual add | Built |
| Going / Interested shown on the Upcoming list | Built |
| Ticket count and price per order, parsed and editable | Built |
| Year in review (shows, venues, spend, top artist) | Built |
| Private notes (owner-only, enforced in RLS) | Built |
| Friends-going on events | Built |
| Friend invite links, and sending an event to a friend | Built |
| Gmail scanning + review Inbox | Built |
| Multi-year mailbox backfill (30d – 10y, resumable) | Built |
| Eventbrite event resolution (first-party) | Built — needs an Eventbrite key |
| Forward-to-inbox address | Built, **switched off** — needs a domain |
| Bandsintown deep search + detail enrichment | Built — needs a Parse key |
| setlist.fm archive import | Built |
| setlist.fm matching for past-dated tickets | Built |
| Setlist badge on Archive cards (cached only, no API calls) | Built |
| Spotify favorites import | Built, capped at 5 users by Spotify |
| Spotify artist artwork (client credentials, no user cap) | Built — fallback only |
| Supabase keep-alive (free tier pauses after 7 days idle) | Built — GitHub Actions cron |
| Web push day-before reminders | Built |
| "Artist you follow announced a show" push | Built |
| Sign in with Apple, Apple Music import | **Not built** — needs paid Apple Developer |

## Five constraints worth knowing before you start

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
4. **Nothing *lists* a show that already happened.** Every listing provider drops
   an event once it is over, so a years-back mailbox scan mostly fills the review
   Inbox rather than the Archive. Two sources answer the past — **setlist.fm**
   (free, tried first) and Bandsintown's past-events endpoint (a credit, tried
   second). Good coverage for touring acts, patchy for small club nights.
5. **JamBase is a 14-day trial, not a free tier.** When it lapses the specific
   gap is Browse's *location* search. The past is covered by setlist.fm,
   purchases by Eventbrite, arena shows by Ticketmaster — but nothing free
   answers "what is on near me" except Ticketmaster, which is blind to the club
   circuit. That is the hole to plan for.

## Operational patterns

Hard-won, mostly from things that failed silently. Worth reading before changing
anything in `lib/providers/` or `.github/workflows/`.

- **Migrations gate deploys.** `getPendingCount` runs in the app *layout*, so a
  table it queries missing from prod takes down every authenticated page, not
  one route. Apply migrations **before** pushing. This has bitten once — TODO
  §5.17.
- **Validate workflow YAML.** `npm run lint:workflows`. The cron file was
  unparseable from the day it was written — a heredoc at column 0 closed a block
  scalar — so nothing ran for two days, with no error anywhere a person would
  look. TODO §5.19.
- **Provider responses are recorded, not hand-mocked.** `npm run fixtures:record`
  captures real responses to `test/fixtures/api/`; `test/transport.test.ts`
  replays them through the real clients, offline. Three provider bugs in one day
  were invisible to a green suite because they lived between `fetch` and the
  normalizer, which nothing exercised. An unmatched request **throws** rather
  than reaching the network. Re-record when a provider changes shape and *read
  the diff*. Secrets are scrubbed from the whole serialized fixture, not just
  known field names — Eventbrite echoes your private token back in
  `x-rate-limit`, which leaked it into a committed file on the first run.
- **Provider failures are silent by design.** `matchTicket` catches a provider
  error and continues down the cascade, which is right for resilience and
  dangerous for debugging: a completely broken provider looks exactly like one
  with no results. Transport code needs its own tests.
- **Push is deliberately hard to trigger.** `api/cron/announce` (a followed
  artist has a new show) and the Gmail scan (`lib/notifyScan.ts`, only when a run
  *added* or *queued for review*, never on a quiet pass — it runs every 30
  minutes and finds nothing almost every time). Both claim their dedupe row
  before sending, so a concurrent run skips rather than double-notifying, and
  both prune a subscription on 404/410.
- **`VAPID_SUBJECT` must be a real, monitored `mailto:`.** Apple rejects a
  placeholder, so an unset value means iOS pushes fail silently while Android and
  desktop work. Prefer a role address on the app's domain over a personal inbox —
  TODO §1.4.
- **`api/cron/repair`** is a manual, idempotent `workflow_dispatch` job for rows
  written before a provider bug was fixed. Re-ingesting does *not* work:
  ingestion dedupes on a content hash, so a confirmation read once is skipped
  forever. Rows must be repaired in place.
- **`api/cron/keepalive`** writes one row daily. Supabase pauses a free project
  after ~7 days idle. Scheduled from GitHub Actions, not `vercel.json` — Hobby
  caps crons at two and both slots are taken.
- **`maybeSingle()` errors on multiple matches — always `.limit(1)` first.**
  A name-fallback lookup without it returns nothing once two rows share a name,
  so the caller inserts a third. Then a fourth. This ran away to six rows for one
  artist and four apiece for dozens more before anyone noticed, because the error
  was discarded and the symptom was just "more rows". TODO §5.25.
- **MusicBrainz resolves artist IDENTITY, and that is what it is for here.**
  Not metadata — identity. Every other provider resolves an artist by fuzzy name
  search, independently, which is how one service says "Chris Stussy" and
  another says "CHRIS STASSY". MusicBrainz holds the artist's actual accounts,
  curated by humans, so one free lookup (`getArtistLinks`) yields their real
  Spotify id, Deezer id, Resident Advisor page, Bandcamp, SoundCloud and
  official site. Stored on `artists` (`0020`), resolved by `api/cron/repair`,
  and every later fetch becomes exact instead of a guess. It allows **1
  request/second** and needs an honest User-Agent, which is why it is a
  background pass and never on a request path.
- **Artist photos come from free sources — by ID when we have one, by name
  otherwise.** `providers/artistImages` —
  Deezer first (no API key at all, 50 req/5s), then Spotify search (free, but
  needs credentials). Backfilled by `api/cron/repair`. This exists because the
  *event* providers are unreliable about artwork for exactly the club-circuit
  acts this app is for, and a blank thumbnail is the most visible failure in a
  memory app. Every candidate goes through `namesMatch` first: a wrong face on
  someone's memory is worse than initials.
- **We do not scrape.** A Songkick scraper was evaluated and declined: the
  candidate library has no licence, Songkick's `robots.txt` names and blocks
  scrapers explicitly, it duplicates Bandsintown, and it would add a fourth
  silent-failure surface. TODO §5.21.

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

Five event providers, none of them complete, all of them metered differently.
This section is the reasoning behind which one gets asked what, and in what
order — it is the part of the codebase most likely to be changed by someone who
hasn't measured the trade-offs, so the measurements are written down.

### The ordering principle: first-party beats accurate beats cheap

Providers are ranked on **how close they are to the ticket**, then on cost.

1. **First-party** — the company that actually sold the ticket. It is not
   guessing which show the email refers to; it *knows*, because the email
   carries its event id. Confidence 1, no scoring involved.
2. **Third-party listings** — everyone else, describing shows they hope to sell.
   These get scored on name, date, venue and city, and can be wrong.

Eventbrite is the only first-party source wired in so far, and it moved to the
front of the cascade the day it landed. That ordering is worth defending: it is
both the most accurate answer available *and* the cheapest, which is unusual and
makes it a free win rather than a trade-off.

### What each one costs, and what it is actually good at

| Provider | Free allowance | Cost of one query | Wins at | Cannot do |
|---|---|---|---|---|
| **Eventbrite** (first-party) | **2,000/hour** | ~free | The exact event, by id, from the vendor that sold the ticket; **real IANA timezone**; venue coordinates; event artwork | Public event *search* was withdrawn — `/v3/events/search/` is a 404. Id lookup only |
| **Ticketmaster** | 5,000/day, 5/sec | ~free | US arena shows it sells tickets to; canonical event ids in emails | Whole-word matching only; blind to anything it doesn't sell |
| **JamBase** | 14-day trial quota | metered | **Location search**; festival lineups | Trial, not a free tier — expires |
| **Spotify** (spotify81 via RapidAPI) | **1,000/month** (~33/day) | 1 request | Partial names (`Chris L` → Chris Lake); canonical artist id; club circuit; every row has lat/lng | No location-only search at all. Answers in **Spanish** and cannot be asked not to (see below) |
| **Bandsintown** (via Parse) | **200 credits/month** (~6.6/day) | **1 credit** | Most accurate on club shows; **real IANA timezone**; **past tour dates** — the only source for a show that has already happened | No coordinates; no usable location search (see below) |

A sixth, **Spotify's official Web API**, is wired in but is not an event
provider at all — it supplies artist artwork as a fallback via the
client-credentials flow. See "What the Web API is and isn't for" below.

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

  match cascade, first-party then cheapest, STOPS at the first confident answer:
  Eventbrite ─> Ticketmaster ─> JamBase ─> Spotify ─> setlist.fm ─> Bandsintown
   ~free, and      ~free         trial    1 req/mo    free, PAST     1 credit
   DEFINITIVE                                         shows only   (+1 past)
```

**Why setlist.fm sits where it does.** It answers one question nothing else can
— "did this artist play here on this date" — and it is free, so it goes ahead of
Bandsintown's past-events endpoint, which charges a credit to resolve a slug and
another to pull fifty dates. It is a no-op on any ticket for a show that has not
happened yet. Measured on a real unmatched inbox: 4 of 6 past tickets found.

**It is also the JamBase succession plan.** JamBase is a 14-day trial, not a free
tier. When it lapses, location search is the gap — setlist.fm covers the past,
Eventbrite covers anything bought through it, and Ticketmaster covers what it
sells. Browse's location query is what will need rethinking.

```
BROWSE — interactive, fires on typing, volume is high
  artist query ──> Spotify (cached 6h) ──> JamBase ──> Ticketmaster
  location query ─────────────────────> JamBase ──> Ticketmaster
  "Search harder" button ──────────────> Bandsintown   (explicit, 1 credit)
```

**Why Eventbrite goes first.** It only runs when the email actually carried an
Eventbrite link, so it costs nothing on every other vendor's mail. When it does
run it returns confidence 1 and the cascade stops immediately — so an Eventbrite
ticket now resolves without spending a single metered request anywhere else.
Before this it fell all the way through to Spotify, which is both the most
expensive answer and the least accurate one.

**Why ingestion goes cheapest-first below that.** Every provider below the one that answers
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
   degrades via `isConfigured()`. When it lapses, *location* search has no good
   replacement — Spotify has no location endpoint and Bandsintown's is unusable
   (below), leaving only Ticketmaster, which is much thinner. Matching is less
   exposed than it was: Eventbrite and setlist.fm now absorb the first-party and
   past-show cases for free. See TODO §5.22.

### Three things about Bandsintown that do not work as documented

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

3. **Two different response envelopes, and the wrong one is silent.** The Parse
   **MCP tool** answers with the documented contract, `{ ok, result: { data } }`.
   The **REST endpoint** this module actually calls answers with the scraper's
   own shape, `{ status: "success", data }`, with no `result` wrapper.

   The provider was written against the first and wired to the second, so every
   call threw `!body.result` → `"unknown error"`. Because `matchTicket` catches a
   provider failure and moves on, there was **no error anywhere** — Bandsintown
   simply never contributed a candidate, which is indistinguishable from "that
   artist had no dates". The most accurate club-show provider in the app was
   inert from the day it was added until 2026-08-29.

   Nothing caught it because `call()` was the one function in the module with no
   test — every pure helper around it was covered. `unwrap()` now accepts both
   shapes and is pinned by tests. **The lesson generalises: a provider that fails
   silently into a cascade needs a test on its transport, not just its parsers.**

### Past shows: the one thing only Bandsintown can answer

Every other provider lists what is **on sale**. Ticketmaster, JamBase, Spotify
and Bandsintown's own upcoming endpoint all drop an event once it has happened.
So a confirmation for last spring's gig matches nothing anywhere and lands in the
review queue — which is why a multi-year mailbox backfill produces a pile of
manual work rather than an archive.

`get_artist_past_events` is the only fix available, and it works: KETTAMA at The
Regency Ballroom on 2026-05-06 is in it, and was sitting unmatched in a real
inbox. It costs a second credit, so `bandsintownCandidates` spends it only when
the ticket is for a past date *and* the upcoming list has already failed to cover
it. Past tours never change, so the result caches for 30 days.

### What the Spotify Web API is and isn't for

Not events. The public Web API has **no concerts, live-events or tour-date
endpoints at all** — that data exists only behind Spotify's internal partner API,
which is what the `spotify81` proxy wraps. The Web API cannot replace it.

What it does supply is artist artwork, through the **client-credentials** flow:
no user, no consent, no redirect URI, and the five-user development-mode cap does
not apply because it authorizes no users. Two measured limits shape the
integration:

- **February 2026 removed every "Get Several" endpoint** for development-mode
  apps. `GET /artists/{id}` is 200; `GET /artists?ids=…` is **403**. So it is one
  request per artist, not one per lineup.
- **The image is the same URL the concerts proxy already returns**, and `genres`
  is absent from the response entirely (as are `followers` and `popularity`).

So it is a **fallback, not an upgrade**: worth calling only for an act the proxy
gave no picture for, which happens because the proxy's `detailsLimit` caps how
many concerts in a response get the enriched view. Both filters are applied
before any request, so in the steady state it makes none.

### Localization: the proxy answers in Spanish, and cannot be asked not to

Spotify builds a multi-act concert title server-side and localizes it from
`Accept-Language`. The same concert page proves it — `en-US` gives
"Silva Bumpa, Dean Turnley", `es-ES` gives "Silva Bumpa y Dean Turnley". The
proxy sends a Spanish one upstream and there is **no way to override it**:
verified against a plain request, an `Accept-Language: en-US` header (not
forwarded), and `locale`/`market`/`language` query parameters (ignored). The
endpoint has no locale parameter to pass.

This is a *different axis* from the proxy's geo default, which resolves to
Montreal — a Montreal server would give French "et", not Spanish "y".

Only the generated event **title** is affected; artist names, venues, dates, ids
and coordinates all come back clean. So the title is rebuilt from the `artists`
array, and only when it is demonstrably nothing but the lineup joined together —
a promoter's real title ("Goldrush: Midnight Riders") fails that test and passes
through untouched. The separator list covers more than Spanish on purpose: the
locale this proxy is pinned to can change under us.

### The case that justifies the scarce providers

`Overmono @ Public Works, San Francisco, 2026-09-27` — a club show absent from
both Ticketmaster and JamBase, and the reason manual entry exists. Bandsintown
returns it, with the whole tour, for one credit. Spotify has it too, which is
what makes the pair worth having: they agree on the club circuit that the two
cheap providers are blind to, and Bandsintown adds the timezone and the past
dates that Spotify cannot supply.

None of them is complete, which is why **manual entry is always offered** and
not just when a search comes back empty.

### Timezones: an event without a zone renders in the server's zone

The bug this pattern exists to prevent: a 10pm show at Monarch in San Francisco
displayed as **"Mon, Sep 28 · 5:00 AM"**. The stored instant was correct the
whole time — 22:00 PDT on the 27th *is* 05:00 UTC on the 28th. What was missing
was a zone to render it in.

Every formatter in `lib/format.ts` passes no `timeZone` option when it has none,
so `toLocaleString` falls back to the **runtime's** zone — and every page here is
server-rendered, on Vercel, in UTC. A null `events.timezone` is therefore not a
cosmetic gap; it is a wrong time on the card, the calendar feed and the push
reminder.

Defence in depth, because any one layer alone leaves a hole:

| Layer | Rule |
|---|---|
| **Provider** | Take the vendor's IANA zone whenever there is one. Eventbrite and Ticketmaster always have it; Bandsintown has it on detail rows only |
| **Write** | `upsertSpotifyEvent` resolves from the venue row another provider already placed, then from the region (`lib/timezone.ts`), and backfills the venue row so the next provider inherits it |
| **Render** | `format.eventZone()` walks event → venue → region. **Nothing reads `event.timezone` directly** — including the push reminders, which were announcing the wrong showtime for exactly this reason |

`lib/timezone.ts` maps US states and Canadian provinces, disambiguating `"CA"` by
country. It is deliberately coarse: being an hour wrong in western Kansas beats
being seven hours wrong everywhere.

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
