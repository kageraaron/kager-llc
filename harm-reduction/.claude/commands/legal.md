Audit and maintain legal compliance for ravewellness.org — a harm reduction information site with Google Analytics, affiliate links (DanceSafe + Amazon), and YMYL (health/safety) content.

**Usage:**
- `/legal audit` — run a full legal compliance audit across all pages and output a prioritized punch list
- `/legal fix <item>` — implement a specific legal fix

---

## Why this matters

Rave Wellness publishes content about controlled substances and drug safety. Legal exposure comes from three areas:
1. **Liability for health information** — "not medical advice" disclaimers must be visible and specific, especially on blog posts where readers may act on clinical-sounding claims
2. **FTC affiliate disclosure** — the FTC requires "clear and conspicuous" disclosure near affiliate links, not just buried in a footer; violation risk is real for sites with Amazon/DanceSafe affiliate relationships
3. **Privacy law (GDPR, CCPA, COPPA)** — Google Analytics + cookies trigger disclosure requirements; no account system limits exposure, but the privacy policy must stay accurate

---

## Current audit status (last run: 2026-05-15)

### Disclaimers
| Item | Status | Notes |
|---|---|---|
| "Not medical advice" in sitewide footer | ✅ | Present on every page via BaseLayout |
| Inline disclaimer on drug guide pages (hero section) | ✅ | Present on index + individual drug pages |
| Inline disclaimer on blog posts | ✅ | Added 2026-05-15: purple-bordered block above `<Content />` in `[...slug].astro` |
| Terms of Use / limitation of liability page | ✅ | Created 2026-05-15 at `/terms.html` |
| Terms linked in footer | ✅ | Appears alongside Privacy Policy in footer |

### FTC Affiliate Disclosure
| Item | Status | Notes |
|---|---|---|
| Affiliate disclosure in sitewide footer | ✅ | Present in footer disclaimer copy |
| Inline disclosure on `index.astro` | ✅ | Near DanceSafe affiliate links |
| Inline disclosure on drug guide pages | ⚠️ | Inconsistent: present on some pages (`psilocybin.astro`, `2cb.astro`), missing on `mdma.astro` affiliate section |
| Inline disclosure on blog posts | ⚠️ | Blog post template blog disclaimer does not mention affiliate links; individual posts mention it inline but inconsistently |
| FTC-compliant placement standard | ⚠️ | FTC requires disclosure *before or near* the affiliate link, not just below or in the footer |

**Standard disclosure to use:**
```html
<p class="affiliate-note"><em>Some links on this page are affiliate links. We earn a small commission at no cost to you — all recommendations are based on harm reduction value.</em></p>
```

### Privacy Policy
| Item | Status | Notes |
|---|---|---|
| Privacy policy page exists | ✅ | `/privacy.html` — created 2026-05-15 |
| GA4 data collection disclosed | ✅ | Accurate: pages, geo, device, referring source |
| Cookie disclosure | ✅ | Analytics cookies only, 2-year expiry |
| No advertising features | ✅ | Confirmed in GA4 setup |
| Affiliate relationships named | ✅ | DanceSafe referral code + Amazon tag both named |
| YouTube nocookie embed | ✅ | Disclosed; privacy-enhanced domain noted |
| Data sharing policy | ✅ | Google Analytics + Vercel only |
| User rights (GDPR/CCPA) | ✅ | Google's tools referenced for opt-out |
| Contact email | ✅ | `hello@ravewellness.org` — referenced in Privacy Policy, Terms, and Contact page |
| COPPA (under-18) | ✅ | "intended for adults" stated |

### Terms of Use
| Item | Status | Notes |
|---|---|---|
| Terms of Use page exists | ✅ | `/terms.html` — created 2026-05-15 |
| Educational information disclaimer | ✅ | Section 1 |
| No liability clause | ✅ | Section 2 + Section 9 |
| Controlled substance disclaimer | ✅ | Section 3 |
| Age requirement (18+) | ✅ | Section 4 |
| Affiliate disclosure | ✅ | Section 5 |
| Intellectual property | ✅ | Section 6 |
| Third-party links | ✅ | Section 7 |
| Limitation of liability | ✅ | Section 9 |

