# Stub email router

Cloudflare Email Worker that turns a forwarded ticket confirmation into an
ingest webhook call. This is the no-OAuth ingestion path: it works with any mail
provider and needs no Google review.

## Why it is switched off right now

The app ships with `FEATURE_FORWARD_INBOX=false` because it needs a domain whose
DNS is hosted on Cloudflare — Email Routing manages the MX records, so the
domain has to be on Cloudflare, not merely owned.

## Turning it on

1. Register a domain and add it to Cloudflare (free plan is fine).
2. Cloudflare dashboard → **Email → Email Routing** → enable for the zone.
3. `npm install && npx wrangler deploy` from this directory.
4. `npx wrangler secret put INGEST_WEBHOOK_SECRET` — same value as the app's env var.
5. Set `STUB_INGEST_URL` in `wrangler.toml` to your deployed app URL.
6. Email Routing → **Routes** → add a catch-all rule that sends to this worker.
7. In the app, set `FEATURE_FORWARD_INBOX=true` and `INBOUND_EMAIL_DOMAIN=in.yourdomain.com`.

Each user then gets an address like `emily-a3f9@in.yourdomain.com`, generated
into `inbound_addresses`. Auto-forward ticket confirmations there from any inbox.
