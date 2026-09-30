# Household Net Worth — Build Plan

A private Monarch Money replacement for two people. Net worth at a glance, recent
transactions, nothing else.

**Plan: self-hosted.** `we-promise/sure` + SimpleFIN Bridge on a Lenovo ThinkCentre M720q
at home, behind Tailscale. No public internet exposure. Opens at `https://money.example.org`
through the shared Caddy front door (§5.2).

**Shared box.** The M720q also hosts Stub and Fare (see the Fare plan doc) in a separate
Docker network with their own Postgres. Sure's database is never shared with them.

**Status: hardware ordered.** Currently running on PikaPods; migrating when the box
arrives. Migration runbook is §10 — **§10.1 has things to do while you wait.**

**Hardware ordered:** Lenovo ThinkCentre M720q Tiny, i3-8100T (4C, 35 W), 8 GB DDR4,
256 GB NVMe, Wi-Fi card + antennas, No OS. $150 from 2ndboot, 65 W adapter included,
TPM 2.0 confirmed in the listing's Security spec.

**Running cost once migrated:** ~$15/yr SimpleFIN + ~$14/yr electricity.

**Last updated:** 2026-09-23

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

## 3. The hardware

**Ordered:** Lenovo ThinkCentre M720q Tiny from 2ndboot, **$150**.

| Option | Chosen | Why |
|---|---|---|
| CPU | i3-8100T (4C/4T, 35 W) | 8th gen → **TPM 2.0 confirmed**. Sure needs almost no CPU. |
| SSD | 256 GB NVMe | You'll use ~25 GB. |
| Memory | 8 GB DDR4 (1×8) | ~1.5 GB for Sure; ~4–5 GB once Stub, Fare and Supabase join it. Second SODIMM slot free — add 8 GB when they do. |
| OS | **No OS** | LUKS can only be configured during installation; a pre-installed image can't have your passphrase. |
| Networking | Wi-Fi card + antennas (+$10) | Fallback, since the Ethernet situation is unknown. Antennas included — the fiddly part. |
| 2.5" bay | Empty | A spinning disk in a silent always-on box adds noise, watts and a failure point, and a same-machine backup protects against nothing that matters. |

Included: 65 W Lenovo adapter, QA checklist, 30-day money-back guarantee.

**Prefer Ethernet when it arrives.** The Wi-Fi card is insurance. These are 7×7×1.5 in and
silent — if the box can sit near the router on a short cable, do that. An always-on server
on Wi-Fi can drop while you're travelling, with nobody home to fix it.

## 4. Setup

### 4.1 OS

Install **Debian 13** (stable, boring, ideal for set-and-forget). Ubuntu Server LTS is
equally fine.

During install, enable **LUKS full-disk encryption**. Then:

```bash
# Auto-unlock the disk at boot using the TPM. Debian's default initramfs-tools can't
# unlock via TPM2, so switch to dracut first (done 2026-09-30 on the M720q):
sudo apt install dracut tpm2-tools
echo 'add_dracutmodules+=" crypt tpm2-tss systemd "' | sudo tee /etc/dracut.conf.d/10-tpm2.conf
sudo sed -i 's/x-initrd.attach/x-initrd.attach,tpm2-device=auto/' /etc/crypttab
sudo dracut --regenerate-all -f      # reboot once and confirm it still prompts, then:
sudo systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=7 /dev/nvme0n1p3
# Update the BIOS and apply fwupd Secure Boot db/dbx updates BEFORE enrolling:
# they change PCR 7. After any later one, type the passphrase once and re-enroll.

# Unattended security patches
sudo apt install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades

sudo apt install docker.io docker-compose   # Debian 13 package name; it is Compose v2
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
| `RAILS_ASSUME_SSL` | `true` — required behind Caddy, which terminates TLS |
| `ONBOARDING_STATE` | `open` at first, then **`closed`** (§4.4) |
| `AUTH_PASSKEY_LOGIN_ENABLED` | `true` |
| `WEBAUTHN_RP_ID` | `money.example.org` |
| `WEBAUTHN_ALLOWED_ORIGINS` | `https://money.example.org` |

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
curl -sI https://money.example.org    # from a laptop on the tailnet; Caddy routes it (§5.2)
```

> ⚠️ **Never `tailscale funnel`.** Funnel publishes to the public internet and undoes the
> most important control in this plan. Caddy answers only on the Tailscale interface.

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

`WEBAUTHN_RP_ID` is pinned to the hostname, so **pick the domain once** and use
`money.example.org` from day one; changing it later breaks passkeys.

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

**1. Tailscale.** No port forwarding, nothing changed on your router. The box is not on
the internet. The public DNS record `*.example.org` points at the box's Tailscale address
(`100.x.y.z`), which nobody outside the tailnet can reach.
- The free Personal plan covers **up to 6 users, unlimited devices**.
- **Turn off key expiry for the box only**, so it never drops off the tailnet.
- DNS settings: MagicDNS on, `1.1.1.1` as global nameserver, **Override local DNS** on, so
  names resolve the same on any Wi-Fi.
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
      "dst": ["tag:home:443"] }
  ]
}
```

