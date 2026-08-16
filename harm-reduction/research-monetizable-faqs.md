# Research: Monetizable FAQs — new blog post ideas ranked by flat-bounty economics

**Status: IN PROGRESS.** Written incrementally. Everything below is already saved.
If interrupted, resume from the last completed idea rather than starting over.

**Date:** 2026-08-15
**Brief:** Rank new blog post ideas that (a) answer questions people actually ask and
(b) plausibly drive affiliate conversions, under the DanceSafe **flat ~$4/conversion**
bounty. Basket size is irrelevant. Levers are (1) number of distinct first purchases,
(2) number of repeat purchases. Amazon at ~1–1.86% is a 50x worse fallback and only
for things DanceSafe does not sell.

---

## Step 1 — Existing coverage checked against

### All 96 published blog slugs (`src/content/blog/*.md`), checked for cannibalisation

```
2cb-vs-tusi-pink-cocaine            adhd-meds-and-recreational-drugs
5-htp-and-molly                     are-amazon-drug-test-kits-legit
can-ghb-cause-seizures              can-one-loud-night-damage-hearing
can-you-overdose-on-mushrooms       can-you-overdose-touching-fentanyl
candy-flip-guide                    cocaine-and-alcohol
cocaine-and-mdma                    cocaine-harm-reduction
cocaine-heart-attack                dancesafe-vs-bunk-police
diy-ketamine-nasal-spray            dmt-vapes-and-microdosing
do-earplugs-ruin-music-at-raves     do-ears-toughen-up-to-loud-music
do-reagent-test-kits-expire         does-ketamine-cause-brain-damage
does-lsd-stay-in-your-spine         drug-checking-services-festivals
ecstasy-vs-molly-mdma               ehrlich-reagent-color-chart
festival-heat-hydration             froehde-reagent-color-chart
galaxy-gas-nitrous-tanks-nerve-damage  ghb-and-alcohol
ghb-dosing-guide                    ghb-vs-gbl
ghb-withdrawal                      harm-reduction-at-festivals
hippie-flip-guide                   how-long-do-shrooms-last
how-long-does-lsd-last              how-long-does-mdma-last
how-long-does-mdma-stay-in-your-system  how-many-tests-per-reagent-kit
how-to-come-down-from-molly-faster  how-to-read-a-marquis-reagent-result
how-to-sleep-after-a-rave           how-to-stop-a-bad-trip
how-to-test-cocaine                 how-to-test-mdma
how-to-use-fentanyl-test-strips     is-it-legal-to-buy-a-drug-test-kit
is-ketamine-addictive               is-microdosing-safe-long-term
is-my-acid-real-or-nbome            is-my-molly-real-or-fake
isopropyl-poppers-eye-damage        ketamine-and-alcohol
ketamine-bladder-damage             ketamine-nasal-spray
ketamine-vapes                      lemon-tek-psilocybin
levamisole-in-cocaine               liebermann-reagent-color-chart
lsd-and-lithium                     mandelin-reagent-color-chart
mda-vs-mdma                         mdma-and-alcohol
mdma-and-your-period                mdma-comedown
mdma-dosing-guide                   mdma-green-tea-extract-egcg
mdma-how-long-between-uses          mdma-magnesium-jaw-clenching
mdma-neurotoxicity                  mdma-ssri-interaction
mdma-supplements-protocol           mecke-reagent-color-chart
microdosing-psilocybin              muffled-ear-after-concert
nitrous-oxide-b12-nerve-damage      poppers-viagra-cialis
post-festival-recovery              psilocybin-lookalikes-galerina
r-vs-s-ketamine                     rave-music-and-adhd-brains
ringing-ears-after-concert          safe-psilocybin-trip-guide
serotonin-syndrome                  set-and-setting
sharing-straws-hepatitis-c          should-you-test-lsd
shroom-chocolate-bars-gummies       shrooms-and-antidepressants
shrooms-supplements-before-after    simons-reagent-color-chart
trance-states-music-drugs           vyvanse-and-mdma
weed-and-psychedelics               what-not-to-mix-with-alcohol
where-to-get-drugs-tested           why-didnt-my-molly-work
```

