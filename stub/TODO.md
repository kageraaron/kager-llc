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

### 1.2 Two Google OAuth clients, not one

This is what makes the friend-group case work, and it is not obvious.

| Client | Scopes | Publishing status | User limit |
|---|---|---|---|
| **Sign-in** | `openid`, `email`, `profile` | **Production** | **none** |
| **Gmail scan** | `gmail.readonly` | **Testing** | 100 test users |

Non-sensitive scopes can be published to Production **without verification and
with no user cap**. Only the restricted Gmail scope forces Testing mode. So:
friends sign in freely; only those who want inbox scanning need adding to the
test-user list.

Today both paths share one client. Split them.

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

**1. Ratings + a short review per show** — *Banded's core loop.* **S**
Add `rating smallint check (rating between 1 and 5)` to `attendances`, plus a
public `review text` distinct from the existing private `notes`. The Archive
becomes worth revisiting instead of a dead list.

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

**The problem:** Ticketmaster matches whole words only. `"Chris L"` returns
**zero** results; `"Chris Lake"` returns one. Every partial name looks broken.

**The fix: split typeahead from date lookup.**

- **MusicBrainz for the typeahead.** It's Lucene-backed and supports wildcards —
  `artist:chris\ l*` matches mid-word. Free, no user cap, no key. Rate limited to
  1 req/s, so debounce and cache. `src/lib/providers/musicbrainz.ts` already
  exists.
- **Ticketmaster for the dates**, once an artist is chosen.

Also worth doing:
- **Cache picked artists locally** and search `artists` first (the `pg_trgm` GIN
  index is already built for exactly this) before hitting any API.
- **Bandsintown for coverage.** Ticketmaster misses small/DIY/indie shows
  entirely. Bandsintown indexes far more of the club circuit. Needs partner
  approval — worth applying.

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

## 6. Known issues / technical debt

- **No regression test for the Browse fetch race.** Needs jsdom +
  `@testing-library/react`. The bug (stale response overwriting newer results)
  is fixed via `AbortController` but nothing guards it.
- **`getUpcoming` does N+1 queries** — one `getFriendsAtEvent` per event. Fine at
  a dozen shows; fix with a single grouped query before it isn't.
- **Event lists are sorted in JS, not SQL.** PostgREST's
  `.order(col, { referencedTable })` sorts rows *within* an embedded resource,
  not the top-level rows — so ordering a list of attendances by event date that
  way is a silent no-op. This shipped as a real bug (Archive came back
  unsorted) and was caught by `npm run test:live`. If these lists ever grow past
  a few hundred rows, move to a database view or an RPC so the sort happens in
  Postgres with `LIMIT` pushed down.
- **Gmail ingestion has never run end to end.** Extractors are unit-tested
  against fixtures only. No real confirmation email has been through the pipeline.
- **`pg_trgm` installed in `public`** — linter warning. Moving it risks the
  `gin_trgm_ops` indexes. Accepted.
- **Leaked-password protection is off** — one dashboard toggle
  (Authentication → Policies). Low priority while sign-in is Google-only.
- **`are_friends` is still `authenticated`-executable** — required by the RLS
  policy. Hardened in `0007` so it only answers about the caller's own pairs.
- **Calendar token is a bearer credential in a URL.** Rotatable from Settings.
  Inherent to how calendar subscriptions work.
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