Tag the mini PC `tag:home` (it now serves Stub and Fare too, all through Caddy on 443). Enable **device approval**, and keep **key expiry on** so a
lost phone ages out of the tailnet by itself.

**3. HTTPS via Caddy on your own domain.** One wildcard Let's Encrypt cert for
`*.example.org`, issued by DNS challenge through Cloudflare, so Let's Encrypt never needs to
reach the box. `ufw` allows inbound only on `tailscale0`, so Caddy isn't reachable even
from the home Wi-Fi. Sure is `money.example.org`; the launcher at `home.example.org` links every
app. Full setup (DNS record, API token, Caddyfile) is in the Fare plan doc's *Tailscale,
your own domain, and opening the apps* section.

**4. Sure's own auth.** Two accounts, registration closed, passkeys. Even someone already
on your tailnet still needs a passkey.

### 5.3 What it feels like to use

- Open `money.example.org` on any device with Tailscale connected — home, coffee shop,
  another country. Add to home screen for an app icon (Mac: Safari → File → Add to Dock).
  If it won't load, Tailscale is off.
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
- [ ] Tailscale only — no port forwarding, Caddy reachable on `tailscale0` only, never `funnel`
- [ ] Cloudflare DNS record is **DNS only (grey cloud)**; API token scoped to DNS edit on the one zone
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

## 9. Phases (original build — see §10 for the migration)

| Phase | Work | Gate |
|---|---|---|
| **0. Spike** | $15 SimpleFIN account. Link BofA, Fidelity, Schwab. Read the raw JSON. (§2) | **Do all three return balances and holdings?** Answer before buying hardware. |
| **1. Buy** | N100 mini PC (§3). | Delivered. |
| **2. OS** | Debian + LUKS + TPM auto-unlock + unattended-upgrades + Docker. BIOS: restore on AC power loss. (§4.1, §4.3) | Survives an unplugging test, comes back on its own. |
| **3. Network** | Tailscale on the box and all four devices. Domain + wildcard DNS record → Tailscale IP, Caddy, `ufw`. ACLs, device approval. (§5) | Both of you reach it; nothing outside can. |
| **4. App** | Secrets, compose, Caddy route `money.example.org` → `127.0.0.1:3000`. (§4.2) | Loads over HTTPS on a phone, valid cert. |
| **5. Lock down** | **You** register → `ONBOARDING_STATE=invite_only` → **invite** spouse as admin, hand them the link → passkeys for both. Secrets to password manager. (§4.4, §5.1) | Both of you in **one** household seeing the same accounts; passkey login works for both. |
| **6. Connect** | SimpleFIN token, link institutions, let a sync run. (§4.5) | Net worth matches a hand-tallied figure. |
| **7. Backups** | Nightly encrypted dump offsite. **Test the restore.** (§8) | Restore verified. |
| **8. Fill gaps** | House + mortgage. Manual accounts for anything that won't link. (§6) | Every real account represented. |
| **9. Live with it** | Use it for a month. | Still opening it? → done. Not? → Appendix A, or back to Monarch. |

Phase 0 is half an hour. Phases 2–7 are one evening. Don't skip Phase 7.

---

## 10. Migration runbook: PikaPods → M720q

### 10.1 While you wait — do these now

**1. Find out whether encryption is on at PikaPods.** Check the pod logs for
`[SECURITY] ActiveRecord Encryption is NOT configured`. This decides the migration path:

- **Warning present (encryption off).** The database holds plaintext. Migration is
  *simpler* — there are no keys to carry. Set keys properly on the new box and the data
  re-encrypts as it's written.