**The existing purchase-intent cluster is the most important cannibalisation risk.**
Already published and owning these queries:
`do-reagent-test-kits-expire`, `how-many-tests-per-reagent-kit`,
`are-amazon-drug-test-kits-legit`, `is-it-legal-to-buy-a-drug-test-kit`,
`dancesafe-vs-bunk-police`, `is-my-molly-real-or-fake`, `is-my-acid-real-or-nbome`,
`how-to-test-mdma`, `how-to-test-cocaine`, `how-to-use-fentanyl-test-strips`,
`should-you-test-lsd`, `where-to-get-drugs-tested`, `how-to-read-a-marquis-reagent-result`,
plus 7 reagent colour-chart posts (ehrlich, marquis, mecke, simons, froehde, mandelin, liebermann).

### Backlog read
`blog-ideas.md` (298 lines) read in full. Open `[ ]` items relevant here:
- "What do you actually need to test drugs? A complete checklist" — **open**, and explicitly
  intended to surface `/spot-plate`, `/pipette`, `/micro-scoop`, `/mg-scale`.
- "How to set up drug checking at your event, venue or campus" — open.
- "Seasonal festival-prep checklist" (6–8 weeks ahead) — open.
- "What does fentanyl look like in cocaine or MDMA?" — open.
- "How to check drugs at a festival when you have no kit" — open.
- "How to spot a fake pressed pill" — open.
- Xylazine "tranq" post — open, is the only home for `/xylazine-strips` demand.
- Medetomidine — open.
- "Do shrooms expire? Potency and storage" — open, flagged for scales.

Also read `research-faq-gaps-a.md` (12 findings) and `research-faq-gaps-b.md` (14 findings)
in full-heading form; noted overlaps are called out per idea below.

### Standing policy constraints applied throughout
- **No monetisation on GHB / drink spiking.** Drink-spiking strips have poor GHB accuracy.
- **No purchase prompts in emergency content** (overdose, naloxone, 911, serotonin syndrome,
  sudden hearing loss).
- **No supplement links for tinnitus** — nothing treats existing tinnitus.
- **Reagents cannot distinguish N,N-DMT from 5-MeO-DMT** (both indoles). No idea may imply otherwise.

### Underused slugs I am trying to find a home for
Current in-repo link counts: `/pipette` 2, `/micro-scoop` 2, `/standard-kit` 2,
`/mecke-kit` 3, `/froehde-kit` 3, `/mandelin-kit` 3, `/nasal-spray-kit` 4,
`/hydration-pack` 5, `/liebermann-kit` 6, `/marquis-kit` 7, `/simons-kit` 7,
`/spot-plate` 9, `/cocaine-kit` 9, `/crisp-tube` 10, `/ketamine-kit` 14,
`/earplugs` 16, `/mg-scale` 20, `/lsd-kit` 25, `/kits` 29, `/store` 30,
`/mdma-kit` 33, `/fentanyl-strips` 56, `/xylazine-strips` 8.

---

## Method note / limitation (read this before trusting the query lists)

**The session's WebSearch budget was already exhausted (200/200) before this run started, and
every fallback failed:** Reddit is blocked to WebFetch, DuckDuckGo (html + lite) served CAPTCHAs,
Mojeek returned 403, and Bing's fetch summariser refused the drug-related queries outright.

So the query phrasings below come from three sources, and I have labelled which is which:
- **[GSC]** — verbatim from the live Google Search Console / Bing pull recorded in `blog-ideas.md`
  (2026-08-12), with impressions and position. This is the strongest evidence available and is
  better than anything a web search would have returned.
- **[RESEARCH]** — from the 26 verified findings in `research-faq-gaps-a.md` / `-b.md`.
- **[INFERRED]** — my reconstruction of how people phrase the question, from the shape of the
  existing corpus and standard query patterns. **These must be checked in a keyword tool or GSC
  before anyone writes the post.** Do not treat them as measured demand.

Every idea's "Evidence needed" section names what still has to be verified.

---

## Ideas

_(appended one at a time as researched)_

### 1. Do you need to test every batch? (and how many strips to keep on hand)

