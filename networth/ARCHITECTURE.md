# Household Net Worth — Build Plan

A private Monarch Money replacement for two people. Net worth at a glance, recent
transactions, nothing else.

**Current plan:** start on **PikaPods** (~$3–6/mo, no hardware) to try the app, with the
option to move to self-hosted later — see §10, and note the day-one step there that makes
migration possible at all.

**Longer-term option:** self-host [`we-promise/sure`](https://github.com/we-promise/sure) +
[SimpleFIN Bridge](https://beta-bridge.simplefin.org/) on a mini PC at home, behind
Tailscale. No public internet exposure.

**Cost:** ~$160 one-time (hardware) + ~$25/year (SimpleFIN + electricity).
**Effort:** one evening, after a $15 / 30-minute go-no-go test.

**Status:** planning. Nothing bought or built yet.
**Last updated:** 2026-09-18

---

## 1. Scope

**In**
- Net worth: one number, one trend line, accounts grouped by type.
- Recent transactions: filterable across all accounts.
- Daily sync from BofA, Fidelity, Schwab, + credit cards.
- Manual accounts (house, anything that won't link) counted in net worth.
- CSV import as the fallback when a link breaks.

**Out** — this is what keeps it small: budgeting, envelopes, goals, cash-flow forecasting,
bill tracking, alerts, native mobile apps, and any form of money movement.

**Success:** on a phone, in under three seconds, we can see what we're worth and what got
spent this week.

---

## 2. Phase 0: the $15 go/no-go test

**Do this before buying hardware.** It costs $15 and half an hour, and it answers the only
question that can kill the project.

1. Sign up for [SimpleFIN Bridge](https://beta-bridge.simplefin.org/) ($15/year).
2. Link BofA, Fidelity, and Schwab.
3. Look at the raw JSON it returns.

**What you're checking:** do all three return balances, and do the brokerages return
holdings?

**One SimpleFIN account, not two.** SimpleFIN links *institutions*, not people — it has no
concept of who owns what. Your BofA, his Fidelity, a joint Schwab and every card all sit
under the same $15/year. The catch is credentials, not billing: each link needs that
institution's login, and brokerages usually want an MFA code at link time, so he either
sits at the keyboard for his own accounts or hands over the login. Same arrangement you
already have with Monarch. On the Sure side the connection belongs to the Family, so one
token serves both of you.

- **BofA** — links reliably. Low risk.
- **Schwab** — generally works; position detail less consistent than balances.
- **Fidelity** — **the real risk.** Fidelity has been tightening third-party aggregator
  access, and these links break periodically across every aggregator, Monarch included.

**If Fidelity fails**, don't abandon the plan — shift to manual-entry-first, with Fidelity
updated by hand monthly and everything else synced. But decide that *now*, not after
spending $160 on a mini PC.

> **Start syncing as early as you can.** No aggregator backfills historical balances — the
> net worth trend line is accumulated going forward. Every day of delay is a day missing
> from the chart, permanently. SimpleFIN gives you 90 days of transactions and nothing
> older.

---

## 3. Shopping list

| Item | Cost | Notes |
|---|---|---|
| **N100/N150 mini PC**, 16 GB RAM, 500 GB SSD | ~$150–180 | Beelink S12 Pro / EQ14, Minisforum UN100, GMKtec G3. Includes case, PSU, storage. |
| SimpleFIN Bridge | $15/year | |
| Electricity (~7 W × 24/7) | ~$10/year | |
| UPS (optional) | ~$60 | Nice-to-have, not required — see §4.3. |
| Backup storage (Backblaze B2, <1 GB) | ~$0 | |

**Total: ~$160 one-time, ~$25/year.**

### Why an N100 mini PC

You said you don't have a spare machine, so this is a purchase decision. The N100 box wins
on a specific technical point, not just price:

**It has TPM 2.0, which means full-disk encryption that auto-unlocks at boot.** You get an
encrypted disk *and* unattended restart after a power cut. A Mac mini can't do both —
FileVault there requires someone to physically type a password after every reboot. That
single capability is why this is the right buy (§4.3).

It's also 16 GB for less than an 8 GB Mac mini, draws ~7 W, runs Docker natively with no
VM overhead, and is silent.

**Alternatives:**
- **Refurb Lenovo ThinkCentre Tiny / Dell OptiPlex Micro** (i5-8500T, 16 GB), ~$100–130 on
  eBay. Real TPM 2.0, extremely reliable, idles ~10 W. Best value if you don't mind used.
- **Raspberry Pi 5 8 GB**, ~$130 all-in once you add PSU, case, and an SSD. No TPM, more
  fiddly, and you must **boot from SSD — Postgres writes destroy SD cards.** No longer
  cheaper than an N100. Skip it.

**Verified:** `ghcr.io/we-promise/sure` publishes both `linux/amd64` and `linux/arm64`, so
either architecture runs natively.

**Requirements:** Sure uses ~352 MB steady-state, plus Postgres and Redis. 4 GB is
comfortable; 16 GB is generous headroom. ~20 GB disk.

---

## 4. Setup

### 4.1 OS

Install **Debian 13** (stable, boring, ideal for set-and-forget). Ubuntu Server LTS is
equally fine.

During install, enable **LUKS full-disk encryption**. Then:

```bash
# Auto-unlock the disk at boot using the TPM
sudo systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=7 /dev/nvme0n1p3

# Unattended security patches
sudo apt install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades

sudo apt install docker.io docker-compose-v2
```

Enable TPM (often listed as "Intel PTT") in the BIOS first if it isn't already.

**What TPM auto-unlock does and doesn't protect.** The TPM releases the key only to the
expected boot chain, so pulling the SSD or booting a live USB fails — both real theft
scenarios. What remains is someone stealing the whole box and booting it normally, where
they hit a login prompt. So: **make the account password strong**, since it's the last
barrier. This is a meaningfully better posture than any Mac option.

### 4.2 Sure

Generate secrets first:

```bash
openssl rand -hex 64    # SECRET_KEY_BASE
openssl rand -hex 32    # POSTGRES_PASSWORD
docker run --rm ghcr.io/we-promise/sure:stable bin/rails db:encryption:init
```

Start from the project's own compose file rather than hand-rolling one:

```bash
curl -fsSL -o compose.yml \
  https://raw.githubusercontent.com/we-promise/sure/main/compose.example.yml
```

Set these:

| Variable | Value |
|---|---|
| `SECRET_KEY_BASE` | from `openssl rand -hex 64` |
| `POSTGRES_PASSWORD` | generated, never a default |
| `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY` | from `db:encryption:init` |
| `ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY` | from `db:encryption:init` |
| `ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT` | from `db:encryption:init` |
| `SELF_HOSTED` | `true` |
| `RAILS_ASSUME_SSL` | `true` — required behind Tailscale Serve |
| `ONBOARDING_STATE` | `open` at first, then **`closed`** (§4.4) |
| `AUTH_PASSKEY_LOGIN_ENABLED` | `true` |
| `WEBAUTHN_RP_ID` | `<host>.<tailnet>.ts.net` |
| `WEBAUTHN_ALLOWED_ORIGINS` | `https://<host>.<tailnet>.ts.net` |

Two things to get right in the compose file:

- **Bind the app port to localhost: `"127.0.0.1:3000:3000"`.** Without the `127.0.0.1:`
  prefix Docker publishes to `0.0.0.0` and exposes Sure to your entire LAN — the likeliest
  mistake in this whole setup.
- **Never publish the Postgres or Redis ports at all.**
- Use `restart: unless-stopped` so everything returns after a reboot.
- Pin `:stable`, and after it works, pin the image digest.

> ⚠️ **Back up the three `ACTIVE_RECORD_*` keys and `SECRET_KEY_BASE` to your password
> manager now, before going further.** Lose them and the encrypted columns are
> unrecoverable *even with a perfect database backup*.

### 4.3 Power behaviour

In the BIOS, set **"Restore on AC power loss" → Power On**. With TPM auto-unlock, the box
then returns from a power cut entirely on its own. A UPS is a nice-to-have for clean
shutdowns, not a requirement.

### 4.4 Lock it down

```bash
docker compose up -d
tailscale serve --bg 3000
tailscale serve status
```

> ⚠️ **`tailscale serve`, never `tailscale funnel`.** Funnel publishes to the public
> internet and undoes the most important control in this plan.

Then, in order:

1. Open the HTTPS URL and **register your account first**. This creates the household
   (Sure calls it a `Family`) with you as its admin.
2. **Immediately set `ONBOARDING_STATE=invite_only`** and restart. See the warning below
   before doing anything else.
3. Invite your spouse (§5.1) — do *not* have them self-register.
4. **Enrol passkeys for both of you.** This is Sure's best security feature — use it.

> ⚠️ **Do not let your spouse register their own account.** Every self-registration
> creates a *separate, empty household*. Sure then refuses to merge the two if the second
> one has any data of its own (`would_orphan_owned_accounts?`), and you'd be rebuilding
> from scratch. **One person registers; the other is invited.** An earlier draft of this
> plan got this wrong.

`WEBAUTHN_RP_ID` is pinned to the hostname, so **pick the tailnet hostname once**;
changing it later breaks passkeys.

### 4.5 Connect

- **Settings → Providers → SimpleFIN.** Sure's own panel links straight to
  <https://beta-bridge.simplefin.org> and walks three steps: *"Go to SimpleFIN Bridge for
  a one-time setup token" → "Paste the token below and connect" → "Then head to Accounts
  to link your synced accounts."* The field is labelled **Setup Token**.
- Note it's a **one-time** token: SimpleFIN exchanges it for a permanent access URL on
  first use, so it can't be reused. Reconnecting later means generating a fresh one.
- Then Accounts → link BofA, Fidelity, Schwab, cards.
- Add the **house as a property account** and the **mortgage as a liability** (§6).
- Leave `OPENAI_ACCESS_TOKEN` unset. It's off by default; it costs RAM and sends financial
  data to a third party for a feature you didn't ask for.

---

## 5. Access: exactly the two of you

### 5.1 Sure is built for this — one household, two people

Verified in the codebase. Sure's data model has a **`Family`** (household) that owns
everything, and **every bank connection belongs to the Family, not to a user**
(`Family::SimplefinConnectable`). So once you're both in the same household, you both see
the same accounts, balances, and transactions automatically. This is a first-class
feature, not a workaround.

**Roles:** `admin`, `member`, `guest`. **Invite your spouse as `admin`** so you're
co-equal — members have limits around owning provider connections, which is friction you
don't need for a two-person household.

**The invite flow, and the self-hosted catch:**

1. Settings → Profile → invite, enter your spouse's email, role `admin`.
2. **On self-hosted, Sure deliberately does not send the invitation email** — the code
   skips the mailer entirely when self-hosted (`deliver_later unless self_hosted?`). **You
   must copy the invitation link out of the UI and send it to them yourself.** This is
   good news in one way: **you never need to configure SMTP.**
3. They open the link, create their account *through it*, and land directly in your
   household. Sure then runs `auto_share_existing_accounts_with` — every existing account
   is shared with them immediately. Nothing to re-link.

Invites are admin-only, single-use, and expire, so the link is safe to send over a normal
channel.

Leave `ONBOARDING_STATE=invite_only` permanently. It blocks random registration while
still letting you add someone later. (`closed` is the maximally locked setting once you're
both in, but `invite_only` is already safe, since only an admin can generate an invite.)

### 5.2 The four network layers

Four independent layers.

**1. Tailscale.** No port forwarding, no public DNS, nothing changed on your router. The
box is not on the internet.
- The free Personal plan covers **3 users, 100 devices**.
- Invite your spouse as a **separate user**, not a shared login — separately revocable,
  and you can see which device connected.
- Install on: the mini PC, both laptops, both phones.

**2. Tailnet ACLs.** The default policy lets every device reach every other device.
Tighten it:

```jsonc
{
  "acls": [
    { "action": "accept",
      "src": ["you@example.com", "spouse@example.com"],
      "dst": ["tag:finance:3000"] }
  ]
}
```

Tag the mini PC `tag:finance`. Enable **device approval**, and keep **key expiry on** so a
lost phone ages out of the tailnet by itself.

**3. HTTPS via Tailscale Serve.** Real Let's Encrypt cert at
`https://<host>.<tailnet>.ts.net`, reachable only from the tailnet. No self-signed cert
warnings, no domain to buy.

**4. Sure's own auth.** Two accounts, registration closed, passkeys. Even someone already
on your tailnet still needs a passkey.

### 5.3 What it feels like to use

- Open the URL on any device with Tailscale connected — home, coffee shop, another
  country. Add to home screen for an app icon.
- **Clients (correcting an earlier draft — there *are* native clients).** Sure ships a
  **Flutter mobile app for iOS and Android**, a **macOS desktop app** (Tauri 2 shell around
  the web app, asks for your server URL at launch), a Go CLI, and an MCP endpoint for
  Claude. See `docs/clients.md`.
- **But the mobile app does login + account balances only.** No transactions, no net worth
  chart. Sure's own docs say "for the full application surface, use the web app."
- **It isn't on the App Store.** You build it yourself: Flutter SDK + Xcode + CocoaPods,
  then edit `lib/services/api_config.dart` to hardcode your server URL and `flutter run`.
  On iOS a free Apple account means **re-signing every 7 days**; avoiding that needs the
  $99/year Apple Developer Program — more than everything else in this plan combined.
- **So: use the PWA.** Add the web app to your home screen and you get an app icon plus
  the *entire* application. The native app is currently a downgrade in functionality.
  Revisit it when it covers transactions.
- **The macOS desktop app is worth a look** — you're on a Mac, it's a native window around
  the full web app, same auth and MFA, no build toolchain beyond what they ship.
- **Revoking access** (lost phone): remove the device in the Tailscale console. Instant,
  and independent of the app logins.

---

## 6. The house

Sure has a **property account type**, and real estate counts toward net worth. The value
is whatever you type in — there's no automatic feed.

**There's no legitimate way to pull a Zestimate.** Zillow deprecated the public Zestimate
API on 2021-09-30; its replacement (Bridge Interactive) is enterprise-only and requires
real estate industry affiliation. The RapidAPI "Zillow scrapers" that fill the gap violate
Zillow's terms and break whenever the site changes.

Self-serve AVM APIs do exist (APIllow has a 50 req/mo free tier, plenty for one house) and
give *an* estimate, not *the* Zestimate.

**Recommendation: update it manually, quarterly.** Not just because it's simpler — because
automating it would make the dashboard worse. Your house is probably your largest asset,
and AVM error is large: Zillow's own published median error is ~2% on-market and ~7%
off-market. On a $700k house that's a ±$50k band on the number that dominates your net
worth. A daily valuation feed would swing the chart by tens of thousands for reasons
unrelated to anything you did, burying the signal you actually want.

Two minutes, four times a year, from Zillow or Redfin in a browser. Keep the mortgage as a
separate liability so equity shows as the two lines diverge.

**Worth deciding early:** do you want net worth *with* or *without* the house? They answer
different questions — "what could we liquidate" vs. "how are the investments doing." The
house will dominate either way.

---

## 7. Security

**Honest framing: self-hosting relocates risk, it doesn't remove it.** Monarch has a
security team, an audit, and monitoring. You'll have a mini PC. What you gain is control
of the blast radius and no third-party breach surface. What you take on is patching,
backups, and the fact that you would not notice a quiet compromise.

Two structural facts make that trade reasonable here:

1. **SimpleFIN is read-only by protocol** and exposes no account or routing numbers. A
   worst-case breach is a privacy incident, not a financial-loss one — and the token is
   revocable in seconds.
2. **Nothing is exposed to the internet** (§5). Sure is a community-maintained Rails app
   with a large open-issue backlog; unpatched web vulnerabilities only matter if they're
   reachable. This is the control that carries the most weight — if you skip everything
   else here, don't skip this.


### 7.0 Is SimpleFIN itself safe?

**Credentials never touch SimpleFIN.** They go to **MX** — a major, established US
aggregator in the same tier as Plaid/Finicity, used directly by many banks. SimpleFIN's
policy: *"No bank account credentials ever touch our servers."* The Bridge account itself
has **no passwords** (passkey or emailed code), offers TOTP 2FA, uses TLS server-to-server,
and notifies you when your data is accessed from a new IP.

**Disclosed incident — 28 May 2026.** A bug in MX let up to **39 users see each other's
transaction data, balances and account names** for ~4 hours. No credentials exposed; all
affected users notified. It was a bug rather than an attacker, and in MX rather than
SimpleFIN — but cross-tenant leakage is a serious class of bug, and it shows where the
risk concentrates. They disclosed publicly, which is the right behavior.

**Two marks against:** the security policy never names who operates SimpleFIN Bridge, and
the production URL still says "beta". Their own policy notes there's risk in giving bank
credentials to anyone, which is honest.

**The comparison that matters:** Monarch uses aggregators too (Plaid/MX/Finicity). This
isn't a new category of risk — it's a different company in front of MX. Monarch has a
security team and an audit; SimpleFIN holds *less* (no credentials, read-only, no account
or routing numbers), so its worst case is narrower.

**Do these four things:**
1. **Passkey on the Bridge account, not email codes** — otherwise your inbox is the single
   point of failure.
2. **TOTP 2FA on.**
3. **Prefer OAuth at link time** where offered (Schwab, BofA increasingly) — then even MX
   never sees the password.
4. Remember the token is **revocable in seconds**.

Further reading: [Sure discussion #157](https://github.com/we-promise/sure/discussions/157),
[SimpleFIN security policy](https://beta-bridge.simplefin.org/info/security).

### Checklist

- [ ] LUKS full-disk encryption with TPM auto-unlock (§4.1)
- [ ] Strong account password — it's the last barrier if the box is stolen
- [ ] `unattended-upgrades` enabled
- [ ] App port bound to `127.0.0.1`; Postgres/Redis ports not published at all
- [ ] Tailscale only — no port forwarding, `serve` not `funnel`
- [ ] Tailnet ACLs scoped to two users, device approval on, key expiry on
- [ ] `ONBOARDING_STATE=closed` after both accounts exist
- [ ] Passkeys enrolled for both of you
- [ ] `ACTIVE_RECORD_*` keys + `SECRET_KEY_BASE` in the password manager
- [ ] MFA on the upstream accounts: SimpleFIN, Tailscale, Backblaze, GitHub
- [ ] Monthly update window actually scheduled (pinning without updating is worse than
      not pinning)

### Why not managed hosting

PikaPods offers Sure as a one-click pod, and they're reputable — the BorgBase team. But
**Sure has no end-to-end encryption.** Its at-rest encryption keys live in environment
variables, which a managed host also holds, so that protects you from a leaked backup, not
from the operator.

In plain terms: E2E is *a locked box you hold the key to*; Sure's at-rest encryption is *a
safe with the key on a hook beside it*. Both are honestly "encrypted"; only one protects
you from whoever runs the server. If you run the box, the key on the hook is your hook and
the gap closes — which is why self-hosting Sure is sound. On someone else's box it doesn't.

Sure on PikaPods would mean a third party can read your complete financial picture — the
same trust model as just paying Monarch, minus Monarch's security team and mobile app.
(If you ever *do* want managed hosting, switch to Actual Budget, which has real E2E — see
Appendix A.)

### Incident runbook

1. Revoke the SimpleFIN token from the Bridge dashboard.
2. Rotate `SECRET_KEY_BASE`, Postgres password, backup encryption key.
3. Rotate Tailscale keys; review the tailnet device list for anything unfamiliar.
4. No routing numbers were ever stored and the connection is read-only, so bank-account
   changes are likely unnecessary — but review recent activity anyway.

---

## 8. Backups

**Losing the database means losing the net worth history, which cannot be rebuilt.**
Transactions can be re-pulled for 90 days; balance history is gone forever.

- Nightly `pg_dump`, encrypted (`restic` or `age`), pushed to Backblaze B2 (~free at this
  size). 30 daily / 12 monthly retention.
- **Back up the `ACTIVE_RECORD_*` keys separately from the database.** A perfect dump plus
  lost keys is still unrecoverable data.
- **Restore into a scratch container once, now, and confirm it works.** An untested backup
  is a guess.

---

## 9. Phases

| Phase | Work | Gate |
|---|---|---|
| **0. Spike** | $15 SimpleFIN account. Link BofA, Fidelity, Schwab. Read the raw JSON. (§2) | **Do all three return balances and holdings?** Answer before buying hardware. |
| **1. Buy** | N100 mini PC (§3). | Delivered. |
| **2. OS** | Debian + LUKS + TPM auto-unlock + unattended-upgrades + Docker. BIOS: restore on AC power loss. (§4.1, §4.3) | Survives an unplugging test, comes back on its own. |
| **3. Network** | Tailscale on the box and all four devices. MagicDNS + HTTPS certs. ACLs, device approval. (§5) | Both of you reach it; nothing outside can. |
| **4. App** | Secrets, compose, `tailscale serve --bg 3000`. (§4.2) | Loads over HTTPS on a phone, valid cert. |
| **5. Lock down** | **You** register → `ONBOARDING_STATE=invite_only` → **invite** spouse as admin, hand them the link → passkeys for both. Secrets to password manager. (§4.4, §5.1) | Both of you in **one** household seeing the same accounts; passkey login works for both. |
| **6. Connect** | SimpleFIN token, link institutions, let a sync run. (§4.5) | Net worth matches a hand-tallied figure. |
| **7. Backups** | Nightly encrypted dump offsite. **Test the restore.** (§8) | Restore verified. |
| **8. Fill gaps** | House + mortgage. Manual accounts for anything that won't link. (§6) | Every real account represented. |
| **9. Live with it** | Use it for a month. | Still opening it? → done. Not? → Appendix A, or back to Monarch. |

Phase 0 is half an hour. Phases 2–7 are one evening. Don't skip Phase 7.

---

## 10. Starting on PikaPods, and moving off later

### 10.1 Do this on day one or migration gets much harder

**Record the pod's `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY`, `..._DETERMINISTIC_KEY`,
`..._KEY_DERIVATION_SALT` and `SECRET_KEY_BASE` into your password manager as soon as the
pod is running.** PikaPods exposes environment variables in its control panel.

Those keys encrypt the SimpleFIN credential in the database. Migrate the database without
them and the encrypted columns won't decrypt on the new host. This is the one genuine
landmine, and it costs two minutes to defuse.

Also point PikaPods' **daily backup at your own S3 bucket** (Backblaze B2) at setup. Then
a portable copy exists continuously and the migration is already half done.

### 10.2 Route 1 — Postgres dump (full fidelity, recommended)

PikaPods gives SFTP access to the pod plus daily backups to your own storage. `pg_dump`,
then restore into your own Docker Postgres with the same env vars.

Everything comes across: accounts, transactions, **balance history**, settings, users.
Sure is a stock Rails + Postgres app — there's nothing proprietary in the way.

### 10.3 Route 2 — Sure's built-in export (portable)

**Settings → Exports** (admin only) queues a background job and produces a ZIP:

```
version.txt   accounts.csv   transactions.csv   trades.csv
categories.csv   merchants.csv   rules.csv   attachments.json   all.ndjson
```

Good for portability, inspection, or moving to a different app entirely. One caveat:
`accounts.csv` carries each account's **current** balance, not the daily history — so for
preserving the net worth chart, prefer Route 1. (`all.ndjson` is a fuller dump; verify it
covers valuations before relying on it alone.)

### 10.4 What breaks on the move — both minor

- **Passkeys.** `WEBAUTHN_RP_ID` is pinned to the hostname, so moving from
  `*.pikapod.net` to a tailnet hostname invalidates them. Re-enrol; two minutes.
- **Worst case on SimpleFIN:** if the encryption keys were lost, generate a fresh setup
  token from SimpleFIN Bridge and reconnect. Free. Your history stays — only the
  connection is re-established.

### 10.5 No lock-in, in either direction

AGPL app, stock Postgres, documented export. PikaPods markets this explicitly. The same
path works in reverse if you ever want to move *back* to managed hosting.

**So starting on PikaPods is low-risk.** The only irreversible mistake would be losing the
encryption keys and the balance history together — which §10.1 and §8 prevent.

---

## Appendix A: alternatives considered

**Actual Budget** — 29k stars vs. Sure's 10k, a much smaller backlog (254 open items vs.
547), and **real end-to-end encryption**. Rejected because it's envelope-budgeting first:
its Net Worth report is good, but a brokerage shows up as a single balance with no
per-holding detail, and Sure is the only actively maintained project shaped like Monarch.
**Revisit if** you want managed hosting (E2E makes that safe) or if Sure's project health
becomes a problem.

**`maybe-finance/maybe`** — the original, 54k stars, **archived July 2025**. `we-promise/sure`
is its community fork. Don't run the archived one.

**Syllogic** ([syllogic.ai](https://syllogic.ai/), `syllogic-ai/syllogic`) — a well-made
young project: Next.js 16 + FastAPI + Postgres, AGPL, Docker/Railway/CasaOS deploys, AI
categorization, recurring-spend tracking, brokerage and crypto holdings. **Rejected on one
disqualifying point: it has no automatic bank sync.** No Plaid, no SimpleFIN, no
GoCardless — CSV import only. That means manually exporting files from BofA, Fidelity,
Schwab and every credit card whenever you want current numbers, which is precisely the
chore Monarch exists to remove. Maturity is also a real gap: **14 stars and ~550 commits
against Sure's ~10,000 stars and ~3,500 commits**, two maintainers, and a last push ~3
weeks before this was written versus Sure's daily activity. Its most distinctive feature,
an MCP server for Claude, isn't a differentiator — Sure ships `docs/hosting/mcp.md` too.
**Revisit if** it adds a real aggregator and picks up maintainers; the stack is modern and
the security basics (field-level encryption, signed sessions) are present, though MFA
isn't documented.

**Firefly III** — mature and well maintained, but budgeting/double-entry focused with no
native US bank sync.

**Ghostfolio / Wealthfolio** — good at portfolios, no checking or credit transactions.
Half the picture.

**Plaid instead of SimpleFIN** — better coverage and 24 months of backfill vs. 90 days.
*Correction to an earlier draft: Sure does support Plaid self-hosted* — there's a
`docs/hosting/plaid.md` and a `Family::PlaidConnectable`. Still rejected, because Plaid
requires a Production access application with a review turnaround, costs ~$2–6/month in
per-Item fees, and has a far broader product surface including payment initiation.
SimpleFIN is $15/year flat, read-only by protocol, needs no approval — and Sure's
SimpleFIN support is deep, with dedicated processors for investment holdings, credit and
loan liabilities, and stale-account detection.

**Building it from scratch** (Next.js + Supabase + Vercel, matching the rest of this
repo) — ~2–3 focused days for a worse version of Sure. The thing that determines success
is whether the institutions link, which is identical either way. Only worth it if Sure's
data model can't represent something you need.

---

## Appendix B: open questions

1. **Do Fidelity and Schwab return holdings via SimpleFIN?** Phase 0. Blocks everything.
2. **Net worth with or without the house?** (§6) It'll dominate the number either way.
3. **Is 90 days of transaction history enough,** or is Plaid's 24-month backfill worth
   reconsidering? (Suspect: no.)
4. **401k / HSA / anything unlinkable** — manual accounts updated quarterly. Good enough?
5. **Is the PWA enough on the phone?** Sure's native iOS app exists but covers only login
   and balances, and needs a self-build. The PWA gives the full app. Revisit the native
   client when it does more.
