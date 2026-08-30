# Stub — remaining work

Living backlog. Current state: **deployed and running against a real production
database with real users.** Everything below is what stands between that and a
thing your friends actually use.

Ordered by what blocks what. **§1 is the only section that blocks sharing it.**

## Status at a glance — 2026-08-29

| | |
|---|---|
| **Deployed** | `stub-two.vercel.app`, commit `8d497ee`, READY. Every route 200, no 5xx. Per-deployment URLs are SSO-walled, see §1.6 |
| **Prod DB** | `biichwtrfmrdgiqtvxme`, all **19** migrations applied |
| **Prod keys** | `RAPID_API_KEY` and `PARSE_API_KEY` both set. Bandsintown is live on the next deploy |
| **Dev DB** | `syrsjdreydgblrwpalyw`, seeded, all **19** migrations |
| **Tests** | **203** offline passing; live suites for queries, geocode, Spotify concerts, Spotify Web API, Eventbrite |
| **Providers wired** | **Eventbrite**, Ticketmaster, JamBase, Spotify/RapidAPI, Bandsintown/Parse, setlist.fm, MusicBrainz, Nominatim |
| **Email vendors parsed** | Ticketmaster, AXS, DICE, Eventbrite, See Tickets/Eventim, Frontgate, TicketWeb, Etix |

**Blocking a wider share:** Google OAuth test-user list (§1.2) · a domain (§1.4,
which also gates a proper `VAPID_SUBJECT`) · security review (§6). *(Deployment Protection and
`RAPID_API_KEY` are both resolved — share `stub-two.vercel.app`, not a
per-deployment URL.)*

**Nearest high-value work:** friend activity feed (§3.4) ·
serve Browse from the local catalog (§5.8.3, now the biggest efficiency win
left) · backfill provider dedupe over existing rows (§5.12).

---

## 1. Before anyone else touches it

### 1.1 ~~The test accounts are a live backdoor~~ — **RESOLVED**

**Done 2026-08-28**, and **live since 2026-08-29.** Production project
`biichwtrfmrdgiqtvxme` (`stub-prod`) was provisioned with schema only — no seed,
so the `stubdemo123` accounts exist nowhere in production.

**Current production state (2026-08-29):** 2 users · 2 events · 10 artists ·
1 attendance. Real data now, so treat it accordingly.

- **All 13 migrations applied and tracked** (`0012` and `0013` applied
  2026-08-29 — see below).
- Advisors: only the 2 known-accepted warnings (§6).
- Signup verified end to end with a throwaway user: profile, calendar token and
  inbound address all auto-created, then deleted. Confirms the `0006`
  `search_path` fix — without it every signup raises 42883.

Dev project `syrsjdreydgblrwpalyw` keeps the seed so `npm run test:live` works.

<details><summary>Original issue</summary>

`supabase/seed.sql` creates five real accounts with the password `stubdemo123`.
**The repo is PUBLIC** (`kageraaron/kager-llc`), so that password is readable by
anyone on the internet, and project `syrsjdreydgblrwpalyw` currently contains
those accounts.

The moment the app is deployed to a public URL, `demo@stub.local` /
`stubdemo123` is a working login for a stranger. Do this before, not after,
the first deploy.

**Decided: separate prod project.** Steps are in `SETUP.md` → "Going to production".

`npm run build:bootstrap` now emits two files:

| File | Contents | Use on |
|---|---|---|
| `supabase/schema.sql` | migrations only, **no accounts** | **production** |
| `supabase/bootstrap.sql` | migrations + seed | dev/test only |

</details>

### 1.2 Google OAuth — one project, Testing mode  *(decided)*

**Correction to earlier guidance in this file:** the OAuth consent screen —
its scopes *and* its publishing status — is configured **per GCP project**, and
shared by every OAuth client in that project. So "two clients, one project"
does not work: you cannot have one client Published with basic scopes and
another in Testing with `gmail.readonly`. That would need two separate projects.

**Chosen: Option A — a single GCP project in Testing mode.**

| | |
|---|---|
| Publishing status | **Testing** |
| Scopes | `openid`, `email`, `profile`, `gmail.readonly` |
| User cap | **100**, and every user must be on the test-user list |
| Sign-in client redirect URI | `https://biichwtrfmrdgiqtvxme.supabase.co/auth/v1/callback` |
| Gmail client redirect URI | `https://stub-two.vercel.app/api/connect/gmail/callback` |

Note the two redirect URIs point at different hosts: sign-in goes through
Supabase, Gmail connect comes back to the app.

Every friend must be added under **Test users** — for plain sign-in too, not
just Gmail. That is the cost of Option A, and it is cheap at this scale.

> A Published consent screen requesting `gmail.readonly` is blocked outright for
> unverified apps, which is why the whole project sits in Testing rather than
> being published.

**Option B, if the 100 cap or the manual test-user list ever bites:** split into
two GCP projects — one Published with basic scopes for unlimited sign-in, one in
Testing with `gmail.readonly` for the Gmail client.

### Required env vars (Vercel, Production)

`GOOGLE_OAUTH_CLIENT_ID` **and** `GOOGLE_OAUTH_CLIENT_SECRET`. Vercel bakes env
vars into a deployment, so **redeploy** after adding them. Also enable the
**Gmail API** in the project (APIs & Services → Library) — without it the token
is issued but every call 403s.

### 1.3 Secrets → Vercel, not GitHub

GitHub Secrets are readable only by Actions workflows; the only workflow in this
repo is the reddit bot. Runtime secrets belong in **Vercel → Settings →
Environment Variables**, scoped per environment.

- Never prefix a secret with `NEXT_PUBLIC_` — that inlines it into the browser bundle.
- `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` → **Development only**.
- `NEXT_PUBLIC_SITE_URL` differs per environment and builds the OAuth redirect
  URI, so Preview deployments need a stable domain or Gmail connect breaks there.

### 1.4 Buy a domain (~$10/yr)

Unblocks five things at once:

- **Forward-to-inbox** (`FEATURE_FORWARD_INBOX`) — needs DNS on Cloudflare for
  Email Routing. See `workers/email-router/README.md`.
- A stable OAuth redirect URI that doesn't change per deploy.
- A real PWA install identity (icon + name on the home screen).
- Somewhere to point `INBOUND_EMAIL_DOMAIN`.
- **A role address for `VAPID_SUBJECT`** — see below.

#### `VAPID_SUBJECT` wants a role address, not a personal one — **BLOCKED on the domain**

`VAPID_SUBJECT` is the contact address push services (Apple, Google, Mozilla)
use to reach the operator when an app's pushes misbehave. It is sent with every
push, so it should be a **role address on the app's own domain** —
`mailto:push@<domain>` or `mailto:stub@<domain>` — not the maintainer's personal
inbox.

Two reasons, and the second is the one that bites:

- It is operational contact metadata, and putting a personal address in it means
  a third party's abuse desk mails a human's private inbox.
- It is set once per deployment and easy to forget. Changing it later means
  remembering it exists — this note is that reminder.

**Until the domain exists**, set it to any real mailbox you monitor so pushes
work at all: **Apple REJECTS a placeholder subject**, so an unset or fake value
means iOS pushes fail silently while Android and desktop succeed — a failure
that presents as a device bug rather than a config one. Swap it for the role
address the day DNS is live, in `.env.local` **and** Vercel.

#### Two more contact addresses want the same treatment

`MUSICBRAINZ_USER_AGENT` and `NOMINATIM_USER_AGENT` are both still on the
`you@example.com` placeholder. These are not cosmetic: **both services require a
real contact in the User-Agent as a condition of use**, and both are documented
as blocking clients that do not provide one. Nominatim in particular enforces
hard.

So the domain actually unblocks **three** contact addresses, all of which should
be role addresses rather than anyone's personal inbox:

| Variable | Sent to | Set to |
|---|---|---|
| `VAPID_SUBJECT` | Apple / Google / Mozilla push services | `mailto:push@<domain>` |
| `MUSICBRAINZ_USER_AGENT` | MusicBrainz | `Stub/0.1.0 ( contact@<domain> )` |
| `NOMINATIM_USER_AGENT` | OpenStreetMap Nominatim | `Stub/0.1.0 ( contact@<domain> )` |

Do all three in the same pass, in `.env.local` **and** Vercel.

### 1.5 Remaining keys

- ~~`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`~~ — **done 2026-08-30**, in
  `.env.local` and Vercel. Verified `web-push` accepts them.
- `VAPID_SUBJECT` — **currently unset**, so it falls back to a placeholder and
  iOS pushes will fail. Needs a real mailbox now and a role address on the
  domain later; see §1.4.
- `EVENTBRITE_API_KEY` — **done 2026-08-30**, in `.env.local` and Vercel.
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — **done 2026-08-30**. Only the
  client-credentials flow is used (artist artwork); no redirect URI needed for
  it, and the 5-user cap does not apply.
- ~~`SETLISTFM_API_KEY`~~ — **done**, in `.env.local`. Still needs adding to Vercel.

### 1.6 Deployment: Vercel Hobby caps crons at once per day

First deploy of `vercel.json` fails with:

> Hobby accounts are limited to daily cron jobs. This cron expression
> (`*/30 * * * *`) would run more than once per day.

**Fixed, without paying.** The repo is public, so **GitHub Actions minutes are
free and unlimited** — scheduling moved there:

- `vercel.json` now runs each job **once daily** (valid on Hobby, acts as a
  safety net).
- `.github/workflows/stub-cron.yml` calls the deployed endpoints on the real
  cadence: Gmail scan every 30 min, reminders hourly. Both jobs are idempotent,
  so the overlap is harmless.

This is the one legitimate use for **GitHub Secrets** in this project (contrary
to what §1.3 says about runtime config):

| Secret | Value |
|---|---|
| `STUB_BASE_URL` | deployed URL, no trailing slash |
| `CRON_SECRET` | same value as in Vercel's env vars |

### ~~Production database is two migrations behind~~ — **RESOLVED 2026-08-29**

Prod was on `0001–0011`, which meant two live defects:

- no `events.spotify_concert_id`, so a Spotify match could not be persisted —
  `persistCandidate` returned null and ingestion errored on exactly the club
  shows the cascade exists to catch;
- `jambase_id` still enforced by a *partial* unique index, so **adding a JamBase
  event from Browse failed in production** (see §6).

`0012` and `0013` are now applied and verified: spotify columns present, 6 unique
constraints created, 0 leftover partial indexes, user data untouched. The
`ON CONFLICT` path was then exercised directly against prod for all three upserts
that were failing.

> **Post-mortem worth keeping.** The verification probe was written as a single
> statement using data-modifying CTEs — insert, then `delete ... where id in
> (select id from ins)` — on the assumption that one statement means one
> transaction and therefore self-cleaning. It is not: every CTE in a statement
> sees the **same snapshot**, so the DELETE could not see rows the INSERT had
> just written. It returned 0, and three `__probe__` rows persisted in
> production until they were found and removed. To verify a write path against
> real data, do the insert and the cleanup as **separate statements** and check
> in between — or probe a scratch project instead.

### The budget guard fails closed

`creditsSpentToday` returns `null`, not `0`, when the ledger cannot be read — a
missing view, a permissions problem, an outage — and `checkBudget` refuses on
`null`.

This was a real bug on the first pass: the query destructured only `data` and
swallowed `error`, so an unreadable ledger read as "nothing spent" and the guard
passed unconditionally. Against a ~200-credit balance that is not known to
refill, spending blind is the one genuinely expensive mistake available here, and
it would have been live the moment prod deployed ahead of `0014`. Refusing costs
nothing by comparison: Bandsintown degrades to the other three providers, which
every call site already handles.

### Still to do for the first deploy

1. **Set Root Directory to `stub`** in Vercel → Settings → Build & Deployment.
   This is a monorepo; without it Vercel builds the repo root and fails.
2. **Add environment variables** in Vercel (see §1.3). At minimum:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `TOKEN_ENCRYPTION_KEY`,
   `CRON_SECRET`, `TICKETMASTER_API_KEY`, `SETLISTFM_API_KEY`.
   **Do not** set `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` in Production.