- **Queries**:
  - Primary: "do I need to test every time" / "do I have to test every bag" [INFERRED]
  - Secondary: "how many fentanyl test strips do I need", "can you reuse a fentanyl test strip",
    "one strip per bag" [INFERRED]
  - Long-tail: "I tested this dealer's stuff last time, do I need to test again",
    "how many strips for a festival weekend", "do fentanyl test strips expire" [INFERRED]
- **Intent**: purchase-intent (repeat purchase specifically)
- **Honest product fit**: `/fentanyl-strips`, `/xylazine-strips`. This is the single most honest
  repeat-purchase argument the site has. Immunoassay strips are **genuinely single-use** — the
  nitrocellulose is consumed by the wicked sample and a used strip cannot be re-run. And the
  reason to re-test is real, not manufactured: fentanyl in a non-opioid powder is unevenly
  distributed ("chocolate chip cookie" heterogeneity), so a negative on one aliquot does not
  clear the rest of the bag, let alone the next bag from the same source. A person testing
  properly consumes strips continuously.
- **Repeat-purchase potential**: **Yes — the highest of any idea in this file.** Strips are
  consumables with a per-use burn rate. Under a flat $4 bounty, a reader who buys a 10-pack
  three times a year is worth three times a reader who buys one 9-reagent set forever.
- **Cannibalisation check**: `how-to-use-fentanyl-test-strips` is the nearest neighbour and
  already has a "False negatives and the hotspot problem" section plus a "Where to get fentanyl
  test strips" section. **This is a real overlap and must be handled deliberately.** The
  distinction that makes a separate post defensible: the existing post answers *how to run one
  test*; this one answers *how many tests, how often, and when a past result stops being valid*.
  `do-reagent-test-kits-expire` covers reagent shelf life but not strip shelf life or reuse.
  If the writer cannot make the separation crisp in the title and H1, **the better move is to
  expand `how-to-use-fentanyl-test-strips` with a "how often and how many" section** rather
  than risk the second same-query collision this site has had.
- **Evidence needed**: (a) BTNX strip stated shelf life and storage conditions from the
  manufacturer insert — do not guess; (b) a citable source for intra-batch fentanyl
  heterogeneity (the existing FTS post already cites something for the hotspot problem — reuse
  its source rather than finding a new one); (c) confirm DanceSafe's current strip pack sizes;
  (d) verify PMID 41531570 (elevated temperature degrades test-strip performance, flagged as
  verified in `research-faq-gaps-b.md`) since festival-bag heat is the natural hook.
- **Rank rationale**: The only idea that generates recurring bounties from a genuinely true
  premise, which under a flat per-conversion bounty is worth more than any one-time buy.

### 2. How to test ketamine (and what Morris actually tells you)

- **Queries**:
  - Primary: "how to test ketamine" [INFERRED]
  - Secondary: "morris reagent ketamine", "is my ket real", "how to tell if ketamine is cut" [INFERRED]
  - Long-tail: "how to test for 2F-DCK", "deschloroketamine vs ketamine reagent",
    "does ketamine test kit detect fentanyl" [INFERRED]
- **Intent**: purchase-intent
- **Honest product fit**: `/ketamine-kit` (Morris), plus `/fentanyl-strips` as the second half of
  the answer. The fit is honest because Morris is a genuinely unusual reagent — it is a two-part
  reagent that needs a different procedure from the single-drop reagents, and it is the only one
  in the standard set that gives a useful ketamine result. Someone who owns an MDMA kit and
  assumes it covers ketamine is wrong, and that is exactly the misconception the post corrects.
- **Repeat-purchase potential**: Partial. Morris degrades like other reagents (feeds the existing
  expiry post), and the fentanyl-strip half is consumable. The kit itself is a one-time buy.
- **Cannibalisation check**: **This is the clearest structural gap in the corpus.** The site has
  `how-to-test-mdma`, `how-to-test-cocaine` and `should-you-test-lsd`, but **no ketamine testing
  post at all**, despite `/ketamine-kit` already being linked 14 times from posts that have no
  natural place to explain the procedure. Nearest neighbours: `r-vs-s-ketamine` (which correctly
  says reagents cannot distinguish enantiomers — this post must repeat that limit, not contradict
  it), `ketamine-vapes`, `ketamine-nasal-spray`, `is-ketamine-addictive`. None of them is a
  testing procedure post. No cannibalisation risk.
