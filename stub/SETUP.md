# Stub — cloud Supabase setup

Gets you from nothing to a running app with the seeded test accounts. About
10 minutes, no Docker, no installs. Free tier throughout.

You only need steps 1–5 to click through the app. Steps 6–8 are for testing the
Gmail ingestion, and can wait.

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard> and sign in with GitHub.
2. **New project**.
   - **Name**: `stub`
   - **Database password**: generate one and save it — you will not be shown it
     again. (You do not need it for this app; only for direct `psql` access.)
   - **Region**: whichever is closest to you.
3. Wait ~2 minutes for provisioning.

> **Free-tier gotcha:** projects pause after **7 days of inactivity** and you
> restore them manually from the dashboard. Fine for this; just don't be
> surprised when it's asleep after a week away.

---

## 2. Run the migrations

Left sidebar → **SQL Editor** → **New query**.

Fastest path: paste **`supabase/bootstrap.sql`** — all seven migrations plus the
seed, concatenated in order — and run it once.

To go file by file instead, run these in order (`0002` adds policies to tables
`0001` creates, and so on):

| Order | File |
|---|---|
| 1 | `supabase/migrations/0001_init.sql` |
| 2 | `supabase/migrations/0002_rls.sql` |
| 3 | `supabase/migrations/0003_storage_and_inbound.sql` |
| 4 | `supabase/migrations/0004_push.sql` |
| 5 | `supabase/migrations/0005_venue_setlistfm_id.sql` |
| 6 | `supabase/migrations/0006_fix_inbound_search_path.sql` |
| 7 | `supabase/migrations/0007_lock_down_functions.sql` |

> **Why 0006 exists:** `assign_inbound_address()` originally pinned its
> `search_path` to `public`, but Supabase installs pgcrypto into `extensions` —
> so `gen_random_bytes()` was unresolvable. That trigger fires on every profile
> insert, so it broke **every signup**, not just seeding. `0003` is fixed at
> source; `0006` repairs databases that already ran the broken version.

---

## 3. Seed the test accounts

New query → paste `supabase/seed.sql` → **Run**.

This creates five accounts, all with password `stubdemo123`:

| Email | Handle | Role |
|---|---|---|
| `demo@stub.local` | `@you` | **sign in as this one** |
| `marisol@stub.local` | `@marisol` | friend |
| `dev@stub.local` | `@dev_okafor` | friend |
| `quinn@stub.local` | `@quinn` | friend |
| `sasha@stub.local` | `@sasha_lin` | **not** a friend; pending request to you |

Verify it worked:

```sql
select handle, display_name from profiles order by handle;
-- expect 5 rows: dev_okafor, marisol, quinn, sasha_lin, you
```

The seed is idempotent — safe to re-run if you edit it.

---

## 4. Get your API keys

Left sidebar → **Project Settings** → **API Keys**.

> **Naming changed.** Projects created after November 2025 no longer have
> `anon` / `service_role` keys. You want the new ones:
>
> | Dashboard label | Prefix | Goes in |
> |---|---|---|
> | **Publishable** | `sb_publishable_…` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
> | **Secret** | `sb_secret_…` | `SUPABASE_SERVICE_ROLE_KEY` |
>
> The env var *names* in this repo keep the old wording; only the key values
> changed. If your project is older and shows `anon` / `service_role`, those
> work too.

Also copy the **Project URL** from **Project Settings → API** — it looks like
`https://abcdefgh.supabase.co`.

**The secret key bypasses RLS entirely.** It belongs only in `.env.local` and in
Vercel's server-side env vars. Never commit it, never expose it to the browser.

---

## 5. Wire up the app

```bash
cd stub
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Lets you sign in as the seeded accounts. Local only — leave this out in prod,
# where sign-in should stay Google-only.
NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true

# openssl rand -base64 32
TOKEN_ENCRYPTION_KEY=...
```

Then:

```bash
npm install
npm run dev
```

Open <http://localhost:3000/login> and sign in as
**`demo@stub.local` / `stubdemo123`**.

### What you should see

- **Upcoming** — 4 shows. Japanese Breakfast and Turnstile badged *From Gmail*.
  Japanese Breakfast shows a **2**-avatar stack (Marisol + Dev), **not 3** —
  Sasha is going to it but is not your friend.
- **Archive** — 3 shows, grouped by year. The Tokyo Mitski show is pinned to a
  real date, so opening it renders an actual 28-song setlist from setlist.fm.
