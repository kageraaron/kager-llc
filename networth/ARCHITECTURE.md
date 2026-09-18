# Household Net Worth App — Plan

A private, two-person Monarch Money replacement. Two users, one household. No payments,
no public signup, no multi-tenancy.

**Goal:** on a phone, in under three seconds, see what we're worth and what got spent
this week.

**Status:** planning.
**Last updated:** 2026-09-18

---

## TL;DR

**Self-host [`we-promise/sure`](https://github.com/we-promise/sure) + [SimpleFIN Bridge](https://beta-bridge.simplefin.org/), on a home machine, behind Tailscale.**

**Cost: $15/year.** Setup: an evening.

Do *not* build this from scratch, and do *not* use Plaid. Reasoning in §2 and §3.

---

## 1. Scope

**In scope**
- Net worth at a glance: one number, one trend line, accounts grouped by type.
- Recent transactions: filterable across all accounts.
- Daily sync from BofA, Fidelity, Schwab, + credit cards.
- Manual accounts (car, anything that won't link) counted in net worth.
- CSV import as the fallback when a link breaks.

**Out of scope** — this is what keeps the project small:
budgeting, envelopes, goals, cash-flow forecasting, bill tracking, alerts, mobile apps,
and any form of money movement.

---

## 2. Two corrections to the first draft of this plan

### 2.1 Not Plaid. SimpleFIN.

Plaid was the wrong recommendation for a self-hosted setup:

- **Plaid is not officially supported for self-hosted Maybe/Sure** — upstream cites OAuth
  redirect complexity and Plaid's pricing structure for personal subscriptions.
- Plaid requires applying for **Production access** — a review step with a turnaround that
  gates the whole project.
- Plaid bills per Item per month, per product. ~$2–6/month for our ~6 institutions.

SimpleFIN instead:

| | SimpleFIN | Plaid |
|---|---|---|
| Cost | **$15/year flat** (or $1.50/mo) | ~$2–6/month, per-Item, per-product |
| Institutions | 25 included | billed per Item |
| Approval gate | None. Sign up and go. | Production application + review |
| Access model | **Read-only by protocol design** | Broad product surface incl. payment initiation |
| Sure support | **Native, active** | Not officially supported self-hosted |
| History | 90 days | 24 months |
| Refresh | ~daily | daily + webhooks |
| Backing | MX (12,000+ institutions) | direct + OAuth |

The 90-day history limit is the only real regression, and it's mostly irrelevant: net
worth *trend* is accumulated going forward regardless (§5.3), and "recent transactions"
is 90 days by definition. Plaid's 24-month backfill would be nice-to-have, not load-bearing.

**The read-only-by-design property is worth more than the backfill.** SimpleFIN cannot
initiate a payment. That ceiling is the single biggest limiter on worst-case damage.

### 2.2 Not `maybe-finance/maybe`. `we-promise/sure`.

The original Maybe repo was **archived in July 2025** when the company shut down.
`we-promise/sure` is the community-maintained fork: ~10k stars, ~3,500 commits.
Note the backlog — ~347 open issues, ~200 open PRs — which is a real signal about patch
velocity and feeds directly into §6.

> **Verify before committing an evening:** check the fork's recent commit dates and
> release cadence yourself. "Community-maintained" spans a wide range and my read of it
> is a snapshot.

---

## 3. Why self-host an existing app instead of building it

I originally leaned toward building this on Next.js + Supabase + Vercel, since that's the
stack already in this repo. SimpleFIN changes the math:

- The build was ~2–3 focused days **plus** the Plaid Production approval wait. Sure +
  SimpleFIN is an evening with no approval gate.
- Cost is *lower* self-hosted ($15/yr vs. ~$24–72/yr of Plaid fees) because SimpleFIN's
  flat rate beats per-Item billing.
- The app you'd write is a worse version of Sure for the first six months.
- The thing that actually makes this project succeed or fail is **whether the three
  institutions link and return good data** — and that is identical either way.

**Build it yourself only if** Sure's data model can't represent something you need, or
you want this as a portfolio piece. Neither is the stated goal. The custom-build design
is preserved in §8 if that changes.

---

## 4. Cost

### 4.1 Recommended: home machine

| Item | Cost |
|---|---|
| SimpleFIN Bridge | **$15/year** |
| Hardware — existing Mac mini / old laptop / NAS | **$0** |
| Electricity (~6–10W idle, ~$0.16/kWh) | ~$8–14/year |
| Tailscale (personal tier) | **$0** |
| Backups → Backblaze B2 (<1GB) | ~$0 |
| Domain / TLS | **$0** — not needed behind Tailscale |
| **Total** | **~$15–29/year** |

If there's no spare machine: a Raspberry Pi 5 (8GB) is ~$80 one-time. Sure is Rails +
Postgres + Redis; 4GB is comfortable, 8GB is generous.

### 4.2 Alternative: cloud VPS

| Provider | Cost | Notes |
|---|---|---|
| Hetzner CX22 (2 vCPU / 4GB) | ~€3.79/mo (~$50/yr) | Best value. Comfortable for Rails + Postgres + Redis. |
| DigitalOcean 2GB droplet | $12/mo | Tight but workable. |
| Fly.io / Railway | ~$5–15/mo + usage | Managed-ish; Postgres billed separately. |
| Render free tier | — | **Won't work.** Spins down, no free persistent Postgres. |

A VPS adds ~$50–150/year **and** puts the app on the public internet, which is the
security posture we most want to avoid (§6.2). **Home + Tailscale is both the cheapest
and the most secure option.** That's an unusually clean win — take it.

---

## 5. Institution risk and the Phase 0 spike

- **BofA** — links reliably. Low risk.
- **Schwab** — generally works; position-level detail less consistent than balances.
- **Fidelity** — **the real risk.** Fidelity has been tightening third-party aggregator
  access and these links break periodically across every aggregator, Monarch included.
  Encouraging: SimpleFIN holdings output for Fidelity brokerage accounts does include
  shares, symbol, cost basis, and market value.

### 5.1 Phase 0 is the whole decision

**Spend $15 and thirty minutes before anything else.** Sign up for SimpleFIN, link BofA +
Fidelity + Schwab, and look at the raw JSON. This is the single highest-value action in
the plan — it costs less than a lunch and answers the only question that can kill the
project. Under the Plaid design this same check required a production application.

Only after that JSON looks right should you spin up Sure.

### 5.2 Degrade gracefully

Whatever the outcome, every account needs a manual/`is_manual` mode and a visible
`last_synced_at`. A dead link should degrade one account to *stale* with a badge — it must
never silently blank out net worth or, worse, quietly report a wrong number.

### 5.3 Start accumulating history on day one

No aggregator gives you historical balances. The net worth trend line is built by
snapshotting balances daily going forward. **The chart starts flat and only becomes
useful with time — so get the sync running early, even before the setup is polished.**
Every day of delay is a day missing from the chart, permanently.

---

## 6. Security

Honest framing first: **self-hosting doesn't reduce risk, it relocates it.** Monarch has a
security team, an audit, and monitoring. We have a Mac mini and good intentions. What we
gain is control of the blast radius and no third-party breach surface. What we take on is
patching, backups, and the fact that we would not notice a quiet compromise.

That trade is defensible here, but it rests almost entirely on §6.2.

### 6.1 What's actually at risk

The SimpleFIN access token is a bearer credential to the household's full financial
picture. Anyone holding it reads everything until it's revoked.

But note the ceiling: **SimpleFIN is read-only by protocol design.** It cannot move money
and it does not expose account or routing numbers. A worst-case breach here is a serious
privacy incident, not a financial-loss incident. That's a fundamentally better risk
profile than a Plaid integration with broader product scope, and it's the main reason the
self-hosted path is defensible at all.

- Store the token in `.env`, `chmod 600`, owned by the service user.
- Verify whether Sure encrypts the token at rest (Rails supports ActiveRecord encryption —
  confirm the fork actually uses it for credentials). If it doesn't, that is an argument
  for never exposing the instance publicly.
- Know how to revoke: SimpleFIN tokens are revocable from the Bridge dashboard. Do this
  first in any incident.

### 6.2 No public ingress. This is the control that matters most.

Do not port-forward. Do not put it on a VPS with a public hostname. Do not "just use
Cloudflare Tunnel with basic auth for now."

**Install Tailscale on the host and on both phones.** The app binds to localhost or the
tailnet interface only. Access it at `http://sure.your-tailnet.ts.net:3000`.

This single decision neutralizes most of the risk introduced by running a
community-maintained Rails app with a large open-issue backlog: unpatched web-layer
vulnerabilities are unreachable from the internet. If you skip everything else in this
section, do this.

If you ever *must* expose it: TLS via Caddy or a Cloudflare Tunnel, registration disabled,
fail2ban, and a hard commitment to same-week patching. Prefer not to.

### 6.3 Patching is now your job
- Enable `unattended-upgrades` (Linux) or automatic security updates (macOS).
- Pin the Sure image to a **digest**, not `:latest`, so updates are deliberate — then
  actually schedule a monthly update window. Pinning without updating is worse than not
  pinning.
- Watch the fork's releases for security fixes.

### 6.4 Backups — and a tested restore
Losing the database means losing the net worth history, which **cannot be rebuilt**
(§5.3). Transactions can be re-pulled for 90 days; balance history is gone forever.

- Nightly `pg_dump`, encrypted (`restic` or `age`), pushed offsite (Backblaze B2, ~free at
  this size).
- **Restore into a scratch container once, now, and confirm it works.** An untested backup
  is a guess.
- 30 daily / 12 monthly retention is plenty.

### 6.5 Host hygiene
- **Full-disk encryption** — FileVault or LUKS. A home machine is physically stealable and
  this disk holds every transaction you've made.
- Do not publish Postgres or Redis to `0.0.0.0`; keep them on the Docker-internal network.
- Run containers as non-root.
- Set a strong `SECRET_KEY_BASE` and a strong Postgres password. Never the defaults.
- Keep `.env` out of git. (This repo is a monorepo — add `networth/.env*` to `.gitignore`
  before the first commit, not after.)

### 6.6 App-level
- Create exactly two accounts, then **disable public registration** in Sure's settings.
- Strong unique passwords + MFA if the fork supports it.
- MFA on the accounts that sit upstream of this: SimpleFIN Bridge, Backblaze, Tailscale.
  The app's security is bounded by the weakest of those.

### 6.7 Don't leak it in logs
Rails logs request params by default. Confirm the SimpleFIN token and financial payloads
are filtered, and don't ship logs to a third-party error reporter without scrubbing.

### 6.8 Incident runbook — write it in week one
1. Revoke the SimpleFIN token from the Bridge dashboard.
2. Rotate `SECRET_KEY_BASE`, DB password, backup encryption key.
3. Rotate Tailscale keys; review tailnet device list for anything unfamiliar.
4. No routing numbers were ever stored and the connection is read-only, so bank-account
   changes are likely unnecessary — but review recent activity anyway.

---

## 7. Build phases

| Phase | Work | Gate |
|---|---|---|
| **0. Spike ($15, 30 min)** | SimpleFIN account. Link BofA, Fidelity, Schwab. Read the raw JSON. | **Do all three return balances and holdings?** If Fidelity fails, decide: manual-entry-first, or reconsider Monarch. Do not proceed until answered. |
| **1. Host** | Pick the machine. Tailscale on host + both phones. Full-disk encryption on. Docker installed. | Reachable from a phone over the tailnet, and *not* reachable from outside. |
| **2. Sure up** | Docker Compose: Sure + Postgres + Redis. Two accounts, registration disabled. | Loads over Tailscale. |
| **3. Connect** | SimpleFIN token into Sure. Link institutions. Let a sync run. | Net worth matches a hand-tallied figure. |
| **4. Durability** | Nightly encrypted `pg_dump` offsite. **Test the restore.** | Restore verified in a scratch container. |
| **5. Fill gaps** | Manual accounts for anything that won't link. CSV import where needed. | Every real account represented. |
| **6. Live with it** | Use it for a month. | Still opening it? → done. Not? → §8 or back to Monarch. |

Phases 0–4 are one evening plus a coffee the next morning. **Don't skip Phase 4.**

---

## 8. Appendix: the custom-build design

Kept in case Sure doesn't fit. Next.js + Supabase + Vercel, matching this repo's stack.
~2–3 focused days.

**Note:** if built, it should get a **brand-new, dedicated Supabase project** — not the
existing `supabase-dev` / `supabase-prod`, which back public products. A mistake in a
public app's RLS policy must not be able to reach household financial data.

```sql
households          id, name
household_members   household_id, user_id          -- the RLS anchor
sync_items          household_id, provider, encrypted_token,
                    cursor, status, last_synced_at  -- service-role only, no client policy
accounts            id, household_id, sync_item_id, name, institution,
                    mask,                            -- last 4 ONLY, never full numbers
                    type (depository|brokerage|credit|loan),
                    currency, is_manual, is_archived
balance_snapshots   account_id, as_of, balance      -- append-only; this IS the trend line
holdings            account_id, as_of, symbol, quantity, price, value
transactions        id, account_id, provider_txn_id UNIQUE,  -- idempotency key
                    posted_at, amount, merchant, description, category, pending
```

**Sign conventions — decide once, never revisit:** balances stored positive as reported,
with `credit`/`loan` negated at query time; `transactions.amount` negative for money
leaving. Normalize at the sync boundary, never in the UI.

**Net worth:**
```sql
select sum(case when a.type in ('credit','loan') then -b.balance else b.balance end)
from accounts a
join lateral (
  select balance from balance_snapshots
  where account_id = a.id order by as_of desc limit 1
) b on true
where a.household_id = $1 and not a.is_archived;
```

**Sync:** one daily cron → fetch, upsert transactions on `provider_txn_id`, write one
balance snapshot per account (`on conflict do update` — must be safely re-runnable).
Authorize the cron route with a `CRON_SECRET` header or it's an open internet endpoint.

**Security deltas vs. self-hosting:** app-layer encryption for tokens (not just disk
encryption); service role key server-side only, with a CI grep failing the build on
`NEXT_PUBLIC_.*SERVICE_ROLE`; RLS enabled on every table, default-deny, verified by
negative test with an anon key.

**UI:** `/` dashboard (net worth, delta, trend, accounts by type, staleness badges),
`/transactions` (filterable table), `/settings` (link, reauth, manual accounts, CSV).
Two screens plus settings. Resist adding more.

---

## 9. Open questions

1. **Do Fidelity and Schwab return holdings via SimpleFIN?** Phase 0. Blocks everything.
2. **Is `we-promise/sure` actively patched?** Check commit and release dates. Determines
   how hard §6.3 has to be — though §6.2 covers us either way.
3. **Which machine?** Existing hardware, or ~$80 for a Pi.
4. **Is 90 days of transaction history enough,** or is 24 months of backfill worth
   reconsidering Plaid + a custom build? (Suspect: no.)
5. **401k / HSA / anything unlinkable** — manual accounts updated quarterly. Good enough?