- **Evidence needed**: (a) Morris reagent composition and the correct two-solution procedure —
  get this from DanceSafe's own instructions, not from memory; (b) whether Morris gives a
  distinguishable result for 2F-DCK / deschloroketamine, or whether it does not — **if it does
  not, say so plainly and do not imply the kit resolves analogues**; (c) current prevalence of
  ketamine analogues in the supply, which needs a real source (UNODC EWA or an EMCDDA report),
  not a forum claim.
- **Rank rationale**: An entire drug's purchase-intent query family is unserved while the product
  slug is already being linked without a destination post to justify it.

### 3. How to test an unknown powder (when you do not know what it is supposed to be)

- **Queries**:
  - Primary: "how to test an unknown powder" [INFERRED]
  - Secondary: "how to identify a white powder", "someone gave me a baggie what is it",
    "how to test a mystery pill" [INFERRED]
  - Long-tail: "which reagent for unknown substance", "reagent test unknown drug",
    "what order to test reagents" [INFERRED]
- **Intent**: purchase-intent
- **Honest product fit**: `/kits` (all 9) and `/standard-kit` (set of 6), and it is the one
  scenario where the multi-reagent set is genuinely the right recommendation rather than an
  upsell. Every existing testing post on the site assumes the reader knows what the substance is
  *supposed* to be, which is what lets a two-reagent kit suffice. Remove that assumption and you
  genuinely need a panel — and specifically the reagents that currently get almost no traffic:
  `/mandelin-kit`, `/froehde-kit`, `/liebermann-kit`, `/mecke-kit`.
- **Repeat-purchase potential**: No. One-time kit purchase. Ranked on first-purchase volume and
  on being the only honest home for four underused slugs.
- **Cannibalisation check**: Nearest are `how-to-test-mdma`, `how-to-test-cocaine`,
  `reagent-chart.astro` and `which-test-kit.astro`. `which-test-kit.astro`'s structure is "pick by
  what you are testing", which is precisely the *inverse* case, so this post is its complement,
  not its competitor. No blog post covers the unknown-substance workflow. Distinct.
