# Legal and SEO Audit — 2026-10-08

Run per `.claude/commands/legal.md` (last run 2026-05-15) and `.claude/commands/seo.md`, against a fresh `npm run build` (135 pages, 0 errors). Nothing was changed on the site. This is a punch list.

> Not legal advice. Items marked **(lawyer)** are judgement calls worth a short paid review rather than a self-fix.

---

# Part 1: Legal

## Summary

| Priority | Item | Effort |
|---|---|---|
| **HIGH** | Amazon Associates required statement is missing sitewide | 5 min |
| **HIGH** | Affiliate links without an inline disclosure on `ghb`, `lsd`, `poppers`, `test-kits`, `interactions` | 15 min |
| **MEDIUM (lawyer)** | Washington My Health My Data Act exposure from GA4 on drug pages | decision |
| **MEDIUM** | Privacy policy has small accuracy gaps (search terms, affiliate-click event, "no information about what drugs you use") | 15 min |
| **LOW** | "Not medical advice" missing inline on `reagent-chart`, `test-kits`, `which-test-kit` | 10 min |
| **LOW** | Verify `hello@ravewellness.org` is monitored (carried over, still unchecked) | 2 min |
| **LOW** | EU/UK cookie consent (carried over, known and accepted) | no change |

## HIGH-1 · Amazon Associates statement is missing
The Amazon Associates Operating Agreement requires the exact sentence **"As an Amazon Associate I earn from qualifying purchases"** (or close equivalent wording) to be displayed on the site. `grep -ri "qualifying purchases" src/` returns nothing. Amazon is named in `privacy.astro` and `terms.astro`, but not with the required statement. 23 source files carry the `ravewellness01-20` tag, 13 of them blog posts.

This is a contract compliance issue, not an FTC one, and the penalty is account termination plus forfeited commissions.

**Fix:** append it to the footer disclaimer in `src/layouts/BaseLayout.astro:152` and to the blog disclaimer in `src/pages/blog/[...slug].astro:108`:
> …Some links are affiliate links. As an Amazon Associate we earn from qualifying purchases.

## HIGH-2 · Affiliate links with no inline disclosure
The per-page scan counted affiliate links (branded `/kits`-style redirects to `dancesafe.org/r/ravewellness`, `amazon.com…tag=`) against "affiliate/commission" mentions on the same page:

| Page | Affiliate links | Inline disclosure |
|---|---|---|
| `ghb.astro` | 4, including **2 Amazon product links** (lines 214, 298: oral syringes) | **none** |
| `lsd.astro` | 5, including `/lsd-kit` ×3 (lines 220, 242, 571) | **none** |
| `poppers.astro` | 2 (`/store`) | none |
| `test-kits.astro` | 2 (`/store`, `/kits`) | none |
| `interactions.astro` | 1 (`/store`) | none |

`legal.md` already sets the standard: disclose *before or near* the link, not just in the footer. `ghb.astro` and `lsd.astro` are the real gaps, because they carry in-content product recommendations. The `/store` links on the other three are probably the nav "shop" link. That is lower risk, but it is still an undisclosed referral link.

**Fix:** add the standard `affiliate-note` paragraph from `legal.md` above the first affiliate link on `ghb.astro` and `lsd.astro`. For the nav `/store` link, either add "(affiliate)" to its label or rely on the footer plus a nav tooltip. Also update `legal.md`'s status table, which says the lsd/psilocybin/2cb pages were checked; `lsd.astro` does not have a disclosure.

**Already compliant:** every blog post gets the template-level line "Some links are affiliate links" *above* the content (`[...slug].astro:108`). It covers all 50 posts with affiliate links, so no per-post change is needed.

## MEDIUM-1 (lawyer) · Washington My Health My Data Act
The MHMDA has been in force since 2024. It has **no revenue or size threshold** and a **private right of action**. Commentators flag URL-level analytics on health-condition pages as potentially "consumer health data." The site runs GA4 (`G-ES9Z0KYP85`, `BaseLayout.astro:72`) on every page, including pages a reader visits *because* they use a specific drug. It also fires a custom `affiliate_click` event that records the product path (e.g. `/fentanyl-strips`) and the page path (`BaseLayout.astro:181`).