3. Push the `vercel.json` fix, then redeploy.

Project: `prj_FChnfQJaJ4YbeLabejV05nkVWBbb` (team `dbob3226-4368s-projects`,
hobby plan). **Deployed and serving** — 8 production deployments, latest builds
clean in ~30s. Items 1–3 above are done.

### ⚠ Deployment Protection makes the deploy URLs look broken

This is what "the production build won't load" actually was — **not** a build
failure. The build was `READY` with zero errors.

| URL | Result |
|---|---|
| `stub-<hash>-…vercel.app` | **302 → `vercel.com/sso-api`** (Vercel login wall) |
| `stub-git-main-…vercel.app` | **302 → `vercel.com/sso-api`** |
| `stub-two.vercel.app` | **200 OK** |

Vercel Authentication is on, so per-deployment and branch URLs are viewable only
by the Vercel team. **Anyone you send those links to sees a login wall.** Use
`stub-two.vercel.app` — which is also the host the Gmail OAuth redirect points
at (§1.2) — or turn Deployment Protection off before sharing.

> Unrelated red herring: the build log's `npm warn allow-scripts …
> unrs-resolver` is a warning, not an error. `unrs-resolver` is a transitive dep
> of the ESLint toolchain and is not imported by the app or by `next build`.

### ~~Confirm `RAPID_API_KEY` is in Vercel Production~~ — **confirmed set**

Worth keeping in mind whenever this key rotates or a new environment is created:
the match cascade (§5.11) degrades **silently** without it. `isConfigured()`
returns false, Spotify is skipped, and club shows quietly go back to being
unmatched with nothing in the logs to say why. A typo in the variable *name*
fails exactly the same way.

---

## 2. Can friends use it as a PWA? — **yes, with caveats**

Deploy to Vercel, send them the URL, they Add to Home Screen. No app store, no
TestFlight, no review. Confirmed working: manifest, service worker, standalone
display, safe-area insets.

What actually constrains the friend group:

| Thing | Limit | Notes |
|---|---|---|
| Google sign-in | **none**, after §1.2 | Publish the basic-scope client |
| Supabase free tier | 50,000 MAU | Irrelevant at this size |
| Gmail scanning | **100 users** | Hard cap; needs CASA audit to exceed |
| Spotify import | **5 users** | Hard cap, Premium required (see §5.1) |
| Web push on iOS | 16.4+, **installed only** | Won't fire from a browser tab |

**Free-tier gotcha** — **RESOLVED 2026-08-29.** Supabase pauses a project after
roughly 7 days idle, and the first person back would hit a dead app rather than
a slow one. `api/cron/keepalive` writes one row to `service_heartbeat`, called
daily from `.github/workflows/stub-cron.yml`.

`gmail-sync` already queried the database every 30 minutes and in practice kept
it awake, but only for accounts that are connected and active — an app with no
connected mailbox does no database work at all — and it is exactly the sort of
job that gets switched off while debugging. The keep-alive has no third-party
dependency and no per-user state, so it fails only when something real is wrong,
and the row's timestamp says when it last ran.

Not a Vercel cron: the Hobby plan caps those at two and both slots are taken.

### Onboarding gap — **RESOLVED 2026-08-29**
Two invite paths now exist.

**Friend invite link** (`friend_invites`, `/invite/[token]`). Adding by handle
required the handle to travel out of band first, which is a chicken-and-egg
problem for a new user. The link carries the identity: open it, sign in, already
friends. Reusable up to 25 times and expiring after 30 days, because the real
use is one link pasted into a group chat. Redemption runs through the service
role — the redeemer holds the token but cannot see the row it names.

This needed a fix in the sign-in path to work at all: `/login` was dropping the
`?next=` middleware sets, so a signed-out visitor following an invite landed on
an empty Upcoming with no friendship made. `next` is now carried through OAuth
and the magic link, guarded against protocol-relative off-site redirects on both
ends.

**Event invites** (`event_invites`). "You should come to this" — a show sent to a
specific friend, landing in their Inbox with the sender's name on it. Accepting
records `interested` rather than `going`: being invited is not the same as
holding a ticket, and Upcoming treats `going` as settled. RLS requires an
accepted friendship on insert, so this is not an open channel into a stranger's
inbox.

---

## 3. Competitive analysis

### The landscape

| App | What it's for | What it does well | What it doesn't |
|---|---|---|---|
| **Bandsintown** | Discovery + alerts | Broadest catalogue; syncs Spotify/Apple listening | No personal diary; alerts only for artists you already know |
| **Songkick** | Discovery | Cleanest UI; **venue following** | Shrinking; API effectively closed to new partners |
| **DICE** | Ticketing | Curated, anti-scalping, no resale above face | Only select cities; its own inventory only |
| **Banded** | Gig diary | "Letterboxd for concerts" — log, **rate**, share history | iOS only; no discovery or auto-import |
| **Concerts Remembered** | Post-show log | Memory-keeping | Manual entry only |
| **setlist.fm** | Setlist data | Canonical since 2008; attended-shows history | Not an app for planning |

### The gap Stub fills

The recurring theme across every 2026 roundup: **people use one app for
discovery and a different one for their diary.** Nobody joins them.

And **no one is doing automatic ticket detection from email.** That's Stub's
actual wedge — the Shop-for-concerts idea. Everything else here is table stakes
you'd add around it.

### Missing features, ranked by (value ÷ effort)

~~**Show the setlist on past events**~~ — **DONE.** `getSetlistForEvent()` matches
on artist + date (in the venue's timezone) and renders on `/event/[id]` for shows
that have happened. Covers, guests and tape tracks are annotated.

~~**Ratings + a short review per show**~~ — **DONE.** Migration `0009` adds
`rating` (1-5), `review`, `rated_at` to `attendances`. Stars on the event page
for past shows you attended, stars on Archive cards, and friends' ratings and
reviews render on the event page.

The `review` / `notes` split is the point: `review` rides on the attendance row
so accepted friends see it under `visibility = 'friends'`; `notes` stays
owner-only with no friend path in RLS. The UI says which is which, since they
sit inches apart on the same page.

~~**3. "Artist you follow just announced a show"**~~ — **DONE 2026-08-30.**
`api/cron/announce`, daily at 16:00 UTC.

Diffs `user_artists` against upcoming `events` and pushes, deduping on
`sent_reminders` with `kind = 'announce'`. Skips shows the user is already
attending, and anything more than a year out.

Two implementation notes worth keeping:

- **It claims the send before pushing.** The `sent_reminders` insert IS the
  dedupe, and its primary key makes it atomic, so a concurrent run loses the
  race and skips instead of double-notifying. Pushing first and recording after
  would double-send whenever the write failed.
- **It announces from the local catalog, not a per-artist provider sweep.** The
  catalog is shared, so an artist's new date usually arrives via someone else's
  ingestion at zero provider cost. The honest trade-off: **an artist nobody has
  searched for will not announce.** A bounded Ticketmaster refresh for followed
  artists is the natural next step — free at 5,000/day — and slots in ahead of
  the diff without changing anything else.

**VAPID_SUBJECT must be a real `mailto:`.** Apple's push service rejects a
placeholder, so leaving it unset means iOS pushes fail while every other
platform succeeds — a failure that looks like a device bug.

**4. Friend activity feed** — **M**
Friends' plans exist only as a list on `/friends`. A chronological "Marisol is
going to X", "Dev rated Y" feed is what makes a social app feel alive.

~~**5. Year in review**~~ — **DONE 2026-08-30.** `/year/[year]`, linked from each
Archive year heading. Shows, distinct artists, venues, cities, total spent,
tickets bought, first-time artists, average rating, most-seen artist and venue,
busiest month, and the year's first and last show.

Two things worth keeping right:

- **Honest totals.** A show with no receipt is *unknown*, not free. Spend and
  ticket counts report the denominator they cover (`from 3 of 11 with a
  receipt`) rather than implying the total is complete, and return null rather
  than 0 when nothing is priced.
- **Years are bucketed in the VENUE's zone.** A 9pm New Year's Eve show in San
  Francisco is `2026-01-01T04:00:00Z`; bucketing on the stored instant files it
  under the wrong year — the same class of bug as the 5 AM card. Tested.

Costs nothing to serve: it is a pure function over rows `/archive` already
fetches, so no extra query and no provider call.

**6. Venue following** — *Songkick's differentiator.* **M**
`user_venues` mirroring `user_artists`. Strong for people who follow a local room
rather than specific acts.

~~**Setlists on Archive cards**~~ — **DONE 2026-08-30.** A "Setlist" pill on any
archived card whose setlist is already cached. Reads `event_setlists` only —
**no setlist.fm calls** — because it is the strictest limit we deal with and one
lookup per Archive row would be both slow and a good way to get 403'd. The
consequence, stated plainly: a show whose setlist exists but has never been
opened shows no pill until someone opens it once.

**7. Photos per show** — **M**
Supabase Storage is already wired for avatars. Same pattern, new bucket. Turns
the Archive into a scrapbook.

**8. Map view** — **L**
`venues.lat/lng` are already populated. Needs a map lib and careful PWA weight.

**9. Festivals / multi-day** — **L**
Currently every event is a single row with one start time. Festivals need a
parent/child model. Defer until it actually bites.

---

## 4. Search is too restrictive — real fix available

~~**The problem:** Ticketmaster matches whole words only.~~ — **SOLVED, by
Spotify (RapidAPI).** See §5.10. `"Chris L"` → Chris Lake and `"taylor swif"` →
Taylor Swift, and the match is to a canonical Spotify artist id, which also kills
the tribute-act wart described at the bottom of this section.

The MusicBrainz-typeahead plan below is no longer needed — Spotify does both
halves (name resolution *and* dates) in one request. `providers/musicbrainz.ts`
stays for the Spotify-OAuth import path, which resolves names to MBIDs.

<details><summary>Original plan, superseded</summary>

**The fix: split typeahead from date lookup.**

- **MusicBrainz for the typeahead.** It's Lucene-backed and supports wildcards —
  `artist:chris\ l*` matches mid-word. Free, no user cap, no key. Rate limited to
  1 req/s, so debounce and cache. `src/lib/providers/musicbrainz.ts` already
  exists.
- **Ticketmaster for the dates**, once an artist is chosen.

</details>

Also worth doing:
- **Cache picked artists locally** and search `artists` first (the `pg_trgm` GIN
  index is already built for exactly this) before hitting any API.
~~**Broader catalogue**~~ — **DONE (JamBase).** Base URL is
`https://api.data.jambase.com/v3` (not `data.jambase.com`, which serves the docs
SPA). Bearer auth. Search params: `artistName`, `geoLatitude` + `geoLongitude` +
`geoRadiusAmount` + `geoRadiusUnits`, `eventDateFrom` / `eventDateTo`.
`geoCityId` and `geoMetroId` are rejected despite appearing in docs.

Measured against the case that prompted it — **Overmono in San Francisco**:

| | Ticketmaster | JamBase |
|---|---|---|
| Overmono events worldwide | 8 | 17 |
| **In San Francisco** | **0** | **1 (Portola, Pier 80)** |
| All upcoming within 25mi of SF | — | **1,546** |

Ticketmaster misses it because the SF date is a *festival appearance* it doesn't
sell tickets to. `src/lib/providers/jambase.ts` + `upsertJamBaseEvent` in
`catalog.ts`; migration `0010` adds `jambase_id` to events/venues/artists plus
`is_festival` and `ends_at`. Search falls back to Ticketmaster if the key is
absent or the call fails.

> **Billing:** JamBase is a **14-day trial**, not a free tier. When it lapses,
> search silently degrades to Ticketmaster — which is safe, but re-opens the
> coverage gap. Decide before the trial ends.

**Still to do on JamBase:**
- **Deduplicate against Ticketmaster.** The same show can exist under both
  `tm_id` and `jambase_id` as two catalog rows. Needs a reconciliation pass on
  (artist, date, venue).
- **Bandsintown** remains the free alternative if the JamBase bill isn't worth it.