### Age Verification
| Item | Status | Notes |
|---|---|---|
| Age gate or verification | ❌ | Not implemented — rely on disclaimer only |
| "18+" statement on Terms | ✅ | Section 4 |
| "Intended for adults" in privacy policy | ✅ | Children section |

Age gates are not legally required for information-only sites in most US jurisdictions. The disclaimer + ToU approach is standard for harm reduction organizations (DanceSafe, Erowid). No change recommended unless jurisdiction-specific requirements emerge.

---

## Priority fixes remaining

### 1. FTC inline affiliate disclosure on `mdma.astro` (DONE)
`mdma.astro` line 803 already has `Affiliate disclosure: links below may earn a commission at no extra cost to you.` and the hero section (line 161) also mentions affiliate links. Confirmed compliant.

### 2. FTC inline disclosure standard on blog posts (MEDIUM)
The blog disclaimer block added 2026-05-15 says "not medical advice" but does not mention affiliate links. Options:
- Update the blog disclaimer block to also mention affiliate links: "Some links may be affiliate links."
- OR require individual blog posts with affiliate links to include a dedicated disclosure line

Current blog disclaimer text already covers this with "Some links may be affiliate links." — if not, update `[...slug].astro` disclaimer copy.

### 3. Verify `hello@ravewellness.org` mailbox (MEDIUM)
The privacy policy and terms both reference this email. If the mailbox does not exist or is not monitored, update both pages to use whatever address is actually monitored.

### 4. Trademark / brand protection (LOWER)
"Rave Wellness" is not registered as a trademark. This is low risk for a small harm reduction site but worth noting if the brand grows.

---

## Key legal distinctions for this site type

**"Not medical advice" disclaimers work when:**
- They are visible and specific (not buried in fine print)
- The site does not establish a patient-provider relationship
- Content is educational, not prescriptive ("here is what the research shows" vs. "you should take X")

**FTC disclosure is required when:**
- You have a material connection to a seller (affiliate relationship = yes)
- You are endorsing or recommending a product
- The disclosure must be "clear and conspicuous" — meaning a reader will see it before clicking the link

**GDPR applicability:**
- Unclear whether EU users visit the site. If yes, technically GDPR applies. The current privacy policy + Google Analytics opt-out tools provide reasonable good-faith compliance for a non-EU-based information site.
- No cookie consent banner is implemented. This is a known gap but low enforcement risk for a US-based harm reduction site with no commercial transactions.

---

## Legal review checklist (run this quarterly)

- [ ] Verify `hello@ravewellness.org` mailbox is active and monitored
- [ ] Check that Privacy Policy "Last updated" date matches the most recent substantive change
- [ ] Verify affiliate relationships have not changed (DanceSafe referral code, Amazon tag)
- [ ] Confirm GA4 advertising features remain off (check GA4 Admin > Data Settings > Data Collection)
- [ ] Check that new drug guide pages added since last review include inline "not medical advice" disclaimer
- [ ] Check that blog posts with affiliate links include inline FTC disclosure near the links
- [ ] Review any new affiliate relationships added — update Privacy Policy and Terms Section 5

---

## Files with legal relevance

| File | What to check |
|---|---|
| `src/layouts/BaseLayout.astro` | Footer disclaimer, footer legal links (Privacy, Terms) |
| `src/pages/privacy.astro` | Privacy Policy content + "Last updated" date |
| `src/pages/terms.astro` | Terms of Use content + "Last updated" date |
| `src/pages/blog/[...slug].astro` | Blog disclaimer block above `<Content />` |
| `src/pages/index.astro` | Inline affiliate disclosure near DanceSafe/Amazon links |
| `src/pages/mdma.astro` | Inline affiliate disclosure near supplements section |
| Individual blog posts in `src/content/blog/` | FTC affiliate disclosure if post contains affiliate links |
