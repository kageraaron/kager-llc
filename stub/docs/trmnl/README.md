# TRMNL display plugin

Puts your next shows on a [TRMNL](https://trmnl.com) e-ink panel.

## How it works

Stub exposes a token-scoped JSON feed; TRMNL polls it and renders it with the
Liquid templates in this directory.

```
TRMNL ──GET──▶ https://<your-stub>/api/trmnl/<token> ──▶ { count, shown, shows[] }
```

This is the **Polling** strategy rather than **Webhook**, for the same reason
the calendar feed is a subscription rather than a push: TRMNL already has a
refresh schedule, so letting it pull means no cron job, no per-user plugin UUID
to store, and no 12-requests-per-hour ceiling to account for. It also makes the
whole of setup "paste one URL".

**No TRMNL API key is needed** — the token in the URL is the only credential.
A user-level TRMNL key (`user_…`) authenticates TRMNL's *management* API
(Devices, Playlists, Plugin Settings); nothing here calls it.

## Setup

> **Private Plugin, not a public one.** TRMNL's *Third Party* plugin form asks
> for an Installation URL, install/uninstall webhooks, a Management URL and a
> Markup URL. That is the marketplace flow — an OAuth2 app that any TRMNL user
> can install, where Stub would generate the markup server-side per user. None
> of it applies here; a Private Plugin is yours alone and needs one URL.


1. In Stub, go to **Settings → TRMNL display → Show my TRMNL link** and copy the URL.
2. On TRMNL, open [**Private Plugin**](https://trmnl.com/integrations/private-plugin) →
   **Enable this plugin**, and set:
   - **Strategy**: `Polling`
   - **Polling URL**: the URL from step 1
   - **Polling Verb**: `GET`
3. Open **Edit Markup** and paste each file in this directory into the matching
   view: `full.liquid`, `half_horizontal.liquid`, `half_vertical.liquid`,
   `quadrant.liquid`.
4. Add the plugin to a playlist.

Rotating the link in Settings invalidates the old one — the plugin will render
TRMNL's error state until you paste the new URL into it.

## What the feed sends

```json
{
  "count": 6,
  "shown": 6,
  "generated_at": "2026-09-01T12:00:00.000Z",
  "shows": [
    {
      "name": "Overmono",
      "date": "Thu, Sep 3",
      "time": "8:00 PM",
      "venue": "The Midway",
      "city": "San Francisco, CA",
      "when": "in 2 days",
      "soon": true,
      "maybe": false
    }
  ]
}
```

- `count` is every upcoming show; `shown` is how many fit. The templates show
  `shown of count` in the title bar when they differ.
- `soon` means within a week — the templates give those extra weight.
- `maybe` means `interested` rather than `going`, marked with `*` so the panel
  never implies a ticket that was never bought.
- Dates and times are **pre-formatted in the venue's timezone**. Liquid cannot
  convert zones, so sending raw ISO instants would put a 10pm San Francisco
  show on the wall as 5:00 AM. Do not "simplify" this by sending `starts_at`.

## Constraints worth knowing before editing

- **2KB.** TRMNL rejects an oversized polled payload *whole*, so the panel goes
  blank rather than showing fewer rows. `src/lib/trmnl.ts` treats the limit as a
  budget and drops the furthest-out shows to stay under it. Eight rows of
  worst-case length come to ~1.7KB, so the row cap usually binds first — but if
  you add a field or widen a clip length, check `test/trmnl.test.ts` still passes.
- **Private only.** The feed carries no notes, prices or ticket references. A
  wall display is read by whoever walks past it.