Mitigating factors: no accounts, no forms, no ad features, no identifiers beyond the GA client ID, and pseudonymous GA data. Whether that is "linked or reasonably linkable" to a WA consumer is unsettled.

**Options, in order of cost:**
1. Get a one-hour opinion on whether GA4 page-path data on drug pages is in scope **(lawyer)**.
2. If yes, the lowest-friction fix is either GA4 Consent Mode (no analytics cookies until opt-in) or a cookieless analytics tool for the drug pages. A stand-alone "Consumer Health Data Privacy Policy" link in the footer is also required.
3. Similar laws in Nevada (SB 370) and Connecticut's health-data amendments make the same decision apply more broadly.

Sources: [Lokker: MHMDA for website operators](https://lokker.com/privacy-law/washington-my-health-my-data), [Enzuzo: MHMDA 2026 compliance guide](https://www.enzuzo.com/blog/washington-mhmda), [Benesch: MHMDA in effect](https://www.beneschlaw.com/insight/reminder-washingtons-my-health-my-data-act-now-in-effect/)

## MEDIUM-2 · Privacy policy accuracy (`privacy.astro`, last updated Aug 13)
These are small, but a privacy policy that overstates or understates practices is the thing regulators cite.
- It says GA tells us "what search terms bring them here." GA4 does not receive organic search queries; Search Console does. Either drop the phrase or say "Google Search Console."
- It does not mention the **`affiliate_click` custom event** (which product link was clicked, and from which page). Add one line under Analytics.
- "We do not collect information about what drugs you use." This is true for direct collection, but page-view data on `/ghb.html` arguably reveals interest. Suggested rewording: "We don't ask for or store what drugs you use. Like any analytics, page-view data shows which pages were read."
- Bump "Last updated" when you change it.

## LOW-1 · Inline "not medical advice"
`reagent-chart.astro`, `test-kits.astro` and `which-test-kit.astro` have no inline disclaimer (the footer covers them). These are tool pages, not dosing pages, so the risk is low. Add the one-line hero disclaimer for consistency with the drug guides.

## LOW-2 · Carried over from May
- Confirm `hello@ravewellness.org` receives mail. It is referenced in Privacy, Terms and Contact, and has never been verified.
- Confirm GA4 Admin → Data Settings → Data Collection still has **Google signals off**.
- No cookie banner (EU/UK). This was previously accepted as low enforcement risk; no change recommended unless EU traffic is material. I could not verify the current status of the UK's statistical-cookie exemption (the search tool was unavailable).
- The FTC Endorsement Guides (16 CFR 255) have not been revised since the 2023 update, so the standard used in `legal.md` is still current. Source: [Hello Partner: 2023 endorsement guide changes](https://hellopartner.com/2023/07/04/federal-trade-commission-shares-new-endorsement-guides-with-big-changes-for-creators/)

## Checked and fine
- Footer "not medical advice" plus the controlled-substance disclaimer is present on every page.
- The blog template disclaimer includes an emergency line and an affiliate line.
- Terms (May 15) still match the business: DanceSafe and Amazon only, 18+, liability sections intact. No new affiliate programs were found (all 26 `vercel.json` redirects point to `dancesafe.org/r/ravewellness`).
- No forms anywhere (`grep "<form"` returns nothing), which matches the privacy policy.
- No Vercel Analytics or Speed Insights scripts, which matches "Google and Vercel hosting only."

---

# Part 2: SEO

## Summary

| Priority | Item | Count |
|---|---|---|
| **HIGH** | `llms.txt` is stale: 19 of 111 posts listed, not updated since Aug 17 | 1 file |
| **MEDIUM** | Meta descriptions over 160 chars | 16 pages |
| **MEDIUM** | Newest two posts render without the brand suffix (title > 54 chars) | 2 posts |
| **LOW** | `privacy.html` and `terms.html` have no JSON-LD | 2 |

## HIGH · `llms.txt` is stale
`public/llms.txt` was last changed 2026-08-17. It links 19 blog posts. Since then, about 15 posts have shipped that it does not mention, including the higher-stakes ones that AI answers should find: `nitazenes-dangers`, `cychlorphine-dangers`, `gas-station-drugs`, `gas-station-mdma-alternatives`, `mda-and-ssris`, `dayquil-and-mdma`, `why-mdma-redosing-stops-working`, and the two gut posts. `interaction-chart.html` is also missing. `seo.md` says to keep it updated "when major new content is added," and the opioid adulterant posts qualify.

**Fix:** add an "Opioid adulterants" section (nitazenes, cychlorphine, plus fentanyl strips) and an "Interactions" section entry for the chart.

## MEDIUM · Meta descriptions over 160 characters
Target is 120–160 per `seo.md`. Google truncates around 155–160.

| Chars | Page |
|---|---|
| 249 | `poppers.html` |
| 221 | `ghb.html` |
| 204 | `mdma.html` |
| 199 | `faq.html` |
| 198 | `lsd.html` |
| 188 | `hearing.html` |
| 187 | `cocaine.html`, `ketamine.html`, `blog/is-ketamine-good-for-your-gut.html` |
| 186 | `psilocybin.html`, `blog/do-party-drugs-hurt-your-gut.html` |
| 184 | `nitrous.html` |
| 179 | `reagent-chart.html` |
| 171 | `index.html` |
| 163 | `test-kits.html` |
| 162 | `interaction-chart.html` |

The drug guides are the high-traffic pages, so keep the safety-critical clause in the first ~150 characters.

## MEDIUM · Brandless titles on the two newest posts
`do-party-drugs-hurt-your-gut` and `is-ketamine-good-for-your-gut` have frontmatter titles over 54 chars, so the template drops " | Rave Wellness." This is working as designed, and every other post (109 of 111) keeps the brand. Shorten them if brand recognition in the SERP matters.

## LOW · No structured data on privacy/terms
`privacy.html` and `terms.html` have no JSON-LD. Optional: add a `WebPage` with `BreadcrumbList`. It has no ranking impact; it is only for consistency.

## Checked and passing
- **Titles:** 0 rendered titles over 70 chars and 0 `&amp;amp;` double-encodes.
- **Duplicates:** 0 duplicate titles and 0 duplicate descriptions across 134 pages.
- **H1:** exactly one per page on all 134.
- **Canonicals:** present on every page except `404.html`, which is correct, and it carries `noindex`.
- **Images:** no `<img>` is missing `alt` or `width`.
- **Internal links:** 0 broken. All 369 hrefs that do not resolve to built files are the `/kits`-style affiliate redirects in `vercel.json`, which is intended.
- **Sitemap:** 134 URLs, which matches the pages built.
- **`lastmod` hygiene:** every post edited since Aug 20 either has a bumped `lastmod` or is new. The Oct 3 batch (`mdma-dosing-guide`, `how-long-does-mdma-last`, `festival-heat-hydration`, `why-didnt-my-molly-work`, `cocaine-and-mdma`) is all dated `2026-10-03`. No future-dated posts.

## After fixing
Run `npm run build`, then `npm run indexnow`, and resubmit the sitemap in Search Console. When the research-watch P1 (nitrous) fix lands, set `lastmod` on `nitrous-oxide-b12-nerve-damage.md`.

---

# Fixes applied — 2026-10-08 (same day)

**Legal**
- HIGH-1 ✅ Amazon Associates statement added to the sitewide footer (`BaseLayout.astro`) and the blog disclaimer (`[...slug].astro`).
- HIGH-2 ✅ Inline affiliate disclosures added on `ghb.astro` (Amazon syringe link plus Trusted Resources), `lsd.astro` (Ehrlich kit card plus Trusted Resources), `poppers.astro` (Trusted Resources) and `test-kits.astro` (DanceSafe kit link). The `/store` links on `interactions.astro` and the other pages flagged above sit in the footer org slot, directly beside the footer affiliate disclaimer, so they were left as is. The LSD research-card link labelled "DanceSafe: NBOMe Compounds, Identification and Risks" pointed to the store, not an article, so it was relabelled to say what it is.
- MEDIUM-1 ⏸ **Not changed. This needs your decision or a lawyer's** (WA MHMDA: consent mode, cookieless analytics, or a consumer health data policy).
- MEDIUM-2 ✅ Privacy policy: dropped "search terms," disclosed the affiliate-click event, reworded the "what drugs you use" line, and set Last updated to October 8, 2026.
- LOW-1 ✅ "Not medical advice" added to `reagent-chart`, `which-test-kit` and `test-kits`.
- LOW-2 ⏸ Mailbox and GA4 Google-signals checks need you, since they are account access, not code.

**Found and fixed during this pass (safety):** `ghb.astro:292` still said "Start at 0.5–1ml for any new batch," the same contradiction fixed in JSON-LD on Aug 15 (P0-2). It now says 0.5ml.

**SEO**
- ✅ `llms.txt`: added the interaction chart, a new "Opioid Adulterants" section (nitazenes, cychlorphine, gas station drugs, fentanyl strips), 8 more notable posts, and two drug-checking key facts (strips miss nitazenes, cychlorphine and medetomidine; contamination in cocaine is uneven).
- ✅ All 16 meta descriptions are now 120–158 chars. A literal `&amp;` in the LSD og description was replaced with "and."
- ✅ Gut post titles shortened, so both now keep the " | Rave Wellness" suffix.
- ✅ `WebPage` + `BreadcrumbList` JSON-LD added to privacy and terms.
- Re-ran the checks after the build: 0 long descriptions, 0 brandless titles, 0 duplicate titles or descriptions, 0 broken internal links.

---

# Dosing policy pass — 2026-10-08

**Policy (your decisions):**
- Community dose heuristics are replaced with relative guidance.
- **All** GHB/GBL numbers are removed, including the redose interval.
- Study doses stay, framed as "the study gave," and safety limits stay.
- Supplements are unchanged.

The policy is now written into `/harm-reduction-expert`, `/blog` and `/fact-check`, so future audits and posts won't reintroduce numbers. (`/harm-reduction-expert` previously said "never remove a dose figure.")

**Changed:**
- **GHB:** `ghb-dosing-guide.md` (retitled "GHB Safety: Unknown Strength, and Why Redosing Kills"), `ghb.astro` (dose table, timeline, GBL ratio, JSON-LD, meta), `ghb-vs-gbl.md`, `ghb-and-alcohol.md`, and the FAQ GHB answers.
- **MDMA:** `mdma-dosing-guide.md` (retitled "MDMA Dose Safety: What the Research Actually Shows"; mg/kg table removed, MAPS trial doses kept as research), the `mdma.astro` dose table and JSON-LD, the FAQ, `why-didnt-my-molly-work`, `mdma-and-your-period`, `ecstasy-vs-molly`, `how-long-does-mdma-last`, `how-long-does-mdma-stay-in-your-system`, `is-my-molly-real-or-fake`.
- **Psilocybin:** the `psilocybin.astro` gram table, two JSON-LD answers, meta and headline; `safe-psilocybin-trip-guide`, `microdosing-psilocybin` (now cites the 2026 subperceptual-dose RCT, PMID 42797541), `how-long-do-shrooms-last`, `shrooms-supplements-before-after`, and the FAQ gram tiers.
- **LSD / 2C-B / ketamine:** dose tables replaced on `lsd.astro`, `2cb.astro` and `ketamine.astro`; ketamine nasal-spray recipes removed from `diy-ketamine-nasal-spray`, `ketamine-nasal-spray` and the FAQ; also `how-long-does-lsd-last`, `does-lsd-stay-in-your-spine`, `2cb-vs-tusi-pink-cocaine`, `do-you-need-a-milligram-scale`.
- **Combinations:** `candy-flip-guide`, `hippie-flip-guide`, plus the interaction checker and FAQ ("take less of each than alone").
- **Benzodiazepine amounts removed** ("use only as prescribed"): `how-to-stop-a-bad-trip`, `how-to-sleep-after-a-rave`, the interaction checker, and the FAQ.

**Deliberately kept:**
- Trial and PK study doses (MAPS 80/120 mg, the Basel 120+60 mg booster trial, Holze 100/200 µg LSD durations, clinical psilocybin 20–25 mg, 2C-B Papaseit 10–20 mg, esketamine 56/84 mg).
- Pill-content supply data (0–300 mg per pill).
- Fentanyl-strip sample sizes.
- Hydration ceilings.
- The MDMA "no earlier than 90 minutes" redose wait (derived from PK).
- Prescription-label facts (bupropion, Vyvanse, DayQuil).
- Hospital cyproheptadine dosing.
- Narcan 4 mg.
- Caffeine amounts.
- All supplement doses.

---

# Supplement substantiation pass — 2026-10-08

Goal: keep the affiliate links, and make every supplement claim near one say plainly that it is not proven in humans.

**Two claims had no supporting evidence. Both were corrected:**
- **NAC for ketamine.** `ketamine.astro` (three places) and `faq.astro` said "clinical trials in ketamine use disorder show NAC reduces cravings and compulsive redosing," and called NAC "the only supplement with direct human data." A PubMed search found no such trial. The only NAC–ketamine studies are in rats (e.g. PMID 40111652). This is now stated as rodent-only, with no human trial for ketamine use, craving or bladder damage.
- **Methylcobalamin for nitrous.** `nitrous.astro` said methylcobalamin is required and that cyanocobalamin is "less effective," citing the NIH Office of Dietary Supplements B12 fact sheet. That fact sheet does not support the claim; it says there is little evidence any form is better. The page now says no oral form is proven better, and that no oral B12 is proven to prevent nitrous damage. It also notes that medical treatment is injected hydroxocobalamin, which is consistent with `nitrous-oxide-b12-nerve-damage.md`.

**A wrong citation was found:** in `hearing.astro`, the link labelled "Kopke 2010, NAC for noise-induced hearing loss" pointed to PMID 20662955, a dementia trial. It was replaced with the real Kopke 2015 RCT (PMID 25620313: 566 soldiers, primary outcome not met), and the card no longer claims NAC "reduces" hearing damage.

**Softened, with a "Not proven in humans" notice added next to the affiliate links:**
- **`mdma.astro`:** a banner above the protocol; every supplement card reworded; the structured-data protocol and magnesium answers rewritten (the magnesium answer said "Yes"); the shop section relabelled "not proven in humans"; product cards changed from "dramatically reduces jaw clenching" and "drives glutathione synthesis" to evidence-tiered text; the unverified "DanceSafe protocol" attributions removed; the electrolyte "critical for preventing hyponatremia" claim corrected. The fentanyl-strip and milligram-scale buttons said "Buy on Amazon" but link to DanceSafe; they're relabelled.
- **`ketamine.astro`:** a section-level notice, and every card reworded.
- **`nitrous.astro`:** the B12 protocol is reframed as community practice, not proven.
- **Blog posts with the notice added:** `mdma-supplements-protocol` (the "Magnesium is the one with a real job" heading changed), `mdma-comedown`, `mdma-magnesium-jaw-clenching`, `how-to-sleep-after-a-rave` (the speculative "replacing something you depleted" claim removed), `shrooms-supplements-before-after`.
- **Also:** `galaxy-gas-nitrous-tanks-nerve-damage`, `index.astro` (nitrous card), and one leftover psilocybin "50–70% of your dose" line.

**Already honest, unchanged:** the FAQ supplement answers, `5-htp-and-molly`, `mdma-green-tea-extract-egcg`, `ringing-ears-after-concert`.

**Recommended next:** two of the roughly 470 cited PMIDs checked in this pass were wrong or unsupported. `pmid-index.md` only confirms that each PMID resolves to some paper, not that it is the paper the text describes. A full title-match audit, comparing each PMID's real title against the text cited beside it, is worth running.