- **Inbox** — badge `2`; one *62% match*, one *No match found*.
- **Friends** — 3 friends, 1 pending request from Sasha, plus *what your friends
  are going to*: Wednesday and Sunset Rollercoaster.
- **Event detail** (Japanese Breakfast) — your note about the taqueria, and
  nothing else.
- **`/profile/quinn`** — her Slowdive show, but **not** her private Big Thief one.

Any **"IF YOU CAN READ THIS, RLS IS BROKEN."** text means a policy failed. A
3-avatar stack on Japanese Breakfast means `are_friends()` is wrong.

**Browse won't work yet** — it needs a Ticketmaster key (step 6).

---

## 6. Ticketmaster key (for Browse and manual add)

<https://developer.ticketmaster.com> → register → copy the **Consumer Key**.
Free and instant; 5000 calls/day, 5 requests/second.

```bash
TICKETMASTER_API_KEY=...
```

Restart `npm run dev`. Browse can now search artists and add real shows.

---

## 7. Google sign-in (optional locally)

Only needed if you want to test real Google sign-in rather than the seeded
accounts.

1. Supabase → **Authentication → Providers → Google** → enable, and copy the
   **Callback URL** it shows you
   (`https://YOUR-REF.supabase.co/auth/v1/callback`).
2. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services
   → Credentials → Create Credentials → OAuth client ID → Web application**.
   - **Authorized JavaScript origins**: `http://localhost:3000`
   - **Authorized redirect URIs**: the Supabase callback URL from step 1
3. Paste the resulting **Client ID** and **Client Secret** back into Supabase's
   Google provider, and save.
4. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000`
   - **Redirect URLs**: add `http://localhost:3000/**`

---

## 8. Gmail scanning (the actual feature)

This is a **second, separate** OAuth grant from sign-in — signing in asks only
for identity; this asks for `gmail.readonly`.

1. Google Cloud Console → **APIs & Services → Library** → enable the **Gmail API**.
2. Create a **second** OAuth client ID (Web application):
   - **Authorized redirect URI**:
     `http://localhost:3000/api/connect/gmail/callback`
3. **OAuth consent screen** → keep publishing status at **Testing**, and add
   every Google account you'll connect under **Test users**.
4. Add to `.env.local`:
   ```bash
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   CRON_SECRET=$(openssl rand -hex 32)
   ```
5. In the app: **Settings → Connections → Connect Gmail**.

> **Why Testing mode:** `gmail.readonly` is a *restricted* scope. In Production
> it requires Google verification plus an annual CASA Tier 2 security
> assessment. Testing mode allows restricted scopes for up to **100 explicitly
> listed test users** with no assessment — a hard cap, but plenty here.

### Triggering a scan manually

Vercel Cron doesn't run locally, so fire it yourself:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/gmail-sync
```

It returns a per-account summary: `{ scanned, added, review, skipped, errors }`.
The first run backfills 30 days; later runs sync incrementally.

Anything it matched confidently lands in **Upcoming**; anything ambiguous lands
in **Inbox**.

---

## 9. TRMNL display (optional)

Nothing to configure here — no API key, no cron. The plugin polls
`/api/trmnl/<token>`, and the per-user token in that URL is the whole of the
auth, exactly like the calendar feed.

Apply migration `0023_trmnl_token.sql`, then follow
[`docs/trmnl/README.md`](docs/trmnl/README.md): copy the link from
**Settings → TRMNL display**, create a TRMNL Private Plugin with the `Polling`
strategy, and paste in the four Liquid templates from `docs/trmnl/`.

To check the feed without a device:

```bash
curl -s "$NEXT_PUBLIC_SITE_URL/api/trmnl/<token>" | jq
```

A bad or unknown token returns `404` with no body, so a typo is indistinguishable
from a revoked link — which is the point.

## Verifying the privacy model

Two levels. The fast one runs the app's real query functions against the seeded
data and asserts the exact expected shape:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_... \
npm run test:live
```

