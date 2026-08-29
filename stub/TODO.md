# Stub — remaining work

Living backlog. Current state: working app on a seeded Supabase project, running
locally. Everything below is what stands between that and a thing your friends
actually use.

Ordered by what blocks what. **§1 is the only section that blocks sharing it.**

---

## 1. Before anyone else touches it

### 1.1 ~~The test accounts are a live backdoor~~ — **RESOLVED**

**Done 2026-08-28.** Production project `biichwtrfmrdgiqtvxme` (`stub-prod`) is
provisioned with schema only:

- All 8 migrations applied and tracked.
- **0 users, 0 profiles, 0 attendances, 0 notes.**
- 15 tables / 25 policies / 15 RLS-enabled — byte-identical counts to dev.
- Advisors: only the 2 known-accepted warnings (§6).
- Signup verified end to end with a throwaway user: profile, calendar token and
  inbound address all auto-created, then deleted. Confirms the `0006`
  `search_path` fix — without it every signup raises 42883.

Dev project `syrsjdreydgblrwpalyw` keeps the seed so `npm run test:live` works.

Remaining: point Vercel's **Production** env at the prod project (§1.6).

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

Unblocks four things at once:

- **Forward-to-inbox** (`FEATURE_FORWARD_INBOX`) — needs DNS on Cloudflare for
  Email Routing. See `workers/email-router/README.md`.
- A stable OAuth redirect URI that doesn't change per deploy.
- A real PWA install identity (icon + name on the home screen).
- Somewhere to point `INBOUND_EMAIL_DOMAIN`.

### 1.5 Remaining keys

- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — `npx web-push generate-vapid-keys`.
  Push code is built; nothing sends without these.
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

### ⚠ Production database is two migrations behind

`supabase-prod` (`biichwtrfmrdgiqtvxme`) has **0001–0011**. Missing **0012** and
**0013**, both of which the current code needs:

- Without `0012`, `events.spotify_concert_id` does not exist, so a Spotify match
  cannot be persisted — `persistCandidate` returns null and ingestion errors on
  exactly the club shows the cascade was built to catch.
- Without `0013`, `jambase_id` is still enforced by a *partial* unique index, so
  **adding a JamBase event from Browse fails in production today** (see §6).

Both are additive and low risk. Applying them to prod needs a human — an attempt
to run SQL against the prod project was refused by the permission layer, and it
was not worked around.

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
hobby plan). No deployments yet.

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

**Free-tier gotcha:** Supabase projects pause after 7 days idle. If friends use
it sporadically, the first person back hits a dead app. Either upgrade ($25/mo)
or add a cron ping to keep it warm.

### Onboarding gap
There's no invite flow. A new user lands on an empty app with no friends and no
shows. Worth building: an invite link that pre-fills a friend request, so the
first thing they see isn't an empty state.

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

**3. "Artist you follow just announced a show"** — *Bandsintown's whole product.* **M**
You already have `user_artists` (favourites), `push_subscriptions`, and a cron
runner. Missing piece: a nightly job that queries Ticketmaster per followed
artist, diffs against `events`, and pushes on new rows. Reuse
`sent_reminders` for dedupe.

**4. Friend activity feed** — **M**
Friends' plans exist only as a list on `/friends`. A chronological "Marisol is
going to X", "Dev rated Y" feed is what makes a social app feel alive.

**5. Year in review** — **M**
Shows seen, venues, top artists, total spent (`price_cents` is already captured
from ticket emails — nobody else has this data). Very shareable.

**6. Venue following** — *Songkick's differentiator.* **M**
`user_venues` mirroring `user_artists`. Strong for people who follow a local room
rather than specific acts.

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
  (`GET /sw.js 307`) before the fix.
- **`pg_trgm` installed in `public`** — linter warning. Moving it risks the
  `gin_trgm_ops` indexes. Accepted.
- **Leaked-password protection is off** — one dashboard toggle
  (Authentication → Policies). Low priority while sign-in is Google-only.
- **`are_friends` is still `authenticated`-executable** — required by the RLS
  policy. Hardened in `0007` so it only answers about the caller's own pairs.
- **Calendar token is a bearer credential in a URL.** Rotatable from Settings.
  Inherent to how calendar subscriptions work.
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
npm test              # 18 offline: extractors + matcher
npm run test:live     # 9 live: real queries + RLS against seeded data
npx tsc --noEmit
npm run build
node scripts/verify-rls.mjs   # throwaway users, deeper privacy check
```

Supabase advisors should show exactly three known warnings (§6). Anything else
is new.
