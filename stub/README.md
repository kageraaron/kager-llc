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
| Artist & event search (Ticketmaster) | Built |
| Upcoming / Archive tabs, manual add | Built |
| Private notes (owner-only, enforced in RLS) | Built |
| Friends-going on events | Built |
| Gmail scanning + review Inbox | Built |
| Forward-to-inbox address | Built, **switched off** — needs a domain |
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
- **Spotify**: create an app, add `<site>/api/connect/spotify/callback` as a
  redirect URI. Remember the 5-user ceiling.
- **Forward address**: see `workers/email-router/README.md`. Needs a domain on
  Cloudflare; until then leave `FEATURE_FORWARD_INBOX=false`.
- **Push reminders**: `npx web-push generate-vapid-keys`, then set
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`. On iOS these only
  reach users who added Stub to their home screen (16.4+).

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