**Known wart:** searching a famous name surfaces tribute acts as if they were the
real artist ("Taylor Swift" → *Warner Vineyards, Paw Paw*). Ticketmaster's
attraction matching is loose. Doesn't affect email ingestion (which scores on
artist **and** date **and** venue), but Browse can mislead. Consider filtering on
attraction `upcomingEvents` count or exact-name match.

---

### 4.1 Supabase branching — not now, maybe on Pro

Considered branching instead of a second project. It does not fit this case:

- **Pro plan only** ($25/mo); the free plan has no branching. Each branch also
  bills ~$0.013/hr (~$9.68/mo if left running), and compute credits do not offset it.
- **It runs the other direction.** Your main project *is* production; branches are
  ephemeral previews you merge *into* main. There is no "branch as production".
- **It would not have solved the problem.** The seeded accounts live in the main
  project, so making that production keeps the backdoor. Branches are data-less
  and would have started clean while prod stayed compromised.

Supabase's own guidance: branches for short-lived PR previews, a **separate
project** for anything long-lived. Two projects is correct here.

**Revisit on Pro** for per-PR preview databases wired to Vercel preview
deployments — that is what branching is genuinely good at.

---

## 5. Integrations

### 5.1 Spotify — built, but hard-capped
Since Feb 2026: **5 authorized users**, developer must hold Premium, one Client
ID per developer. Fine for a small friend group, fatal beyond it. The UI already
says so. Extended quota requires a commercial application.

### 5.2 Last.fm — the better option, not yet built
Free API, **no user cap**, no Premium requirement. Scrobble history is a richer
favourites signal than Spotify follows. Strictly better than Spotify for this use
case. **Recommend building this instead of relying on Spotify.**

### 5.3 Apple Music — blocked on $99/yr
MusicKit needs an active Apple Developer membership. Sign in with Apple, same.
Both have documented stubs. Only worth it if you go to the App Store.

### 5.4 setlist.fm — **working**
Key is in `.env.local`. Powers both the archive backfill and the setlist display.

**Gotcha worth remembering:** setlist.fm signals rate limiting with
**`403 Forbidden`, not `429`** — indistinguishable from a bad key at a glance.
Measured: rapid sequential calls intermittently 403; ~1.2s spacing is reliably
fine. The client now spaces calls 700ms apart and retries a 403 with exponential
backoff before concluding the key is wrong.

Not yet done: the archive import needs your setlist.fm **username** to run.

### 5.5 Calendar — **done**
Per-event `.ics` download and a subscribable `webcal://` feed with a rotatable
token. Notes are included in your own download, excluded from the shared feed.

---

## 5.6 Location-aware search — **DONE**

Browse now searches by artist, by location, or both. "Near me" uses browser
geolocation with a 10/25/50/100-mile radius; location alone answers "what's on
near me". Festivals are labelled, and the searched artist is shown rather than
an arbitrary lineup member — searching Overmono used to surface "Robyn" because
she was first in Portola's lineup.

~~**Still to do:** search by *named* city~~ — **DONE.** Browse has a city box
next to the artist box; `/api/search/events?place=` geocodes the name through
Nominatim (`src/lib/providers/geocode.ts`) and searches that radius. Free, no
key, no user cap — the same trade as MusicBrainz, at a hard 1 req/s.

`profiles.home_lat` / `home_lng` are populated at last: `resolveHomeLocation()`
geocodes `home_city` once, stores the coordinates, and Browse opens on them —
so the common case never raises the geolocation prompt at all. Changing your
home city nulls them, and the next Browse visit refills them.

Coordinates beat a place name wherever both are present, in the route and in the
UI both, so "Near me" is never silently overridden by stale text in the box.

**Gotcha worth remembering:** Nominatim fills `address.city` with the
*enclosing* city, so "Brooklyn" comes back as `suburb` with `city: "New York"`.
Labelling from the address gives Brooklyn's coordinates the name "New York, NY".
`hit.name` is the field that means what you want. Caught by a live call, not by
a fixture — which is why `test/geocode.test.ts` has a `LIVE_TEST=1` half that
calls the real service.

---

## 5.7 Ingestion fixes from the first real Gmail connect

Connecting a real inbox surfaced three bugs that each independently hid a show.
The trigger was a **forwarded** Ticketmaster confirmation (a spouse forwarding
"Fwd: You Got Tickets To Moby"):

1. **The Gmail query never fetched it.** No subject pattern matched "You Got
   Tickets To", and a forward's sender is a personal address, so `from:` filters
   miss too. The message was invisible to the sync.
2. **No extractor matched.** Every vendor extractor keys off the sender domain,
   which forwarding destroys — and Gmail strips JSON-LD when forwarding, so the
   structured path was gone as well.
3. **`findOrderNumber` returned "Confirmed".** It captured the next word after
   "Order" in "Order Confirmed", and its character class excluded `/`, which
   would also have truncated `54-48418/NCA` to `54-48418`.

Fixed: `unwrapForward()` in `normalize.ts` rewrites a forward to look like the
original (sender + subject pulled from the forward header); broader Ticketmaster
subject patterns; order-number candidates must contain a digit and may contain
`/`. Covered by the `forwardedTicketmaster` fixture.

### 5.7.1 Five more real emails, five more holes — **all fixed**

Run against real mail from AXS, See Tickets/Eventim and Frontgate: **all five
failed.** Each was a distinct hole, not one bug five times.

| Email | Failed because |
|---|---|
| AXS "Thank you for your order for Chris Stussy - Presale" | subject matched no pattern |
| AXS "Thank you for your order for Kaskade - Presale" | same |
| AXS "You Received Tickets" (a transfer) | same, and an unhandled body shape |
| See Tickets "Here Are Your Tickets for Shiba San" | vendor had **no field extraction at all** |
| Frontgate "Your Outside Lands Receipt" | **no extractor existed** |

**1. AXS's real subjects were never matched.** The pattern wanted "order
confirmation" / "your tickets"; AXS actually sends *"Thank you for your order
for X - Presale"* and *"You Received Tickets"*. Neither matched, so the emails
were never even opened. Broadened, and `cleanArtistName` now strips the
ticket-type suffixes AXS appends (`- Presale`, `- Admissions`) from a
**whitelist** — not a blanket "drop everything after a dash", which would maul
legitimately hyphenated names.

**2. The event date lived only in the HTML part.** AXS sends
`multipart/alternative`, and the **text part is a degraded copy**: its
order-details table collapses to `Order details for **  *Quantity* *Type* …`
with artist, venue and date stripped out. The HTML carries the real line:

> `Order details for Chris Stussy - Presale at Shed A scheduled on 2/27/2026 6:00 PM`

The pipeline prefers `email.text` when present, so the extractor was reading the
gutted copy and falling back to the generic date scan — which returned the
**order** date (Jan 27) as the event date (Feb 27). The AXS extractor now checks
the HTML first and only then the text part.

> Sharpest lesson here: `text || htmlToText(html)` is not a safe default. A
> vendor's text alternative can be strictly less informative than its HTML.

**3. Ticket transfers are a different shape.** "Alex transferred 3 tickets to
you for the following event:" followed by three bare lines — date, event, venue —
with no order number and no price. A gifted ticket is still a show you are going
to, so it now parses; the "needs a name and a date" guard passes on those two
alone.

**4. See Tickets matched but never produced anything.** Its spec had no
`specific`, so no artist, event or venue was ever set, and the
"needs at least one of them" guard rejected **every** message. It now reads the
guest-list phrasing and the labelled block, stitching the door time
("Show 10:00PM") onto the date line two rows above it.

**5. "Sub Total" beat "Grand Total".** `findPrice` had no word boundary, so
`total` matched inside `Sub*total*` and the first hit won — recording $240.00
for a $311.64 AXS order, and $1018.00 for a $1037.95 Frontgate one. Amounts are
now scored by label, subtotals/fees/shipping excluded, ties going to the last
match because a receipt builds up to its total.

**6. Order numbers phrased in prose.** AXS writes "Your confirmation number is
*46641640*" — a connector word and emphasis marks where `findOrderNumber`
expected a colon.

Also added: a `frontgate` vendor (it handles Outside Lands, ACL and much of the
US festival circuit), multi-day festival receipts filing under their first day,
and the three missing subjects in `buildTicketQuery` so **forwarded** copies get
fetched at all.

All five now yield artist/event, venue, city, region, correct start time, order
reference and price. Covered by `axsOrderPresale`, `axsTransfer`,
`seeTicketsGuestList` and `frontgateFestival` in `test/fixtures/emails.ts`.

> One encoding note worth keeping: AXS writes the time as `6:00\u202fPM` with a
> **narrow no-break space**. JS `\s` covers U+202F so `parseTime` copes — but
> only if the body was decoded as UTF-8. Decode it per-byte as latin1 and it
> becomes mojibake that silently stops matching.

### 5.7.2 Second batch — Eventbrite, See Tickets, DICE

Three more real emails. One parsed but with a subtly invalid date; two were
wrong or missing entirely.

**1. DICE matched no extractor at all.** Its subject *is* the event title —
"SLOTHACID TOUR: SACHA ROBOTTI + TRUTH X LIES" — so no subject pattern can ever
match it. Vendor specs now support `trustDomain`, accepting on the sender domain
alone. `tickets@dice.fm` is purely transactional, so that is safe *provided*
something else rejects marketing: the body (or subject) must carry a
confirmation marker — "you're going to", "purchase confirmation", "ticket
details". Without that guard a promo for a dated show has both a name and a date
and would parse as a ticket the user never bought. There is a test for exactly
that.