- **Warning absent (encryption on).** You **must** carry the three
  `ACTIVE_RECORD_ENCRYPTION_*` values to the new box, or the encrypted columns won't
  decrypt. Pull them from `.env` over SFTP and put them in the password manager now.

**2. Enable SFTP** on the pod (Pod Settings → SFTP) and confirm you can connect.

**3. Take a practice `pg_dump` now.** Do it once while nothing depends on it, so the real
one isn't your first attempt.

**4. Domain: done — `example.org` (Namecheap, 2026-09-23).** Sure is `money.example.org`.
`WEBAUTHN_RP_ID` is pinned to it and changing it later breaks both passkeys. Move its DNS
to Cloudflare's free plan (nameservers at Namecheap → Custom DNS) and create a DNS-edit API
token for that zone — Caddy's certificate challenge needs Cloudflare DNS.

**5. Prep the install media.** Debian 13 netinst ISO on an 8 GB+ USB stick.

**6. Install Tailscale** on both laptops and both phones, and invite your spouse to the
tailnet as a separate user. All of this works before the box exists.

### 10.2 Day one with the box (~2 hours)

**A. BIOS first.** Enable **Intel PTT** (TPM 2.0). Set **"After Power Loss → Power On."**
Update the BIOS while you're in there.

**B. Install Debian 13 with encrypted LVM (LUKS).** Choose a strong account password — with
TPM auto-unlock it becomes the last barrier if the box is stolen.

**C. Post-install:**
```bash
# BIOS update + fwupd Secure Boot updates first, then dracut, then enroll (see §4.1)
sudo systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=7 /dev/nvme0n1p3
sudo apt install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
sudo apt install docker.io docker-compose   # Debian 13 package name; it is Compose v2
```

**D. Test the power-cut behaviour before going further.** Pull the plug, plug it back in.
It must come back to a login prompt with nobody typing anything. If it doesn't, fix that
now — it's the property the whole unattended design rests on.

**E. Tailscale + front door:** join the tailnet, tag the box `tag:home`, turn off its key
expiry, scope the ACL to your two users on port 443. Add the `*` DNS record pointing at
`tailscale ip -4` (grey cloud), install Caddy with the Cloudflare plugin, `ufw allow in on
tailscale0`. See the Fare plan doc for the Caddyfile.

**F. Bring up Sure** with the §4 env vars — **including the three encryption keys from the
start this time**, plus `ACTIVE_RECORD_ENCRYPTION_SUPPORT_UNENCRYPTED_DATA=true` so rows
that arrive as plaintext stay readable during the backfill. Port bound to
`127.0.0.1:3000:3000`. Caddy's `money.example.org` route picks it up.

### 10.3 The cutover (~30 minutes)

1. **Stop syncing on the pod** so the data stops moving under you.
2. **`pg_dump` from the pod** — this is the full-fidelity route. Use it, not the CSV
   export: `accounts.csv` carries current balances only, and **balance history is the one
   thing that cannot be rebuilt.**
3. **Restore into the new Postgres.**
4. **Start Sure and verify, in this order:** net worth figure matches the pod; transactions
   are present; the net worth chart still shows its full history.
5. **Re-enrol passkeys** for both of you — `WEBAUTHN_RP_ID` changed, so the old ones are
   dead. Two minutes.
6. **SimpleFIN:** if the connection works, you're done. If the `access_url` won't decrypt,
   generate a fresh setup token at the Bridge and reconnect — free, and your history stays.
7. **Run a sync end to end** and confirm new transactions land.

### 10.4 Don't burn the bridge

- **Keep the pod running for a week.** It's $3–6/month; that's cheap insurance.
- **Only one instance syncs.** Two instances against the same SimpleFIN connection will
  diverge. The new box is canonical from the moment you restore.
- **Set up backups on the new box before you cancel the pod** (§8) — nightly encrypted
  `pg_dump` offsite, plus the encryption keys stored separately, and a **tested restore**.
- Take a **final archived dump** of the pod before cancelling, and keep it.
- Then cancel.

### 10.5 What will break — all expected, all minor

| | Fix |
|---|---|
| Passkeys stop working | Re-enrol. `WEBAUTHN_RP_ID` is hostname-pinned. 2 min. |
| SimpleFIN may need reconnecting | Fresh setup token. Free. History is unaffected. |
| The URL changes | `*.pikapod.net` → `money.example.org`. Re-add to home screens. |

Nothing else should move. Sure is stock Rails + Postgres and the data is yours.

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
