# Stub — remaining work

Living backlog. Current state: working app on a seeded Supabase project, running
locally. Everything below is what stands between that and a thing your friends
actually use.

Ordered by what blocks what. **§1 is the only section that blocks sharing it.**

---

## 1. Before anyone else touches it

### 1.1 The test accounts are a live backdoor — **do this first**

`supabase/seed.sql` creates five real accounts with the password `stubdemo123`,
and that file is in the repo. Right now project `syrsjdreydgblrwpalyw` contains
them. Anyone who reads the repo can sign in as `demo@stub.local`.

Two options:

- **Separate prod project** (recommended). Free tier allows 2. Apply
  `migrations/*` but **never** `seed.sql`. Keeps the verified dev setup intact.
- **Reuse this project**: delete all five users, and set
  `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` to unset in production. You lose the
  fixture data that `npm run test:live` asserts against.

```sql
-- if reusing: nukes the seed accounts and everything cascading off them
delete from auth.users where email like '%@stub.local';
```

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
- `SETLISTFM_API_KEY` — archive import is built and idle without it.

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

**1. Ratings + a short review per show** — *Banded's core loop.* **S**
Add `rating smallint check (rating between 1 and 5)` to `attendances`, plus a
public `review text` distinct from the existing private `notes`. The Archive
becomes worth revisiting instead of a dead list.

**2. Show the setlist on past events** — **S**
`src/lib/providers/setlistfm.ts` already exists. Add `getSetlistForEvent(artist,
date)` and render the songs on `/event/[id]` when the date has passed. Highest
delight-per-line-of-code in this list.

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

### 5.4 setlist.fm — built, needs a key
Archive backfill works. Also the source for §3.2.

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
