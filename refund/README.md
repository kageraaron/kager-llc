# Refund

Money back when prices drop after you buy. Refund reads order and booking
emails from Gmail, works out each purchase's price-drop window from the
merchant's own policy, checks today's price where there is a sanctioned way to,
and pushes an alert with claim steps while the window is still open.

It is one app in a small self-hosted suite with [Stub](../stub): both share one
Supabase (sign-in, households, the Gmail connection) and live on subdomains of
one domain, behind a private network.

## What it covers

| Merchant | Window | Price check |
| --- | --- | --- |
| Best Buy | 15 days (60 for Plus/Total) | Best Buy Products API, by SKU |
| Target | 14 days | none: a reminder to check |
| Costco | 30 days | none: a reminder to check |
| US airlines | until departure (Basic fares: 24 hours) | SerpApi Google Flights, same flights and fare type |
| Refundable hotels | until free cancellation ends | SerpApi Google Hotels |

The rules live in `src/lib/policies.ts`, each with its source.

## Running your own

You need, all yours:

1. **A Supabase project** (self-hosted or cloud) with Stub's migrations applied
   (households, `email_accounts`), then `supabase/migrations/*.sql` here.
   Add `refund` to PostgREST's exposed schemas (`PGRST_DB_SCHEMAS`).
2. **A Google Cloud OAuth client** (Web application), consent screen in
   *Testing* with your household's accounts as test users. Redirect URIs:
   your Supabase `…/auth/v1/callback` and Stub's `…/api/connect/gmail/callback`.
   Enable Google as a provider in Supabase Auth with the same client.
   Gmail is connected once, in Stub; Refund reads the same tokens, so
   `TOKEN_ENCRYPTION_KEY` must match Stub's.
3. **Keys**: SerpApi (250 free searches a month; Refund paces itself to fit,
   see `src/lib/budget.ts`) and a free Best Buy developer key. Both optional:
   without them those merchants get deadline reminders only.
4. **VAPID keys** for web push (`npx web-push generate-vapid-keys`) and a real
   `mailto:` subject. iOS delivers web push only to apps added to the home
   screen, and rejects placeholder subjects.

Copy `.env.example` to `.env` and fill it in. Nothing secret belongs in the
repo: `.env*` is git-ignored everywhere.

```sh
npm install
npm test          # policies, extraction, pacing
npm run dev       # http://localhost:3002
```

Production is the `Dockerfile` (`output: 'standalone'`); `NEXT_PUBLIC_*`
values are build args. Two jobs run on a schedule with the `CRON_SECRET`
bearer: `GET /api/cron/scan` (every 30 minutes) and `GET /api/cron/check`
(hourly).

## Privacy

Email bodies are never stored: Refund keeps the sender, subject and the
fields it extracted. Gmail tokens are encrypted at rest (AES-256-GCM) and the
scope is read-only. No retailer site is scraped, and no claim is filed for you:
Refund tells you what to claim and links to where.