- **Evidence needed**: The honest ceiling has to be stated hard and early: **reagent colour
  reactions are presumptive and class-level, not identification.** A panel narrows the field; it
  does not name the compound, cannot detect everything present in a mixture, and cannot rule out
  a potent adulterant present below the colour threshold. Verify: (a) a defensible testing order
  for an unknown (Marquis first is conventional — confirm against DanceSafe's own guidance);
  (b) that the site's existing reagent-chart data supports the cross-reference table this post
  would need, so it does not invent colours.
- **Rank rationale**: The only scenario where a multi-reagent set is the honest answer, and the
  only plausible home for four slugs currently linked three times each.


### 4. How many reagents do you actually need? (the honest downsell)

- **Queries**:
  - Primary: "how many reagents do I need" [INFERRED]
  - Secondary: "do I need all 9 reagents", "complete kit vs standard kit",
    "which dancesafe kit should I buy" [INFERRED]
  - Long-tail: "is the complete set worth it", "cheapest way to test mdma",
    "do I need mandelin if I have marquis" [INFERRED]
- **Intent**: purchase-intent
- **Honest product fit**: `/standard-kit` (currently linked **twice** in the entire repo — the
  most underused non-accessory slug), `/mdma-kit`, `/cocaine-kit`, `/marquis-kit`, `/simons-kit`,
  with `/kits` reserved for the unknown-substance case. The honest answer for a person who uses
  one or two substances is **two or three reagents, not nine.**
- **Repeat-purchase potential**: No, but see the rank rationale — under this bounty structure
  that matters far less than usual.
- **Cannibalisation check**: `which-test-kit.astro` is the closest thing and organises by
  substance ("pick by what you are testing"). `dancesafe-vs-bunk-police` compares brands, not
  kit sizes. `how-many-tests-per-reagent-kit` answers tests-per-bottle, a different objection.
  **Recommendation: this is probably better as an expansion of `which-test-kit.astro`** with a
  "how many do you actually need" section, rather than a new post — it sits inside that page's
  existing job, and the site has already been burned once by two pages chasing one query.
  Proposed as a new post only if the writer targets the explicit comparison phrasing
  ("complete set vs standard set") that the page does not currently use anywhere.
- **Evidence needed**: Exactly which six reagents are in the standard set versus which nine are
  in the complete set, from DanceSafe's current product pages — this changes and must not be
  written from memory. Also confirm the site-wide no-dollar-figures rule still applies
  (`how-many-tests-per-reagent-kit` was written under it), because this post is about relative
  value and has to make that argument without prices.
- **⚠️ HONESTY FLAG — this idea deliberately reduces basket size**: telling a reader they need
  three reagents instead of nine costs a normal percentage-commission affiliate a lot of money.
  **Under a flat ~$4 bounty it costs nothing at all**, and it removes the single biggest price
  objection at the purchase moment, which should raise the conversion *rate*. This is the
  clearest case in the file where the honest answer and the revenue-maximising answer coincide
  *only because* the bounty is flat. Recommend it without hesitation.
- **Rank rationale**: Converts the price objection into a purchase by shrinking the ask, at zero
  revenue cost under a flat bounty — the purest expression of this site's economics.

### 5. Do you need a milligram scale, and do the cheap ones actually work?

- **Queries**:
  - Primary: "do I need a milligram scale" [INFERRED]
  - Secondary: "are cheap milligram scales accurate", "0.001g scale accuracy",
    "how to calibrate a milligram scale" [INFERRED]
  - Long-tail: "how to weigh 100mg accurately", "scale says 0.00 for my dose",
    "why does my scale keep changing" [INFERRED]
- **Intent**: purchase-intent
- **Honest product fit**: `/mg-scale` and `/micro-scoop` (linked **twice** in the whole repo).
  The fit is honest and specific: the site already tells people MDMA dose should be weight-based
  (`mdma-dosing-guide` has a "Measuring the dose: scales and capsules" section), and that advice
  is unactionable without a scale that actually reads to 1 mg and holds calibration. A generic
  0.01 g jewellery scale cannot resolve the difference between an 80 mg and a 130 mg dose, which
  is exactly the range where the site's own dosing guidance operates. A micro-scoop is the
  companion because transferring sub-100 mg quantities onto a pan without one is where most of
  the error comes from.
- **Repeat-purchase potential**: No. One scale, one scoop, essentially forever. Calibration
  weights are a possible small repeat item but DanceSafe does not sell them separately.
- **Cannibalisation check**: `mdma-dosing-guide` §"Measuring the dose" is the nearest and is the
  main risk — but it answers *what dose*, and mentions measurement in passing. `ghb-dosing-guide`
  covers oral syringes for liquid, a different measurement problem entirely.
  `diy-ketamine-nasal-spray` covers dose maths for a solution. Nothing covers scale selection,
  scale accuracy, or the failure modes of cheap scales. Distinct, but the writer must link back
  to `mdma-dosing-guide` rather than restating dose numbers.
- **Evidence needed**: (a) the actual readability and repeatability spec of the scale behind
  `/mg-scale` (a "50 mg" model name appears in the redirect URL — **verify what that means before
  writing**, because if its readability is 1 mg but its true linearity is worse, the post has to
  say so); (b) the general point that consumer sub-gram scales drift with temperature, draughts
  and surface level needs a citable or at least demonstrable basis, not an assertion;
  (c) whether volumetric dosing should be presented as the honest alternative for substances too
  potent to weigh at all.
- **⚠️ HONESTY FLAG**: for genuinely potent substances (LSD, benzodiazepines, some 2C-x), the
  honest answer is **"no scale you can buy solves this — use volumetric dosing"**, which points
  away from `/mg-scale`. The post must say that, and it will cost some conversions. Recommend
  anyway: the alternative is implying a $30 scale can weigh a 1 mg dose, which it cannot.
- **Rank rationale**: The only realistic home for the two most-neglected slugs on the site, and
  it makes the site's own existing dosing advice actionable instead of theoretical.

### 6. What do you actually need to test drugs? The complete supply checklist

- **Queries**:
  - Primary: "what do I need to test drugs" [INFERRED; already logged as an open item in
    `blog-ideas.md`]
  - Secondary: "drug testing supplies", "what comes in a drug test kit",
    "do I need a spot plate" [INFERRED]
  - Long-tail: "can I use a plate instead of a spot plate", "what to test drugs on",
    "reagent testing surface" [INFERRED]
- **Intent**: purchase-intent
- **Honest product fit**: `/spot-plate`, `/pipette`, `/micro-scoop`, `/mg-scale`, plus whichever
  reagent kit matches the reader's substance. This is the idea `blog-ideas.md` already logged
  specifically to surface the accessory redirects.
- **Repeat-purchase potential**: No. Accessories are effectively permanent.
- **Cannibalisation check**: `harm-reduction-at-festivals` is a *rave packing list* and contains
  a "Test your substances before you go" section plus a "What this actually costs" section —
  that is the main overlap and it is a broad list, not a testing-supply list. `how-to-test-mdma`
  §"The reagents you need for MDMA testing" is substance-specific.
  `how-many-tests-per-reagent-kit` covers consumption, not equipment. Distinct enough, provided
  this post is scoped strictly to *drug-checking equipment* and does not drift into packing-list
  territory, which would collide with `harm-reduction-at-festivals` head-on.
- **Evidence needed**: What each DanceSafe kit actually ships with — if the kits already include
  a pipette or a testing surface, half this post's product argument evaporates and the post must
  say so. **Check the product pages before writing.** Also verify whether the spot plate is
  genuinely necessary or merely convenient.
- **⚠️ HONESTY FLAG**: the truthful answer to "do I need a spot plate?" is very likely **no —
  a white ceramic plate or the back of a white tile works**, and reagents will stain and can
  etch, so a dedicated plate is a convenience and a household-safety measure rather than a
  requirement. Saying that costs `/spot-plate` conversions. Say it anyway; the alternative is
  inventing a requirement, which is the exact behaviour the site's Amazon-kit post criticises in
  other sellers.
- **Rank rationale**: Already-approved backlog item, and the only planned post whose whole
  purpose is to give the four accessory slugs a destination — but its honest version sells less
  than its dishonest version, so rank it below the ideas that do not have that tension.

### 7. How to test tusi (pink cocaine) when you do not know what is in it

- **Queries**:
  - Primary: "how to test pink cocaine" / "how to test tusi" [INFERRED]
  - Secondary: "is my tusi real 2cb", "what reagent for tusi", "does tusi have ketamine in it" [INFERRED]
  - Related [GSC]: "2cb dancesafe" (pos 52), "nexus drug effects" (pos 89) — the site already
    gets impressions in this family and ranks badly.
- **Intent**: purchase-intent
- **Honest product fit**: `/kits` or `/standard-kit`, honestly, because tusi is a *mixture* and
  the whole point is that you do not know which drug you are testing for. Lab analyses
  consistently find ketamine + MDMA + caffeine and frequently no 2C-B at all, which means the
  reader needs Marquis (MDMA), Morris (ketamine), and ideally Mandelin/Mecke to see the rest.
  This is the second scenario after idea 3 where a panel is genuinely warranted, and it surfaces
  `/ketamine-kit`, `/marquis-kit`, `/mandelin-kit`, `/mecke-kit`.
- **Repeat-purchase potential**: No, beyond normal reagent replacement.
- **Cannibalisation check**: `2cb-vs-tusi-pink-cocaine` exists and already has a section called
  "Testing is the only way to know what you have". **That is a direct overlap and the deciding
  factor.** Recommendation: **do not write a second post — expand
  `2cb-vs-tusi-pink-cocaine`'s testing section into a full procedural walkthrough** with the
  reagent-by-reagent workflow and the product links. The existing post already ranks for the
  identity query; adding the procedure captures the transactional half of the same intent
  without splitting the cluster. Writing a separate post here is exactly the mistake the jaw-
  clenching cannibalisation already cost the site once.
- **Evidence needed**: Current composition data for tusi seizures — the existing post cites
  something for "What lab testing actually finds in tusi"; reuse that source rather than
  introducing a new one. Verify that a colour panel can in fact distinguish an MDMA+ketamine
  mixture in practice, because overlapping reactions in mixtures are a real limit and the post
  must not overpromise.
- **Rank rationale**: Real transactional demand and a strong multi-reagent case, but the honest
  execution is an expansion of an existing ranking post, not a new one — which lowers effort and
  raises expected value at the same time.