Nine checks, including that Japanese Breakfast returns exactly two friends (not
three — Sasha is going but isn't a friend), that no tripwire note is readable,
that another user's `private` attendance is invisible, and that `access_token`
isn't selectable by the client.

The deeper one builds its own users from scratch:

```bash
export NEXT_PUBLIC_SUPABASE_URL=https://YOUR-REF.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
export SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

node scripts/verify-rls.mjs
```

**Only run either against a project with no real data.**

### Database linter

`get_advisors` (or Dashboard → Advisors) should show three known, accepted warnings:

- **`are_friends` executable by `authenticated`** — required; the RLS policy calls
  it. `0007` hardens it to refuse answering about pairs the caller isn't part of,
  so it can't be used to probe the friendship graph.
- **`pg_trgm` in `public`** — cosmetic; moving it risks the `gin_trgm_ops` indexes.
- **Leaked password protection disabled** — a dashboard toggle
  (Authentication → Policies). Worth enabling, though production sign-in is
  Google-only.

Anything beyond those three is new and worth reading.

---

---

## Going to production

The project you set up above is your **dev** project: it contains five test
accounts whose password (`stubdemo123`) is committed to this public repo. Never
deploy against it.

### 1. Create a second Supabase project

Same steps as §1. Name it `stub-prod`. The free tier allows two projects.

> **Why not Supabase branching?** Branching is Pro-only, bills per branch-hour,
> and works the other way round: your main project *is* production and branches
> are ephemeral previews merged *into* it. See `TODO.md` §4.1.

If you use the MCP servers, keep them named `supabase-dev` and `supabase-prod`
rather than a bare `supabase`, so it is never ambiguous which database a query
is about to hit.

### 2. Apply the schema — **`schema.sql`, not `bootstrap.sql`**

SQL Editor → New query → paste **`supabase/schema.sql`** → Run.

That file is migrations only: every table, policy, function and trigger, and
**no user accounts**. `bootstrap.sql` is the dev bundle and includes the seed —
running it in production would recreate the backdoor.

Verify:

```sql
select count(*) from auth.users;   -- expect 0
select count(*) from profiles;     -- expect 0
```

Both files are generated; regenerate with `npm run build:bootstrap`.

### 3. Point Vercel at the prod project

In Vercel → Settings → Environment Variables, scoped to **Production**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the **prod** project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | prod secret key |
| `NEXT_PUBLIC_SITE_URL` | your deployed URL |
| `TOKEN_ENCRYPTION_KEY` | a **new** `openssl rand -base64 32` |
| `CRON_SECRET` | a new `openssl rand -hex 32` |
| `TICKETMASTER_API_KEY` | same key is fine |
| `SETLISTFM_API_KEY` | same key is fine |

**Do not set `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` in Production.** Without it the
login page offers only Google and magic link, and the seeded-password path
cannot exist.

Use a **different** `TOKEN_ENCRYPTION_KEY` from dev: it encrypts Gmail refresh
tokens, and the two databases should not be able to decrypt each other's.

### 4. Set the Vercel Root Directory

Settings → Build & Deployment → **Root Directory: `stub`**. This is a monorepo;
without it Vercel builds the repo root and fails.

### 5. GitHub Actions secrets

Settings → Secrets and variables → Actions:

- `STUB_BASE_URL` — deployed URL, no trailing slash
- `CRON_SECRET` — must match the Vercel Production value

### 6. Google OAuth for production

Two clients, per `TODO.md` §1.2. The sign-in client (basic scopes only) can be
published to Production with no verification and **no user cap**; only the Gmail
client stays in Testing at 100 users.

Add to the **prod** Supabase project: Authentication → Providers → Google, and
Authentication → URL Configuration → Site URL + `https://your-app/**`.

### What not to run against production

- `supabase/seed.sql` and `supabase/bootstrap.sql` — both create test accounts.
- `npm run test:live` — asserts against seeded fixtures; it will fail, and it
  signs in with the test password.
- `scripts/verify-rls.mjs` — creates and deletes users.

---

## Troubleshooting

**Redirected to `/login` in a loop** — `NEXT_PUBLIC_SUPABASE_URL` or the
publishable key is wrong. The middleware fails closed on an unreachable auth
endpoint.

**"Invalid login credentials"** — either the seed didn't run (check
`select count(*) from auth.users;`) or `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` isn't
`true`. That flag is read at build time, so restart the dev server after adding it.

**Upcoming is empty but the seed ran** — confirm you're signed in as
`demo@stub.local` and not one of the friend accounts.

**"TICKETMASTER_API_KEY is not set"** on Browse — expected until step 6.

**Everything 500s after a week away** — the free project auto-paused. Restore it
from the dashboard.