**2. DICE's date has no year.** It renders "Sat 01 Oct,10:00 PM GMT-7", and the
year appears nowhere in the message. `findDate` now takes an opt-in
`yearlessReference` (the email's received date) and picks the year landing
nearest it. Opt-in on purpose — a bare "01 Oct" is a weak signal — and it
additionally requires an attached time before it will fire.

**3. See Tickets invented an artist called "Here Are Your Tickets".** When the
subject carries no artist, the strip pattern found no "for", removed nothing,
and returned the whole subject. That would have created a junk artist row and
poisoned matching. Two fixes: a `BOILERPLATE_SUBJECT` guard that returns nothing
rather than boilerplate, and reading the real bill out of the body, where it
sits directly above the date, headliner first:

```
Goldenvoice Presents
Mipso          <- headliner
Julia Pratt    <- support
Saturday, February 17, 2024
```

**4. Doors time was being filed as the start time.** "Doors 8:00PM | Show
9:00PM" is one line with doors first, so the gig landed an hour early. The show
time now wins.

**5. `*Mipso*` — emphasis markers leaked into the artist name.** A
`multipart/alternative` text part renders bold as `*X*`, and reading a name out
of the body picks the asterisks up. Stripped in `cleanArtistName`.

**6. Eventbrite's `startDate` is not valid ISO 8601.** It emits
`"2024-06-23 14:00:00"` — a space where ISO requires a `T`. V8 parses it, so it
looks fine locally and would have gone unnoticed; strict parsers return NaN.
Normalised in the JSON-LD extractor.

> Two traps worth remembering from this batch. A `\b`-anchored label is not
> enough for a labelled row: `\bEvent\s*\n` matched the prose "…to access this
> **event**" and captured the next line, which was the HTML entity `&#8202;` —
> so DICE briefly reported an artist named `&#8202;`. Labelled rows are matched
> to a whole line now, and a candidate with no letters or digits is rejected.
> Second, the Eventbrite order was genuinely **free** ($0.00), so a missing
> price there is correct rather than a bug — worth checking before "fixing".

Covered by `eventbriteSpacedStartDate`, `seeTicketsNoArtistInSubject` and
`diceEventTitleSubject`.

**Still open — worth doing while real mail is flowing:**
- Every confirmation that fails to parse should be added to
  `test/fixtures/emails.ts` (scrubbed) and fixed against. That is the intended
  workflow and the only way coverage improves.
- **Nothing yet reconciles a festival receipt against a festival event.** The
  Frontgate receipt yields `eventName: "Outside Lands"` with no artist, which the
  matcher (artist + date + venue) is not built to place. Related to the
  `is_festival` work in §4.
- ~~The Inbox review queue currently only shows *parsed* candidates.~~ —
  **DONE.** A collapsed "Scanned, nothing found" section on `/inbox` lists the
  last 50 messages with `status` in (`ignored`, `error`), with subject, sender,
  date and — for errors — the error itself. Those are the ones worth scrubbing
  into `test/fixtures/emails.ts`; until now the only debuggable case was the one
  case with no UI.

### Added alongside
- **Manual event entry** (`createManualEvent`, offered from Browse). Necessary,
  not a nicety: an AXS club show (Overmono DJ Set + Ben UFO, SF) is absent from
  **both** JamBase and Ticketmaster. No aggregator covers afterparties well.
- **"Check for new tickets"** button — full 30-day re-scan on demand, with a
  scanned/added/review/skipped breakdown so a miss is diagnosable. Waiting 30
  minutes for cron to learn whether parsing worked is a miserable loop.
- **One-step Gmail disconnect**, which deletes the stored tokens rather than
  flagging the row inactive.

---

## 5.7.2 The Silva Bumpa row — two provider bugs, one card — **FIXED**

An Eventbrite confirmation for **Silva Bumpa at Monarch, San Francisco**
rendered as:

```
Silva Bumpa
Silva Bumpa y Dean Turnley
Mon, Sep 28 · 5:00 AM
Monarch · San Francisco · CA
```

Three things wrong on one card, none of them in the email parsing. The ticket
matched the **Spotify concerts** provider — Ticketmaster returns nothing for
this show and JamBase's only same-day SF event is Portola — and every fault was
in what that provider gave us or what we did with it. All three verified against
the live API on 2026-08-29.

### The time was never 5:00 AM

The API returns `2026-09-27T22:00-07:00`, which normalises to the correct
instant `2026-09-28T05:00:00.000Z`. The bug was that `upsertSpotifyEvent` wrote
**`timezone: null`**, on the reasoning that a UTC offset is not an IANA zone —
true, but it left nothing to render with. The format helpers pass no `timeZone`
option when they have none, so `toLocaleString` falls back to the RUNTIME's
zone, and every page here is server-rendered on Vercel, in UTC. 10pm Pacific,
displayed in UTC, is 5:00 AM the next morning. The instant was right the whole
time.

Fixed in three layers, because any one of them alone leaves a gap:

- **`lib/timezone.ts`** — region -> IANA, US states and Canadian provinces,
  disambiguating "CA" by country. Lifted out of `actions.ts`, where a copy had
  been written for the manual-entry form, and now shared.
- **Write time** — `upsertSpotifyEvent` resolves the zone from the venue row a
  richer provider already placed, then from the region, and backfills the venue
  row so the next provider inherits it.
- **Render time** — `format.eventZone()` walks event -> venue -> region.
  Nothing reads `event.timezone` directly any more, including the push
  reminders, which were announcing the wrong showtime for the same reason.

### The Spanish was Spotify's, and we cannot turn it off

The title came back as `"Silva Bumpa y Dean Turnley"`. Spotify builds a
multi-act concert title server-side and **localizes it from `Accept-Language`**.
Fetching the concert page directly proves it — one URL, two languages:

```
Accept-Language: en-US -> "Silva Bumpa, Dean Turnley Tickets San Francisco (Monarch) on 9/27/2026 at 10:00 PM"
Accept-Language: es-ES -> "Entradas para Silva Bumpa y Dean Turnley en San Francisco (Monarch) el 27/9/2026 a las 22:00"
```

(That English string is also independent confirmation of the timezone fix:
**10:00 PM on 9/27**, not 5:00 AM on 9/28.)

**The `spotify81` proxy sends a Spanish `Accept-Language` upstream and there is
no way to override it.** Tested against `/partner/concert` on 2026-08-29 — all
three returned `"Silva Bumpa y Dean Turnley"`:

| Attempt | Result |
|---|---|
| plain request | Spanish |
| `Accept-Language: en-US` on the call to the proxy | Spanish — not forwarded |
| `locale=en_US` + `market=US` + `language=en` | Spanish — params ignored |

And there is nothing to pass: the endpoint's entire parameter surface is
`query`, `details`, `detailsLimit`, `geoHash`, `includeNearby`, `parsed`. No
locale, documented or otherwise.

**This is a different axis from the Montreal thing.** The proxy's *geo* default
resolves to Montreal — that is why `nearby` is useless and why the related
concerts are all Quebec. But a Montreal server would give French `"et"`, not
Spanish `"y"`. Location and language are set independently upstream, and only
the geo one was already documented. The earlier note in this file blaming server
location for the language was wrong.

So the title is rebuilt from the `artists` array, which is clean and which we
were already reading. The separator list covers more than Spanish deliberately:
the locale this proxy is pinned to could change under us, and the rebuild should
survive it.

The same response carries `"Real McCoy y Turbo B."`, `"Tinlicker y Helsloot"`,
and a five-act bill as `"Dom Dolla, Chris Lorenzo, Silva Bumpa, Bushbaby y Cole
Knight"`. The existing `publicWorks` test fixture had `"Overmono y Ben UFO"` in
it the whole time and nobody noticed.

### Would the official Spotify Web API fix this? — **no**

Checked, because it is the obvious question. **The public Web API has no
concerts.** It covers albums, artists, tracks, playlists, player, search,
audiobooks and episodes; there is no live-events, tour-date or ticketing
endpoint in it at all. Spotify's concert graph sits behind an internal partner
API — the `spotify:concert:` URIs and `open.spotify.com/concert` pages — which
is exactly what this proxy wraps. That is why the proxy is *necessary*, not
merely convenient, and switching to the Web API would mean losing the club-show
coverage that motivated adding it (§5.10).

It would also be a dead end for a friend-group app on its own terms: a
development-mode app is capped at **5 allowlisted users**, and extended quota
mode has required an **organisation with 250,000+ monthly active users** since
May 2025 — a bar this project cannot clear. That is the same cap that keeps
`providers/spotify.ts` a per-user connection rather than the sign-in method
(§5.1).

### What the Web API IS good for — **BUILT, but narrower than expected**

Artist artwork, as a **fallback**. `providers/spotify.ts` now carries both flows;
`getArtistMetadata()` is the client-credentials one. It needs only the app's id
and secret — no redirect URI, no user consent, and the 5-user cap does not bind
it, because it authorizes no users.

Two live findings on 2026-08-29 cut the feature down from what it was pitched as.
Both are pinned by `test/live-spotify.test.ts` (`LIVE_TEST=1`).

**1. February 2026 removed every "Get Several" endpoint for development-mode
apps.** Measured with an app token:

| Endpoint | Status |
|---|---|
| `GET /artists/{id}` | **200** |
| `GET /artists?ids=…` | **403** |
| `GET /albums/{id}` / `?ids=` | 200 / **403** |
| `GET /tracks/{id}` / `?ids=` | 200 / **403** |
| `GET /search` | 200 (`limit` now caps at 10) |
| `GET /artists/{id}/albums` | 200 |
| `GET /artists/{id}/top-tracks` | **403** |
| `GET /artists/{id}/related-artists` | **403** |
| `GET /browse/new-releases`, `GET /markets` | **403** |

This matches the [published list](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
with one exception: the changelog says Get Related Artists is still supported
and it answered 403. So enrichment costs **one request per artist**, not one per
lineup — which is why the batching the first cut was built around had to go.

**2. Genres are gone, and artwork is the same URL we already had.** The
dev-mode artist object is exactly `external_urls`, `href`, `id`, `images`,
`name`, `type`, `uri`. The migration guide lists `followers` and `popularity` as
removed and does **not** list `genres` — but no artist returns one, Taylor Swift
and The Weeknd included. Artist genres therefore still come only from
Ticketmaster and JamBase.

And the image it returns for Silva Bumpa is byte-identical to the one the
concerts proxy already gave us — `ab6761610000e5eb…`, the same 640px render.

So this is **not** an upgrade over the proxy. It is worth having for exactly one
case: the proxy carries artist artwork only in its `details` view, and
`detailsLimit` caps how many concerts in a response get that view, so later rows
of a long tour come back as bare names. Those artists have a Spotify id and no
picture, and this is the only way to give them one.

Scoped accordingly, so it is close to free in the steady state:

- **Only acts with no image in the payload** are looked up at all.
- **`missingArtwork()`** then drops any the database already resolved — which is
  what stops the multi-year backfill (§5.15), persisting hundreds of events in a
  row, from re-asking the same questions hundreds of times.
- **`MAX_LOOKUPS = 12`**, concurrency 4, one 429 retry honouring `Retry-After`
  only when the wait is short.
- **Best-effort throughout.** No credentials, a failed token, a 403, a 404, a
  network throw — all yield an empty map and the proxy's image stands.

Existing rows are backfilled by pass 3 of `api/cron/repair`, which asks only
about artists with a Spotify id and no image at all.

**Still not a replacement for the concerts proxy** — no live-event data exists in
the Web API. This is a complement, and a small one.

### Alternatives evaluated and rejected

| Option | Why not |
|---|---|
| A different RapidAPI Spotify wrapper | They all scrape the same upstream — responses carry `"source": "pathfinder-v2"`, Spotify's internal gateway. Reproduced the Spanish through **two independent subscriptions** (our key and a separate one), so the locale is pinned at the vendor's client, not at our account. No wrapper documents or exposes a locale knob, the vendor's own portal included. Picking one that happens to answer in English is luck that can flip silently. |
| Official Spotify Web API for concerts | No concerts endpoint exists. |
| Songkick | Closed: *"not approving API requests for student projects, educational purposes or hobbyist purposes."* Paid licensing and a signed partnership agreement only. |

The rewrite only fires when the stored title is **demonstrably nothing but the
lineup joined together**: split on every separator and conjunction we know of,
and require the pieces to be exactly the set of billed acts. `"Goldrush:
Midnight Riders"` and `"Leeds Festival 2026 - Sunday"` fail that test and pass
through untouched, which is the important half — those titles carry information
the lineup does not. It also fails safe on a name that contains a conjunction:
`"Y La Bamba"` splits into `"La Bamba"`, stops matching, and the provider's
title survives.

A display-layer `.replace(/ y /, ' and ')` was the tempting fix and is the wrong
one: it only handles Spanish, it leaves the database wrong, and it does not
reach the ICS feed, the calendar subscription, the push payload, or the matcher.

### The missing artist photo

Spotify **does** have artwork for both acts — but only under `details.artists[]`,
and `normalizeConcert` was reading the top-level `artists`, which carries names
alone. So `upsertSpotifyArtist` stored no `image_url`, and for a club-circuit
act no other provider in the cascade has one either. The lineup is now merged
from both views and the artwork stored.

`initials()` is the fallback for when it genuinely is absent — "SB" on a tinted
tile, rather than an empty grey square.

### Repairing rows already written

**Re-ingesting the email does not fix these.** Ingestion dedupes on a content
hash, so a confirmation that has been read once is skipped forever. Existing
rows have to be repaired in place: `api/cron/repair` (CRON_SECRET, manual
trigger only, idempotent) fills missing venue and event zones and rewrites
titles that are localized lineup joins. Run it once via the workflow's
`workflow_dispatch` after deploying.

---

## 5.16 Eventbrite — the first FIRST-PARTY provider — 2026-08-29

Every other provider in the cascade is a third party guessing which real-world
show a ticket refers to. Eventbrite is not: when an Eventbrite confirmation
lands, the email carries the **event id**, and we hand it back to the company
that sold the ticket.

That closes the exact gap §5.7.2 is about. For the Monarch booking:

| Field | Spotify proxy | Email JSON-LD | **Eventbrite API** |
|---|---|---|---|
| name | `Silva Bumpa y Dean Turnley` | `Silva Bumpa` | **`Silva Bumpa`** |
| start | correct instant | `2026-09-27 22:00:00` (no zone) | **`2026-09-28T05:00:00Z`** |
| timezone | **null** — the bug | absent | **`America/Los_Angeles`** |
| venue | Monarch | Monarch | **Monarch + coordinates** |
| image | none | none | **event artwork** |

Even the confirmation email's own structured data cannot supply the zone. Only
the vendor knows it.

### Free, and by a wide margin the cheapest thing here

Measured from the `x-rate-limit` response header: **2,000 requests per hour**.

| Provider | Allowance |
|---|---|
| Ticketmaster | 5,000/day |
| **Eventbrite** | **2,000/hour** |
| JamBase | trial quota |
| Spotify (RapidAPI) | 1,000/month |
| Bandsintown (Parse) | ~200 credits total |

So it goes **first** in the cascade. That costs nothing on other vendors' mail,
because it only runs when the email actually carried an Eventbrite link — and
when it does, `scoreCandidate` returns confidence 1 and the cascade stops before
spending a single metered request anywhere else. An Eventbrite ticket now
resolves for free where it used to walk all the way down to Spotify.

### What it cannot do

**Public event search is gone** — `/v3/events/search/` returns 404. Eventbrite
withdrew it years ago. This provider can answer "what is event 12345?" and never
"what is on near me", which is why it is not wired into Browse. `0019` and the
live suite pin both facts.

### Shape of the integration

- `providers/eventbrite.ts` — `eventIdFromText` (handles slugged URLs, bare ids,
  other TLDs, and links a bulk sender percent-encoded inside a click tracker),
  plus `getEvent`.
- `ParsedTicket.ebEventId`, extracted by the Eventbrite vendor spec, exactly
  parallel to `tmEventId`.
- `upsertEventbriteEvent` in `catalog.ts`, with `events.eventbrite_id` (`0019`).
  It **reconciles**: if Browse already created a Spotify or JamBase row for the
  same gig, this merges into it — and unlike the Bandsintown path it overwrites
  `timezone` outright, because the incumbent's is `null` by construction and
  that is the fault being corrected.
- Online-only events are skipped: a webinar is not a show anyone attends.

**No artists.** Eventbrite sells tickets to *events* and has no performer
entity, so these rows have a null `headliner_id` and no `event_artists`. The
card falls back to the event name and its initials — which for "Silva Bumpa" is
the right answer anyway.

### Not built: order import

`GET /v3/users/me/orders/` works and is a **complete purchase history** — 20
real orders back to 2016 on the live account, each with gross cost, attendee
count and the full event. That is, in one request, most of what §5.15's
multi-year email backfill is trying to reconstruct by parsing, and it is
authoritative rather than inferred.

It is not wired in because the key is a **personal token for one account**.
Using it to import "my orders" would import the token owner's orders for
whoever clicked, which is a privacy bug rather than a feature. Doing it properly
means per-user Eventbrite OAuth, alongside the Gmail and Spotify connections —
a real piece of work, and the obvious next one.

---

## 5.8 Caching and rate limits — **mostly done**

Migration `0011` adds two caches, both in Postgres rather than in process —
Vercel runs each request in a short-lived isolated function, so an in-memory
cache would be cold on most requests and shared with nobody, which is exactly
where the wins are. Original exposure:

| Provider | Limit | Current usage |
|---|---|---|
| JamBase | trial quota, unpublished | every keystroke in Browse (debounced 320ms) |
| Ticketmaster | 5000/day, 5/sec | fallback only now |
| setlist.fm | ~1/sec, 403s when exceeded | one call per past event page view |
| MusicBrainz | 1/sec, hard | artist resolution during Spotify import |

1. ~~**Cache setlist lookups in the database.**~~ — **DONE.** `event_setlists`,
   via `getCachedSetlist`. A hit is cached forever, because a past setlist does
   not change. A **miss is cached too**, for 3 days: setlist.fm entries are
   added by users days or weeks after a show, and without negative caching every
   view of an archived event re-hit an API that answers 403 when throttled. A
   provider *error* is not cached as a miss — that would poison the entry on a
   transient outage.
2. ~~**Cache search responses.**~~ — **DONE.** `search_cache`, 5-minute TTL,
   keyed on the normalised query + geo + radius + page. Coordinates are rounded
   to ~1km so two people in the same neighbourhood share an entry.
3. **Serve Browse from the local catalog first** — *still to do.* Events already
   synced live in `events`; the `pg_trgm` index exists and is unused for this.
4. ~~**Persist geocoded coordinates**~~ — **DONE**, see §5.6.

Geocoding rides on `search_cache` too (30 days on a hit, 1 hour on a miss). The
payload is wrapped as `{ place }` rather than stored bare, so a cached *miss* is
distinguishable from a cache miss — otherwise every typo re-hits a geocoder
limited to one request per second.

---

## 5.9 Browse pagination — **DONE**

An IntersectionObserver sentinel appends the next page as it scrolls into view.
The stale-response race needed its own guard here: an AbortController covers
page 1, but an append resolves later and lands on whatever is on screen, so
`loadMore` captures the results key at request time and drops the response if
the key has changed. Results are also de-duplicated on `source:id`, since a
shifting upstream page window can repeat a row.

---

## 5.10 Spotify concert graph (RapidAPI) — **DONE**

`src/lib/providers/spotifyconcerts.ts`, on the `spotify81` RapidAPI proxy.
Distinct from `providers/spotify.ts`, which is the OAuth favourites import and
is hard-capped at 5 users — **this one needs no user consent and has no
per-user cap.**

Endpoint: `GET /partner/search-concert-artists?query=…&details=true&parsed=true`.

> **Both flags are required and are not optional tuning.** `parsed=true` flattens
> Spotify's GraphQL nesting into usable rows but leaves `venueName`,
> `coordinates`, `country` and `region` **null**. `details=true` is what fills
> them. With only one of the two you get a city and nothing else, which is not
> enough to place a show.

### Why it earns a place

Measured against the two cases already in this file:

| | Ticketmaster | JamBase | **Spotify** |
|---|---|---|---|
| `"Chris L"` | 0 | — | **Chris Lake** |
| `"taylor swif"` | 0 | — | **Taylor Swift** (the real one) |
| Overmono worldwide | 8 | 17 | **17** |
| Overmono **in SF** | 0 | 1 (Portola) | **1 (Public Works)** |

That SF row is the punchline: **Overmono + Ben UFO at Public Works** is the
AXS club show §5.7 cites as absent from *both* other providers — the show that
manual entry was built for. Spotify has it. The two sources are complementary
rather than redundant: JamBase found the Portola festival set, Spotify found the
club night.

Per event it returns venue name, venue id, lat/lng, city/region/country, a
festival flag, the full billed lineup, and a share URL.

### What it cannot do

**Location-only search.** There is no "what's on near me" endpoint. `geoHash` is
accepted and echoed back in `metadata`, but `nearby` resolves from the *proxy's*
server location — it answers "Montreal" regardless — and comes back empty. So:

- **artist queries → Spotify**, and an artist query *with* a location is filtered
  locally on the coordinates every row carries (`withinRadius`), costing no
  second request;
- **location-only queries → JamBase**;
- **Ticketmaster** stays the fallback beneath both.

### Two traps worth remembering

1. **The search has no relevance floor — it always returns something.** Querying
   `zzzznotanartist` confidently answers with the band `Zzz.`. `matchesQuery()`
   rejects that. Note the guard cannot be a naive bidirectional prefix test,
   because `"zzz"` *is* a prefix of `"zzzznotanartist"`; the reverse direction is
   only accepted when the query overruns the name by ≤3 characters.
2. **A festival bills its lineup in the promoter's order.** Searching Overmono
   returns WILDLANDS, whose 25-name bill starts with John Summit and has Overmono
   tenth. `headlinerOf(concert, searched)` shows the artist you searched for —
   the same bug §5.6 already fixed once for JamBase, where Overmono surfaced as
   "Robyn".

Also: `startDateIsoString` arrives as `2026-09-27T22:00-07:00` — **no seconds**,
and an offset rather than an IANA zone. It is normalised to a real instant before
it reaches Postgres, and `events.timezone` is left null because an offset cannot
be turned into a zone. Venue coordinates are stored, so a zone can be derived
later if it matters.

### BILLING — the real constraint

**1000 requests per month** on the free plan. That is by a wide margin the
tightest limit of any provider here — roughly 33/day across all users. Mitigations
in place:

- every call goes through `cachedArtistConcerts`, **6-hour TTL** (not the 5
  minutes the JamBase path uses) — the cache is a budget control, not a latency
  optimisation;
- `quotaRemaining` is read from `x-ratelimit-requests-remaining` and logged as a
  warning below 100 left, because the failure mode is a *silent* degrade to
  JamBase;
- "Add" re-resolves a concert through the same cached search, so adding a show
  normally costs no request.

**Still to do:** the same reconciliation gap §4 already notes for JamBase now has
a third id. A show can exist as three rows under `tm_id`, `jambase_id` and
`spotify_concert_id`. Migration `0012` adds the columns; nothing dedupes them.

Related wart: `upsertSpotifyEvent` writes an artist row per billed name (capped
at 12), and only the *searched* artist can carry a Spotify id — the lineup is
`[{ name }]` with no per-artist ids. Adding one festival therefore creates a
dozen thin, id-less artist rows. Harmless but untidy, and it feeds the same
dedupe problem.

---

## 5.11 Matching: a provider cascade — **DONE**

Until now `matchTicket` asked **Ticketmaster and nothing else**. Architecturally
a matched ticket was always linked to a real catalog row — `persistCandidate`
writes the event and `recordAttendance` links the user, which is what makes the
event page and friend matching work — but the *lookup* only ever had one source,
and it is the source least likely to know about a club night.

Now: **Ticketmaster → JamBase → Spotify**, stopping at the first confident,
unambiguous match. The order is quota economics:

| Provider | Free allowance |
|---|---|
| Ticketmaster | 5,000/day (~150,000/mo) — effectively free |
| JamBase | trial quota, larger than Spotify's |
| Spotify (RapidAPI) | **1,000 per MONTH** — scarcest by two orders of magnitude |

Spotify goes **last precisely because it is the best** at club shows: the cascade
only reaches it once the cheap providers have failed, which is exactly the case
it wins. Spending a 1,000/month budget only on genuine misses beats spending it
on every Ticketmaster miss. When the JamBase trial lapses, `isConfigured()`
returns false and the cascade quietly becomes Ticketmaster → Spotify.

### Two things this exposed, both serious

**1. A confident match on the WRONG event.** Real ticket: Silva Bumpa at
*Monarch*, San Francisco, 27 Sep. JamBase answered with *Portola* at Pier 80
Warehouse — same city, same night, artist match **100%**, because Silva Bumpa
genuinely is on the Portola bill. It scored **0.876**, over the 0.8 auto-add
line, so it would have been added silently and the cascade would never have
reached Spotify (which has Monarch exactly).

The venue was the only thing that disagreed, and at 0.12 weight it could not
counteract anything. The root cause is conceptual: the scorer treated a
**contradicting** venue identically to a **missing** one — both merely fail to
add credit. Absence of evidence is not evidence of absence. A venue similarity
below 0.35 now caps confidence at 0.55, which keeps the candidate visible as a
review suggestion but out of auto-add, and lets the cascade continue. With the
cap in place the same ticket resolves to Spotify/Monarch at confidence **1.0**.

**2. Cross-provider duplicates read as ambiguity.** The good case for a cascade
is that several providers have the event — but two near-identical top scores
tripped the "cannot honestly pick one" rule and forced review exactly when we
were most certain. `sameShow()` collapses them: within 12 hours (providers
disagree by hours over doors vs. stage times) plus either venue or name
agreement.

### Manual entry from a parsed candidate

`confirmCandidate` refuses a candidate with no `matched_event_id` — "search for
it in Browse instead" — which was a dead end for precisely the shows aggregators
miss, and threw away a perfectly good parse. The Inbox card now offers **"Add it
anyway"**, which builds the show from the parsed artist, venue, city and date via
`createEventFromCandidate`, keeping the ticket reference and price.

---

## 5.12 Bandsintown, via Parse — **DONE**

Fourth event provider. `providers/bandsintown.ts`, migration `0014`, README
["The provider architecture"](./README.md#the-provider-architecture).

### Why a fourth provider

`get_artist_events_by_name("Overmono")` returns **Overmono @ Public Works, San
Francisco, 2026-09-27** — the club show absent from both Ticketmaster and
JamBase, and the reason manual entry exists (§5.7). Whole tour, one credit.

It also carries two fields nothing else here has: a real **IANA timezone**
(where the Spotify proxy gives only a UTC offset, which cannot be converted to a
zone), and an artist's **past tour dates**, which is a source the Archive tab has
never had — setlist.fm can only tell you what was played at a show you already
know happened.

### BILLING — the real constraint, and it is severe

Measured live on 2026-08-29: **~200 credits total**, 99/day cap, **1 credit per
artist query**. That is roughly 5x tighter than the RapidAPI Spotify quota and
four orders of magnitude tighter than Ticketmaster — and unlike the others, the
balance is not known to refill.

Consequences, all implemented:

- **Last** in the ingestion cascade, below Spotify. Reached only when a real
  ticket matched nothing cheaper — precisely the small-venue case it wins, at a
  volume of one call per unmatched email rather than per keystroke.
- **Never** on the Browse keystroke path. Gated behind `?deep=1` and a "Search
  harder" button. The flag is held as the query it was requested *for*, not a
  boolean, so editing the box drops back to the cheap providers automatically.
- 24-hour cache TTL on tours, 30 days on event detail and past events.
- A real **budget ledger** — `provider_spend` + the `provider_spend_today`
  rollup view. `checkBudget` refuses to spend past `BANDSINTOWN_DAILY_CREDITS`
  (default 25/day) *before* the call, because the upstream only reports the
  remaining balance in the response, i.e. after the credit is gone.

### Two endpoints that do not work as documented — verified live

1. **`country` / `region` filters on the artist endpoints are broken.**
   `get_artist_events_by_name("Overmono", country: "US")` returns an **empty**
   events array; the same call with no filter returns the US dates. Never pass
   them — fetch worldwide (same one credit) and filter locally.

2. **`get_city_events` ignores `start_date` / `end_date`.** A request for
   2026-09-26..2026-09-28 came back with 2026-08-29 events. Also metro-wide with
   no radius (a `san-francisco-ca` query returns San Jose, Napa, Petaluma), ~10
   rows a page, **3 credits a page**.

   So it is deliberately **not wired in**, even for deep search — JamBase does
   location better and cheaper. Bandsintown is an artist-query and event-detail
   provider here, nothing else.

### The naive-timestamp trap

Artist rows give `2026-09-27T22:00:00` with **no zone**. Writing that straight to
Postgres reads it back as UTC and puts a 22:00 San Francisco show seven hours
early. Handled in three places:

- `BITEvent.startsAtLocal` is deliberately named to stop anyone treating it as an
  instant.
- `upsertBandsintownEvent` resolves the zone in priority order — the event's own
  `timezone` (detail rows only), then the zone another provider already stored on
  the matched venue, then a bare UTC anchor with `timezone` left null (which is
  what the Spotify path already does and the UI already handles).
- `enrichEventDetails` is the only place the stored instant can be **corrected**
  once a real zone arrives — and it writes the zone onto the venue row too, so
  every future show in that room gets it free.

### Search vs. detail — the split this settles

One tier finds the show, another enriches it. `enrichEventDetails` spends a
credit only when the row is actually missing a timezone or a ticket URL, only for
rows with a `bandsintown_id`, and behind a 30-day cache. Most saved events never
trigger it.

### Reconciliation — partly done

`reconcileEvent` merges a Bandsintown write into an existing row from another
provider rather than duplicating it. Conservative on purpose: same-day start
**and** matching venue or headliner, and it refuses when two rows name different
headliners. A merge adds and fills gaps, never overwrites — `starts_at` in
particular is left alone, since the incumbent's came with a real zone.

**Still open:** this only runs when a Bandsintown write passes through. A JamBase
row and a Spotify row added a week apart still duplicate. A backfill pass over
`events` would clean those up, and is the natural next step.

### Still to do

- [x] `PARSE_API_KEY` into Vercel Production — **done 2026-08-29**.
- [x] Migration `0014` applied to prod (`biichwtrfmrdgiqtvxme`) — **done
      2026-08-29**, ahead of the deploy that ships the provider. Verified: the
      three `bandsintown_id` columns exist, all three uniques are real
      `pg_constraint` rows rather than partial indexes (the `0013` trap), and
      `provider_spend_today` resolves. Prod advisors match dev exactly.
- [x] ~~Confirm whether the ~200-credit balance refills monthly~~ — **it does.
      Parse Free is 200 credits/month.** That forced a real fix, below.
- [x] Per-user rate limit in front of `?deep=1` — **done**, `deepSearchForUser`.
- [ ] Wire `getArtistPastEvents` into the Archive tab. The provider function and
      its cache exist; nothing calls them yet.

---

## 5.12.1 The quota is monthly, and the daily cap was the wrong guard

Parse Free is **200 credits per calendar month**, not a one-off balance. `0014`
shipped assuming the latter, with only a 24-hour rollup and a 25/day cap.

That combination is wrong in an expensive direction: **25/day permits 750 a
month — 3.75x the allowance.** The budget could be honoured every single day and
still blow the month by a wide margin, and the first sign would be a dead
provider mid-month.

Now three ceilings, each doing a different job (`0016` adds the month view):

| Cap | Default | Job |
|---|---|---|
| `BANDSINTOWN_MONTHLY_CREDITS` | 180 | The real quota. 180 not 200 — Parse resets on its own clock, our boundary is UTC, and the two can disagree by hours. |
| `BANDSINTOWN_DAILY_CREDITS` | 25 | Burst limiter. Kept above 200/30 on purpose: usage is lumpy, and a hard 6/day would refuse the second genuine search of an evening while leaving the month underspent. |
| `BANDSINTOWN_DEEP_PER_USER` | 5/day | Per-person fairness — see below. |

Monthly is checked first, because it is the one that actually costs money to
exceed; the daily cap only shapes how fast the month is consumed. Both still fail
closed on an unreadable ledger.

`prune_provider_spend`'s 30-day retention is now **load-bearing** rather than
tidiness — trimming below a full calendar month would corrupt the month-to-date
total. Do not lower it.

### Per-user attribution

The global caps stop the *deployment* overspending; they say nothing about who
spent it. With 200 credits a month across the whole friend group, one person
tapping "Search harder" can consume everyone else's allowance in a sitting — and
it is invisible to them, because a refused deep search silently falls back to the
ordinary providers.

`deepSearchForUser` counts per user over the same ledger, reusing `endpoint` to
carry `deep:<uuid>` rather than adding a column. Two deliberate details:

- **A cache hit bypasses the limit entirely.** Nothing is spent, so nothing is
  charged — otherwise searching the same artist twice would burn two of five for
  one credit.
- **The attribution row is `credits: 0`.** The real cost is already logged by
  `cachedBandsintownArtist`; this row exists only to say who asked, and must not
  double-count against the global caps.

### If we need more — the scaling plan

| Tier | Cost | Credits/mo | What it unlocks |
|---|---|---|---|
| **Free** | $0 | 200 | Today. Bandsintown is last in the cascade and gated behind a button. |
| **Hobby** | $30/mo | 1,000 | 5x. First thing to buy. Enough to move Bandsintown **ahead of Spotify** for artist queries (it is the more accurate of the two — see §5.12) and to stop gating deep search behind a button. |
| **Developer** | $100/mo | 5,000 | 25x. Only worth it with real user growth, or if `get_city_events` (3 credits/page) ever becomes worth using — though its broken date filters are the reason it is unwired, and money does not fix those. |

Nothing in the code changes to move tiers — set `BANDSINTOWN_MONTHLY_CREDITS`
and `BANDSINTOWN_DAILY_CREDITS`. The cascade order in `ingest/match.ts` and the
`?deep=1` gate are the two things worth revisiting on Hobby.

**Before buying anything**, do §5.8.3 (serve Browse from the local catalog). It is
free and removes the largest single source of provider calls; the right time to
judge whether 200/month is genuinely too few is after it lands.

---

## 5.13 Account deletion — **DONE**

Self-serve, in Settings. `deleteAccount` in `app/actions.ts`,
`components/DeleteAccountButton.tsx`.

Four things have to happen and only the first is automatic:

1. **Rows.** `auth.users` → `profiles` → every user-owned table is a chain of
   `ON DELETE CASCADE`, verified against the live constraint graph rather than
   assumed. One `admin.auth.admin.deleteUser` removes attendances, notes, email
   accounts, ingest messages and candidates, friendships from both sides, push
   subscriptions, sent reminders, inbound addresses and user_artists.
2. **The Google grant.** Cascading deletes *our* copy of the refresh token but
   leaves Stub listed in the user's Google account with `gmail.readonly` still
   granted. For a restricted scope that is not good enough, so the token is
   revoked at `oauth2.googleapis.com/revoke` first. A revoke failure is logged,
   not fatal — it must not strand someone in an undeletable account.
3. **Storage.** Avatars are in the `avatars` bucket, reachable from no foreign
   key, so cascade does not touch them. Removed explicitly.
4. **Catalog rows are deliberately kept.** `artists`/`venues`/`events` are shared
   facts, not personal data — a show still happened after someone leaves, and
   deleting them would corrupt other users' timelines.

Ordering matters: revoke and clear storage **before** deleting the user, because
afterwards no row remains to say which token or which files.

The typed `DELETE` confirmation is re-checked **server-side**. A client-only
check would be decoration: this is a server action, callable by anyone holding a
session, and the cost of an accidental invocation is total.

### Still to do

- [ ] Offer a data export before deletion. Attendance history with prices is
      genuinely unrecoverable, and §3.5 argues that data is the valuable part.
- [ ] Deleting a user leaves their `ingest_messages` dedupe hashes gone, so a
      re-signup re-processes the same mail. Correct for a fresh start, worth
      knowing when testing.

---

## 5.14 Security audit — 2026-08-29

Full pass over prod: RLS, grants, secrets, endpoint auth, crypto.

### Fixed

1. **`anon` held SELECT/INSERT/UPDATE on every column of `email_accounts`,
   including `access_token` and `refresh_token`.** Migration `0015`.

   Not a live leak — RLS is on and every policy is scoped to `{authenticated}`,
   so an `anon` request matched no policy and got zero rows (confirmed
   empirically against prod: the query *succeeds* and returns nothing). The
   problem was that RLS was the **only** thing between an unauthenticated caller
   and every refresh token. One policy written for `public` instead of
   `authenticated`, or one table shipped with RLS off, and the grant becomes
   load-bearing.

   `0015` revokes `anon` across the public schema and changes the default
   privileges so new tables do not silently re-acquire it. Safe by construction:
   since `anon` already saw zero rows everywhere, revoking cannot change any
   request that works today. Verified after: 0 `anon` column grants remain on
   both dev and prod, `authenticated` grants untouched (`email_accounts` still
   exposes exactly its 7 non-token columns).

2. **Both cron endpoints failed OPEN on a missing `CRON_SECRET`.** The check was
   `if (process.env.CRON_SECRET && auth !== ...)`, so an unset variable skipped
   authentication entirely and left the route publicly triggerable.

   `/api/cron/gmail-sync` scans every connected mailbox and runs the full
   ingestion cascade, so an open trigger burns Gmail quota and — since the
   cascade now reaches Bandsintown — real credits. Both routes now return 503
   when the secret is absent. Same fail-open class as the budget-guard bug in
   §5.12; worth grepping for the pattern before adding any new gated endpoint.

### Verified clean

- **RLS on every table** in `public` (18/18). The two with no policies
  (`search_cache`, `provider_spend`) are service-role-only by design.
- **Token columns**: `authenticated` has SELECT on 7 of `email_accounts`'
  columns and **not** on `access_token`, `refresh_token`, `token_expires`,
  `history_id`. The README claim holds.
- **Token encryption**: AES-256-GCM, fresh 12-byte IV per encryption, auth tag
  verified on decrypt, key length checked at 32 bytes. Correct.
- **Notes** are `user_id = auth.uid()` for ALL commands — private at every
  visibility setting, as documented.
- **Attendances** expose friends' rows only via `visibility = 'friends' AND
  are_friends(...)`.
- **Forward-inbox webhook** uses HMAC-SHA256 with `timingSafeEqual`.
- **No secrets tracked in git** — only `.env.example`; `.gitignore` covers
  `.env` and `.env.*`.
- **Service-role client** throws when unconfigured and is never imported into a
  client component.

### Open, low priority

- [ ] `provider_spend` and `search_cache` grant `authenticated` SELECT despite
      having no policy. RLS yields zero rows so it is inert, but the grant is
      pointless — revoke for tidiness. Left as-is for now to stay consistent
      with `search_cache`, which predates this.
- [x] ~~Add `import 'server-only'`~~ — **done** for `lib/supabase/admin.ts` and
      `lib/crypto.ts`. `next build` passes, which confirms no client component
      reaches either. Vitest needs the package's own `empty.js` alias (see
      `vitest.config.mts`) since it is neither a client nor a server component;
      that weakens nothing, as the enforcement is at build time.
- [ ] Pre-existing advisor warnings, unchanged: `pg_trgm` in the public schema,
      `are_friends` executable as SECURITY DEFINER by `authenticated`, leaked-
      password protection disabled. See §6.

---

## 5.15 Ticket counts, deep backfill, and the Upcoming pill — 2026-08-29

### How many tickets — `attendances.ticket_quantity` (`0017`)

Parsed from the receipt where one exists, tried strongest-signal first:

1. a labelled count — "Quantity: 4", "Qty 2", "Number of tickets: 3";
2. counted in prose — "3 tickets", "2 x General Admission", and the AXS transfer
   line "Alex transferred 3 tickets to you";
3. a flattened receipt table.

The third needed the most care. `htmlToText` treats `<td>` as a block tag, so a
receipt table does not arrive as rows of columns — every cell lands on its own
line, and in the AXS layout the header cells end up four lines from their
values. Anchoring on nearby words does not work. What the layouts share is a
line holding **nothing but a small integer with a money cell within two lines**,
which is what the extractor keys on. Capped at 20: a bigger number in that
position is a row count or a seat number.

A bare `Tickets: 2` is deliberately not a signal. "Tickets" is far too common a
word in these emails ("your tickets 2 days before the show").

Shown on the event page as total, count and per-ticket price, editable by hand —
a guest-list add has no price and a transfer has no order table, so parsing will
never cover everything.

One related bug fixed while here: `buildExtractor` spread the vendor-specific
result over the shared heuristics, so a vendor pass returning `undefined` for a
field it looked for and did not find **deleted** the value the heuristics had
already produced. Only defined values win now.

### Going / Interested on the Upcoming list

The card shows the viewer's own attendance state as its first pill. The
distinction is "tickets bought" versus "want to go", which was previously only
visible by opening each show. The "From Gmail" source badge lost its accent
colour so the state pill is the one that reads.

### Scanning years back — configurable lookback

The scan window is now a select: 30 days, 1, 2, 5 or 10 years.

It had to become **resumable** to work at all. A decade of ticket mail is
thousands of messages, each costing a Gmail fetch, an extraction and — when it
parses — a walk down the provider cascade. That is nowhere near 60 seconds, and
`maxDuration` is 60. So `listMessagePage` returns one page plus a cursor, the
route handles one page per request, and the client loops with a running count
and a Stop button. A timeout costs a page, not the scan. The incremental
`history_id` only advances on the **last** page — moving it early would mark
everything as seen while older pages were still unprocessed, and the nightly
cron would never revisit them.

**Set expectations before running one.** Every provider in the cascade lists
shows that are *on sale*. A confirmation from 2021 parses fine and matches
nothing, so it lands in the review queue for a manual add rather than appearing
in the Archive on its own. The UI says so above the button.

Genuine archive backfill wants `bandsintown.getArtistPastEvents`, which is
already wrapped and is the only source here that answers "what did they play
near me in 2024". Not wired into ingestion yet — it costs a credit per artist
off a ~200-credit balance, so it needs a budget story first.

---

## 5.17 Prod outage: a layout-level query gated the deploy — 2026-08-29

`7a5ff5c` shipped with `0017`–`0019` unapplied. Every authenticated page returned
`Application error: a server-side exception has occurred` (digest 2979175705).

The fatal one was `0018`. `getPendingCount` had been widened to count pending
event invites alongside ticket candidates, so the Inbox badge would not disagree
with the page — and that function is called from `(app)/layout.tsx`, the layout
wrapping *every* authenticated route. A missing `event_invites` table therefore
took down the whole app rather than the Inbox. `0017` would independently have
broken `/upcoming`, `/archive` and the event page through `ticket_quantity` in
`ATTENDANCE_SELECT`.

Resolved by applying all three to prod and verifying against the exact query
shapes that were throwing.

**The generalisable lesson:** a new table behind a layout-level query turns an
additive migration into an all-or-nothing deploy gate. Either apply migrations
before pushing, or make `getPendingCount` fall back to the candidate count when
the invites query errors, so schema lag degrades a badge instead of blanking the
app. The second is worth doing and is not yet done.

---

## 5.18 Why past-dated tickets all land in the Inbox — 2026-08-29

Reported from a real inbox: 11 unmatched candidates after a backfill, nearly all
for shows that had already happened.

**The diagnosis was right — and it hid two real bugs underneath it.**

### 1. Nothing lists a show that is over (working as designed, badly explained)

Ticketmaster, JamBase, Spotify and Bandsintown's upcoming endpoint all answer
"what is ON SALE". A past-dated ticket returns zero candidates everywhere, so
`match.best` is null and the message goes to review. Not a code bug — a real gap,
and the reason a 10-year scan mostly produces manual work.

Now partly fixed: `bandsintownCandidates` falls back to `get_artist_past_events`
when the ticket is past-dated *and* the upcoming list did not cover it. Verified
live — KETTAMA at The Regency Ballroom, 2026-05-06, one of the unmatched
candidates, is in that response.

The Inbox copy was also lying twice: it named only three providers (missing
Eventbrite and Bandsintown), and it told users "no listing service has this
show" about gigs they had already attended. It now distinguishes the past case.

### 2. **Bandsintown had never worked at all** — the real find

Every call threw. `providers/bandsintown.ts` was written against the Parse **MCP**
envelope (`{ ok, result: { data } }`) and wired to the **REST** endpoint, which
returns `{ status: "success", data }` with no `result` wrapper. So `!body.result`
was always true → `"unknown error"`.

`matchTicket` catches a provider failure and continues, so **there was no error
anywhere.** Bandsintown simply never contributed a candidate — indistinguishable
from "that artist had no dates". The provider added specifically because it is
the most accurate source for club shows was inert from the day it landed.

Nothing caught it because `call()` was the only function in the module without a
test; every pure helper around it was covered. `unwrap()` now accepts both
envelopes and is pinned by tests.

**This is the one to generalise from: a provider that fails silently into a
cascade needs a test on its transport, not just its parsers.** The same shape of
bug would be invisible in JamBase or Spotify today.

### 3. Boilerplate subjects stored as artist names

`artistName: "Your tickets were delivered to your account!"` — verbatim, from a
real AXS delivery notice. `BOILERPLATE_SUBJECT` is anchored at both ends, so it
rejected only subjects that were *exactly* boilerplate; anything that began with
boilerplate and continued sailed through.

Three costs, all real: the matcher searched every provider for an artist by that
sentence (spending metered quota to find nothing), the candidate could never
match, and "Add it anyway" would have created a junk artist row that then
degrades name matching for every ticket after it.

Fixed with a `SENTENCE_SUBJECT` guard on verb-led constructions plus a word-count
ceiling. The delivery notice now yields nothing at all and is filed "not a
ticket" — which is correct: the order confirmation for the same show carries the
artist and venue, so the notice is a duplicate with no unique information.

### Still open

- **Duplicate candidates.** One show can produce several review entries from
  different emails (order confirmation + delivery notice + reminder). Dedupe
  pending candidates on (user, name, date within 12h) before insert.
- **setlist.fm as a second past-show source.** Already integrated for setlists;
  it is also a database of shows that definitely happened, and it is free. Worth
  trying before spending a Bandsintown credit.

---

## 5.19 The cron has never run — two YAML bugs — 2026-08-29

`gh workflow run` returned `HTTP 422: Workflow does not have 'workflow_dispatch'
trigger`, which was the thread that unravelled it.

**The workflow file has never been valid, so nothing has ever run.** Not the
30-minute Gmail scan, not the hourly reminders. Every message in the production
database arrived from a manual "Scan" press.

The tell was in the API: GitHub reported the workflow's `name` as
`.github/workflows/stub-cron.yml` — its *path* — while `reddit-bot.yml` next to
it reported `Run Reddit Bot`. GitHub falls back to the path when it cannot parse
the file. `gh run view` confirmed: *"This run likely failed because of a workflow
file issue."* Every run in the history was a 0-second failure triggered by
`push`, and `--event=schedule` returned nothing at all, ever.

### Bug 1 — a column-0 heredoc closed the block scalar

```yaml
run: |
  python3 -c "
import json,sys        # <- column 0, outside the block scalar
try:
```

A block scalar's content must stay indented past its key. At `import json,sys`
the scalar ends, YAML tries to read a mapping entry, and dies on `try:` with
*"can not read a block mapping entry; a multiline key may not be an implicit
key"*. Replaced with a one-line `jq` filter, which does the same redaction with
no indentation hazard.

### Bug 2 — a folded scalar that wasn't folding

```yaml
if: >-
  github.event_name == 'workflow_dispatch' &&
    (inputs.job == 'both' || inputs.job == 'gmail-sync')   # <- extra indent
```

In a folded scalar a **more-indented** line is kept literal rather than folded,
so this injected a real newline into the middle of the expression. Latent behind
bug 1 and would have surfaced the moment it was fixed. All continuation lines are
now at the same indentation, with a comment at the top of the file saying why.

### Also missing

`STUB_BASE_URL` was never set as a repository secret — only `CRON_SECRET` was —
so even a parseable workflow would have failed its own config check at 0s. Set
separately.

### The lesson

**A workflow file is code with no type checker and no test.** Both bugs are
invisible to review and neither produced an error anywhere a person would look:
the symptom was silence. `npx js-yaml .github/workflows/*.yml` catches both in a
second and is worth a pre-commit hook.

Second-order: this is the *third* silent failure in this codebase in one day —
Bandsintown's envelope (§5.18), the Spotify batch endpoint, and now this. The
pattern is the same each time: something that fails into a `catch`, a fallback,
or a scheduler nobody reads. **Prefer loud failure at the boundary.**

---

## 5.20 A capped match still has to rank — 2026-08-29

Reported from the live Inbox: a Kaskade ticket for "Shed A" on Apr 17 offered
**Coachella, Indio, Apr 19** as its best match, with Kaskade at Pier 48 on the
exact date ranked below it.

`CONTRADICTION_CAP` flattens *every* venue-contradicting candidate to exactly
0.55, so both tied — and `sort` left them in whatever order the provider
returned. Bandsintown returned Coachella first, so Coachella won. The ranking was
arbitrary, not wrong-headed.

Fixed by keeping `rawConfidence` (the pre-cap score) on `ScoredMatch` and using
it as the tiebreak. Pier 48 scores 0.87 raw against Coachella's 0.75, so it now
ranks first while both stay capped at 0.55 and neither can auto-add. The
ambiguity check compares raw scores too — otherwise every pair of capped
candidates reads as ambiguous by construction.

### Three outcomes in the Inbox, not two

The same report asked for it, and it is the right call. With only "Not a ticket"
and "Yes, add it", accepting a confidently wrong suggestion was the only way to
record a show you actually attended — trading a missing entry for a **wrong**
one, which is worse: a bad row propagates into the Archive, the friend feed and
the artist catalog.

The card now offers *Yes, that's the show* / *Use email details* / *Not a
ticket*. "Use email details" (`createEventFromCandidate`, which already existed
for the no-match case) is the only path that cannot be wrong about which show it
is — it invents nothing, every field came off the confirmation.

---

## 5.20.1 Two smaller fixes from the same report — 2026-08-30

**"Open on Ticketmaster" opened Bandsintown.** The event page hard-coded the
label, but `events.url` is written by whichever provider won the match — five of
them do, and only one is Ticketmaster. `ticketVendorName()` now derives the
label from the URL host, falling back to the bare hostname rather than guessing,
so an unrecognised vendor still gets an honest button.

**Eventbrite was not overwriting a localized name on reconcile.** It took the
zone and the id but left `name` alone, so a row Browse had already created from
Spotify kept "Silva Bumpa y Dean Turnley" even though the first-party name was
in hand. That contradicted the ordering principle §5.16 had just established.
Eventbrite now takes the name outright on reconcile, for the same reason it
takes the zone: the incumbent's value is not merely absent, it is worse.

`url` and `image_url` are still left to the incumbent — there a richer provider
genuinely may have had something better first.

### Is the Spanish title rebuild still needed? — **yes, but barely**

Worth writing down because it is a reasonable thing to want to delete. Since
`displayEventName` started preferring the headliner, the localized *event* name
reaches almost nothing: cards, the ICS feed, the calendar subscription and the
push reminders all render `headliner?.name`. It now surfaces in exactly two
places — the event page subtitle, and the matcher's `similarity(name, c.name)`.

Still load-bearing for a Spotify-only show (Overmono at Public Works involves no
Eventbrite at all), so it stays. But its blast radius is a fraction of what it
was when it was written, and if the Spotify concerts provider is ever dropped,
`titleFor` goes with it.

---

## 5.21 Songkick scraping — evaluated and declined — 2026-08-30

Proposed: fork [Integuru-AI/Songkick-Unofficial-API](https://github.com/Integuru-AI/Songkick-Unofficial-API)
as a provider to save metered credits. **Not doing it**, for four reasons in
descending order of how hard they are to argue with.

1. **The repo has no licence.** 1 star, 0 forks, no `LICENSE` file — which under
   default copyright means all rights reserved. There is no legal basis to fork
   it. This alone settles it.
2. **Songkick clearly does not want it.** `robots.txt` enumerates and blocks
   scrapers and AI agents by name — `import.io`, `CCBot`, `ClaudeBot`,
   `PerplexityBot`, `Google-Extended`, `AhrefsBot` and a dozen more. There is no
   blanket `Disallow: /`, but the intent is not ambiguous.
3. **It duplicates a provider we already have working.** Songkick and
   Bandsintown cover substantially the same ground, and Bandsintown started
   actually functioning once the envelope bug was fixed (§5.18). Songkick's real
   differentiator is *venue following*, which is a feature to build on our own
   data, not a data source to acquire.
4. **It would add a fourth silent-failure surface.** Three provider bugs in one
   day were all invisible because they failed quietly into a cascade. A scraper
   is the most fragile possible version of that — it breaks on a CSS change,
   with no version, no changelog and no error.

**Where the credits actually go, and what already relieves it.** The scarce
providers are Bandsintown (200/month) and Spotify via RapidAPI (1,000/month),
and both are spent on the same thing: placing a club show. Three cheaper sources
now absorb most of that before either is reached — Eventbrite (free, 2,000/hour,
first-party, §5.16), setlist.fm (free, past shows, §5.22) and the shared local
catalog, which is the first cache and costs nothing. Adding a scraper would save
credits that are increasingly not being spent.

---

## 5.22 setlist.fm as a matcher, and the JamBase succession plan — 2026-08-30

Wired `search/setlists?artistName=&date=` into the cascade for **past-dated
tickets only**. Measured against a real unmatched inbox: 4 of 6 found (Kaskade
at Pier 48, Chris Lake at Pier 48, KETTAMA at The Regency, Chris Lorenzo at
Moscone), the two misses being small club nights.

It sits ahead of Bandsintown's past-events endpoint because it is free and
better targeted — one query for an exact artist+date, versus a credit to resolve
a slug plus another to pull fifty dates. It is a no-op on any future-dated
ticket.

**This is also the answer to JamBase lapsing.** JamBase is a 14-day trial, not a
free tier. When it goes, the gap is specifically Browse's *location* search:
setlist.fm covers the past, Eventbrite covers anything bought through it, and
Ticketmaster covers what it sells. Nothing free currently answers "what is on
near me" except Ticketmaster, which is blind to the club circuit — that is the
hole to plan for, and it is not one a Songkick scraper would fill legally.

---

## 5.23 Notifications, now that VAPID keys exist — 2026-08-30

Two new pushes, both deliberately hard to trigger.

**New-show announcements** (`api/cron/announce`, §3.3) — daily.

**Scan results** (`lib/notifyScan.ts`, fired from the Gmail cron) — only when a
run **added** a show or queued one **to review**, never on a quiet pass. The
scan runs every 30 minutes and finds nothing almost every time; a "found
nothing" push twice an hour is how someone turns notifications off for good.
The copy leads with the review count when there is one, because an added show
needs no action and a review item is a question.

Both are best-effort: a push failure never fails the work that produced it, and
a 404/410 prunes the dead subscription.

**`VAPID_SUBJECT` must be a real `mailto:`.** Apple rejects a placeholder, so an
unset value means iOS pushes fail while every other platform succeeds — which
presents as a device bug rather than a config one.

---

## 5.24 Positioning: a memory app, not a discovery app — 2026-08-30

Decided this session, and it re-ranks most of the backlog.

Search and purchase are well served by Bandsintown, DICE and the ticket vendors
themselves. What nobody does is the *stub in your pocket after the show*. So
Browse leaves the tab bar and **`/add` takes its slot**.

- `/browse` still exists and still works — no links break, and it is reachable
  from `/add`. It is simply not one of the five things the app puts in front of
  you.
- Manual entry moved out of Browse to its own route. It had been a sub-feature
  of discovery, which is backwards: the shows worth recording are often exactly
  the ones no listing service ever had — a club night, a warehouse party,
  something from 2017.

**What this changes about provider spend.** The budget now goes on *enriching
what you already have* rather than on searching for what you might want. Free,
cacheable enrichment is the priority; metered search is not. That makes the
JamBase lapse (§5.22) much less threatening — its value was location search,
which is the thing we just deprioritised.

### Artist photos — the most visible gap in a memory app

A card with no picture is the failure you notice, and the event providers are
unreliable about artwork for exactly the acts this app is for: Ticketmaster and
JamBase have it only for what they sell, the Spotify concerts proxy only in its
`details` view, Bandsintown not at all.

`providers/artistImages` fills it by NAME, from free sources only:

| Source | Cost | Notes |
|---|---|---|
| **Deezer** | **no API key at all** | 50 req/5s. Measured 5/5 exact hits |
| **Spotify search** | free | Needs app credentials; `limit` caps at 10 in dev mode |

Backfilled by pass 4 of `api/cron/repair`, bounded at 60 artists per run and
resumable — the filter is simply "still has no image", so the next run continues.
`artists.image_url` is the permanent cache; nothing re-queries a resolved artist.

**The matching bar, and the case that set it.** Every candidate goes through
`namesMatch` before being accepted, because a search endpoint with no relevance
floor always returns *something* and a stranger's face on someone's memory is
worse than initials.

But strict equality was wrong. **Chris Stussy renamed himself to CHRIS STASSY** —
so Deezer holds the old spelling, Spotify the new one, and our own row whatever
the ticket email said, which is usually the oldest of the three. All are correct;
equality would reject whichever source happened to be current. `namesMatch`
therefore allows one character of difference on names of 8+ characters — enough
for a rename, not enough to merge "Kiss" and "Kish".

---

## 6. Known issues / technical debt

- **No regression test for the Browse fetch race.** Needs jsdom +
  `@testing-library/react`. The bug (stale response overwriting newer results)
  is fixed via `AbortController` but nothing guards it.
- ~~**`getUpcoming` does N+1 queries**~~ — fixed. `getFriendsAtEvents` takes a
  list of event ids, does one `.in()`, and groups in JS; `/upcoming` uses it for
  its avatar stacks. `npm run test:live` asserts the batched result matches the
  per-event query row for row, because this is the same shape of PostgREST
  rewrite that silently broke Archive's ordering.
- **Event lists are sorted in JS, not SQL.** PostgREST's
  `.order(col, { referencedTable })` sorts rows *within* an embedded resource,
  not the top-level rows — so ordering a list of attendances by event date that
  way is a silent no-op. This shipped as a real bug (Archive came back
  unsorted) and was caught by `npm run test:live`. If these lists ever grow past
  a few hundred rows, move to a database view or an RPC so the sort happens in
  Postgres with `LIMIT` pushed down.
- **Gmail ingestion has never run end to end.** Extractors are unit-tested
  against fixtures only. No real confirmation email has been through the pipeline.
- ~~**JamBase events could never be added from Browse**~~ — **fixed in `0013`,
  and it was silent.** `0010` and `0012` enforced provider ids with *partial*
  unique indexes (`... where jambase_id is not null`). PostgREST's
  `onConflict: 'jambase_id'` emits a bare `ON CONFLICT (jambase_id)`, and
  Postgres only uses a partial index for that if the statement repeats the index
  predicate — which PostgREST never emits. So every JamBase catalog upsert
  failed with *"there is no unique or exclusion constraint matching the ON
  CONFLICT specification"*, was caught and logged, and Browse just said "Could
  not save that event".

  A plain `UNIQUE` constraint was the right tool all along: Postgres treats
  NULLs as distinct, so a nullable column can be UNIQUE and still have any number
  of id-less rows. That is exactly what `0001` does for `tm_id`, `mbid` and
  `setlistfm_id` — which is why *those* upserts always worked. `0013` swaps both
  providers' partial indexes for real constraints.

  Caught only by exercising the write path against a real database. Nothing in
  the offline suite touches PostgREST, so no unit test could have found it.
- ~~**The service worker was being redirected to /login**~~ — fixed. The
  middleware matcher excluded `_next/static`, `icons` and `manifest.webmanifest`
  but not `sw.js`. The browser fetches a service worker **without credentials**,
  so the session cookie is absent and the auth gate answered `307 → /login`. A
  service worker script that responds with a redirect fails registration
  outright, which silently kills the PWA: no install, no offline shell, and any
  already-installed app stuck on a stale worker. Confirmed in production logs
  (`GET /sw.js 307`) before the fix, and verified `200` on `stub-two.vercel.app`
  after it.
- **`pg_trgm` installed in `public`** — linter warning. Moving it risks the
  `gin_trgm_ops` indexes. Accepted.
- **Leaked-password protection is off** — one dashboard toggle
  (Authentication → Policies). Low priority while sign-in is Google-only.
- **`are_friends` is still `authenticated`-executable** — required by the RLS
  policy. Hardened in `0007` so it only answers about the caller's own pairs.
- **Calendar token is a bearer credential in a URL.** Rotatable from Settings.
  Inherent to how calendar subscriptions work.
- **Dev catalog has orphan rows from testing.** A live end-to-end run of the
  Spotify upsert left ~13 artist rows created by name (Ben UFO plus a WILDLANDS
  festival lineup) and a `jb-probe-1` row in the **dev** project. Harmless, but
  they will show up in artist lookups. Clear with
  `delete from artists where created_at > '2026-08-29' and tm_id is null`.
- **Security audit not yet run.** `npm run security-review` / the `/security-review`
  command exists but has never been run against this codebase. Worth doing before
  sharing the URL, particularly over: the calendar-token bearer URL, the ingest
  HMAC webhook, service-role usage in server actions, and the `NEXT_PUBLIC_*`
  boundary.
- ~~**"Connect Gmail" shown even when connected**~~ — fixed. `/upcoming`'s empty
  state prompted unconditionally; Settings and Inbox already checked.
- **Ticket price data is uniquely valuable and unused** — `price_cents` comes
  free from confirmation emails. Nobody else has it. See §3.5.

---

## 7. Verification

```bash
npm test              # 91 offline: extractors, matcher, providers
npm run test:live     # 9 live: real queries + RLS against seeded data
npx tsc --noEmit
npm run build
node scripts/verify-rls.mjs   # throwaway users, deeper privacy check
```

Supabase advisors should show the three known warnings (§6), plus two INFO
`rls_enabled_no_policy` notices for `search_cache` and `provider_spend` — both
are service-role-only tables by design. Anything else is new.
