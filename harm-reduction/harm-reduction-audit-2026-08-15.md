# Harm Reduction Advice Audit — 2026-08-15

> **Second pass, same day:** every open item below was taken back to primary sources. Findings are now quoted from the papers rather than asserted. See "Sourcing pass" at the end for what was found, what was corrected, and the two claims that turned out to be unsupported and were removed rather than dressed up.

Run with `/harm-reduction-expert audit all`. Scope is whether **following the advice would keep someone safer**, not whether citations are real (`/fact-check`), whether disclosures are compliant (`/legal`), or whether trust signals are present (`/eeat`).

Method was deliberately cross-file. Most findings here are invisible when auditing a page in isolation, because the failure is that two pages disagree.

**Covered:** 92 blog posts, 20 `.astro` pages.

---

## Summary

| Severity | Found | Fixed now | Left open |
|---|---|---|---|
| **P0 dangerous** | 3 | 3 | 0 |
| **P1 misleading** | 2 | 1 | 1 |
| **P2 weak** | 3 | 0 | 3 |
| **Checked and sound** | 5 areas | — | — |

---

## P0 — dangerous, fixed immediately

### P0-1 · GHB redose interval contradicted itself in the dangerous direction
**File:** `src/pages/ghb.astro` (FAQ JSON-LD)

**Was:** "Start at 0.5–1ml for an unknown source. **Do not redose for at least 2 hours.**"

**Contradicted by, on the same page:** "3-4 hours — Earliest safe redose window, timed from the first dose, and only if effects have fully resolved."
**And by `ghb-dosing-guide.md`, three times:** "wait **3 to 4 hours**", with the pharmacological derivation (capacity-limited elimination, [PMID 8299669](https://pubmed.ncbi.nlm.nih.gov/8299669/)).

**Why this was P0.** GHB elimination is capacity-limited, so a second dose stacks onto residual drug and saturates the enzymes still clearing the first. Our own dosing guide describes the consequence: "the person goes from feeling fine to unconscious in 15-20 minutes." Premature redosing is the single most common GHB overdose mechanism, and the page was publishing the shortest interval of the four figures on the site. It was also in the **JSON-LD**, meaning it was the version most likely to be lifted into an AI answer.

**Fixed to:** "Do not redose for at least 3 to 4 hours, timed from the first dose, and only if effects have fully resolved."

### P0-2 · GHB starting dose permitted double the guide's figure
**File:** `src/pages/ghb.astro`

**Was:** "Start at **0.5–1ml** for an unknown source."
**`ghb-dosing-guide.md` says:** "start with no more than **0.5mL** of an unknown batch," and explicitly frames the 1mL rule as "a community-derived heuristic with no trial behind it" that is only reasonable "if you are confident in the source."

**Why this was P0.** For an unknown batch, the ceiling and the recommendation were the same number. GHB is sold as a liquid at highly variable concentration, so 1mL of an unknown source can be several times an intended dose.

**Fixed to:** "Start at 0.5mL for an unknown source."

### P0-3 · An answer about fatal overdose instructed readers to taste-test suspected NBOMe
**File:** `src/pages/faq.astro`, under "Can you fatally overdose on mushrooms or LSD?"

**Was:** "NBOMes cause a bitter taste and mouth numbness **when placed under the tongue**; genuine LSD is completely tasteless."

**Why this was P0.** This is failure mode 2 in its purest form: the test *is* the exposure. NBOMe compounds are lethal at recreational doses, which the same paragraph states. Placing a suspected NBOMe blotter under the tongue to evaluate it is the exact act the answer exists to prevent. Worse, it sat inside the fatal-overdose answer, so the reader most alarmed was the one most likely to act on it.

**Fixed to:** lead with the reagent result (NBOMes are not indoles, so no colour change on Ehrlich means it is not LSD), then acknowledge the taste pattern is real but explicitly say not to rely on it, because tasting it is the exposure.

**Note:** a second instance of this pattern was found and fixed earlier the same day in the "How do I test LSD?" FAQ, which promoted "if it's bitter, it's a spitter" with no caveat at all. Two independent instances suggests this framing may be a house habit worth watching for.

---

## P1 — misleading

### P1-1 · Ketamine bladder capacity stated four different ways, none cited — *fixed*
**Files:** `ketamine-bladder-damage.md` (two different figures in the same file), `is-ketamine-addictive.md`, `ketamine.astro`

Found: `<50 mL`, `<100 mL`, `10–30 mL`, `under 50ml`. "Normal" capacity was also given as both `300–500 mL` and `400–600 mL`.

Not directly dangerous, since this describes a consequence rather than instructing an action, but it is the "confident wrong number" failure: four precise-sounding figures, no source, and a reader cannot tell which is real.

I searched PubMed for a defensible figure. [PMID 33664402](https://pubmed.ncbi.nlm.nih.gov/33664402/) (Sci Rep 2021) confirms reduced capacity on video urodynamics in ketamine cystitis but gives no mL threshold in the abstract, so I did **not** manufacture a citation for a number it does not state.

**Harmonised to:** "under 100 mL in advanced cases, against a normal capacity of roughly 400 to 600 mL," and dropped the unsourced `10–30 mL` precision.

**Handoff:** the mL threshold still needs a real source. That belongs to `/fact-check`, not this skill.

### P1-2 · GBL onset and potency figures not audited — *open*
`ghb.astro` gives GBL onset as 15–30 minutes and a separate 3–4 hour redose window. GBL converts to GHB in vivo and is more potent by volume, so *different* figures from GHB are correct in principle. I did not verify the specific numbers or confirm the GBL:GHB volume ratio is stated consistently across pages. Flagged as previously open on the punch list and still open.

---

## P2 — weak delivery

### P2-1 · "The 1mL Rule" is the title of a post that recommends 0.5mL
`ghb-dosing-guide.md` is titled "How to Dose GHB Safely: The 1mL Rule and Why Redosing Kills," and the body argues 1mL is a community heuristic with no trial behind it and that 0.5mL is the right starting point for an unknown batch. The body is correct; the title promotes the number the body walks back. A reader who skims, or an AI that quotes the title, gets the less safe figure.

**Recommendation:** retitle so the headline number is the recommended one, and keep the 1mL discussion in the body as the thing being corrected.

### P2-2 · `drug-checking-services-festivals.md` carries uncited statistics
Previously flagged, still open. Seven statistics with no source. Belongs to `/fact-check` but noted here because unsourced behavioural-change statistics are what the "do services actually change what people do" advice rests on.

### P2-3 · Hippie flip timing stated inconsistently
`faq.astro` gives mushrooms-then-MDMA at "60 to 90 minutes" in one answer and "60–90 minutes" in another with slightly different peak-alignment reasoning. Low risk, but the same combination should have one stated protocol.

---

## Checked and found sound

Recorded so a later audit does not re-litigate these.

1. **Fentanyl test strip line direction.** 27 separate statements across 10 files. **All correct** (one line = positive, two = negative), including the counterintuitive framing being called out explicitly as the part people get backwards. This is the site's highest-stakes counterintuitive instruction and it is consistent everywhere.
2. **MDMA half-life.** Uniformly 7 to 8 hours across 12 files. The previously documented 7-8 vs 8-9 split is resolved.
3. **Supplement stack doses.** 5-HTP, EGCG and magnesium are consistent across all files. Apparent outliers (600mg, 1200mg, 1000mg) resolved to adjacent NAC and vitamin C values inside stack lists, not contradictions. The previously documented `mdma.astro` errors (3× 5-HTP dose, 1200mg EGCG over the EFSA 800mg threshold) are fixed and stayed fixed.
4. **Product links in emergency content.** Twelve instances flagged by proximity, all reviewed, **all appropriate**: every one is a prevention product (fentanyl or xylazine strips, testing kits) in a passage about preventing the emergency, not a purchase prompt placed ahead of emergency instructions. The `/store` link on `lsd.astro` near NBOMe fatalities points to a DanceSafe *educational* article, not a product.
5. **GHB redose after fixes.** Both remaining statements on `ghb.astro` now read 3 to 4 hours, one for GHB and one for GBL, consistent with `ghb-dosing-guide.md`.

---

## Recommendations

**Structural, in priority order:**

1. **Add a cross-file consistency check to the release routine.** Every P0 and P1 here was a contradiction between pages, not an error on any single page. Reading a page in isolation cannot find them. A grep-and-diff over key figures (doses, intervals, half-lives, capacities) catches this class cheaply.
2. **Treat JSON-LD as the highest-stakes copy on the site.** P0-1 was live in both the visible page and the JSON-LD, but the JSON-LD version is what gets lifted into AI answers, where it arrives with no surrounding context and no chance for the reader to notice the page contradicts itself two sections later. Any figure in structured data should be verified against the page body.
3. **Watch the folk-test pattern specifically.** Two independent instances of the taste-test-for-NBOMe framing were found today. When a folk test is mentioned, it needs both halves: does it work, and what does running it cost you.
4. **Re-verify vendor facts on a schedule, not on suspicion.** The MDMA kit contents claim was wrong for months and was propagated into nine places, including two written the same day it was corrected. Product bundles change silently. Check the live product page.
5. **Where a number cannot be sourced, hedge rather than pick.** The bladder capacity figures were four different confident numbers. Harmonising to a hedged range is more honest than selecting whichever sounds most authoritative.

**Not recommended:**

- Do not remove dose figures to reduce risk. Removing dosing guidance sends readers to worse sources. Label the evidence tier instead.

---

# Sourcing pass — 2026-08-15 (same day)

Every open item above was taken back to primary literature via NCBI E-utilities. Abstracts were read in full; nothing here is cited from memory.

## Sources found, with the quoted line each claim now rests on

### GHB redose interval (backs P0-1)
**Palatini et al. 1993, *Eur J Clin Pharmacol*, [PMID 8299669](https://pubmed.ncbi.nlm.nih.gov/8299669/)** — 8 healthy male volunteers, oral doses of 12.5, 25 and 50 mg/kg.

> "The AUC increased disproportionately with the dose and so the apparent oral clearance decreased significantly as the dose was increased, whereas the terminal half-life and mean residence time increased. These findings suggest that both the oral absorption and the elimination of GHB are **capacity-limited processes**."

This is the mechanism, stated directly. A second dose taken while the first is still clearing does not add linearly, it saturates.

**Felmlee, Morse & Morris 2021, *AAPS J*, [PMID 33417072](https://pubmed.ncbi.nlm.nih.gov/33417072/)** — pharmacology review.

> "Due to the **steep concentration-effect curve** for GHB, overdoses occur commonly and symptoms include sedation, respiratory depression, coma, and death."
> "The pharmacokinetics of GHB are complex and include **nonlinear absorption, metabolism, tissue uptake, and renal elimination** processes."

**Applied to:** `ghb.astro` now carries both citations and an explicit paragraph explaining *why* the interval is long, rather than asserting a number. The previously unsourced "steep dose-response curve" sentence is now quoted and attributed.

### Ketamine bladder capacity (resolves P1-1, which I had left open)
**Chung, Wang & Kuo 2014, *Neurourol Urodyn*, [PMID 23996856](https://pubmed.ncbi.nlm.nih.gov/23996856/)** — 14 patients with refractory ketamine cystitis undergoing augmentation enterocystoplasty.

> "CBC increased from **50.9 ± 15.7** to 309.2 ± 58.0 ml (P < 0.0001)"

That baseline of **50.9 mL mean cystometric capacity** is the real number, and it replaces four unsourced figures (`<50`, `<100`, `10–30 mL`, `under 50ml`).

**The caveat is now stated in the text, because it changes what the number means.** These are people referred for bladder reconstruction after at least a year of failed conservative treatment. It is the worst end of the spectrum, not a typical user. Presenting 50.9 mL without that framing would be the heavy-user sampling trap.

**Supporting context:** **Chu et al. 2008, *BJU Int*, [PMID 18680495](https://pubmed.ncbi.nlm.nih.gov/18680495/)**, the foundational series of 59 street-ketamine users in Hong Kong: 71% showed cystoscopic epithelial inflammation, urodynamic abnormality was found in all 47 studied, 51% had hydronephrosis, and 7% showed papillary necrosis.

### Fentanyl test strip accuracy (corrects a real omission)
**Green et al. 2020, *Int J Drug Policy*, [PMID 31951925](https://pubmed.ncbi.nlm.nih.gov/31951925/)** — three devices tested against street-acquired samples.

> "The lowest limit of detection (0.100 mcg/mL), **false negative (3.7%)**, and **false positive rate (9.6%)** was found for fentanyl test strips, which also correctly detected two fentanyl analogs (acetyl fentanyl and furanyl fentanyl) alone or in the presence of another drug, in both powder and pill forms."

**What was wrong:** the site said "FTS: ~97% sensitive" and **never mentioned false positives at all**. Roughly one positive in ten in that study was not fentanyl. Omitting that is not a small thing: a reader who discards a sample on a positive deserves to know the result is not certain, and a site that only publishes the flattering half of a validation study is doing product marketing.

**Also worth noting:** these strips *did* correctly detect acetyl fentanyl and furanyl fentanyl, which is a useful counterweight to blanket "strips miss analogs" claims.

## Claims that could NOT be sourced, and were removed rather than softened

### "5× the odds of modifying drug use behavior" — I was wrong about this one

**My first pass called this unsupported. It is fully supported.** My scan for uncited statistics filtered out any line containing "PMID", and the body of the article cited this correctly all along. Only the Quick Answers restated the figure without its source, which is what my grep surfaced.

**Peiper et al. 2019, *Int J Drug Policy*, [PMID 30292493](https://pubmed.ncbi.nlm.nih.gov/30292493/)** — 125 people who inject drugs, Greensboro NC:

> "In multivariable models adjusting for demographic and FTS correlates, PWID with a positive FTS test result had **five times the odds of reporting changes in drug use behavior** compared to those with a negative result."

Also from the same paper: 63% tested positive, 43% reported a behaviour change, 77% reported increased perceived overdose safety, and people who tested *after* consuming were 70% less likely to change behaviour subsequently, which is a good argument for testing before use.

**What actually needed fixing** was narrower than I claimed: the Quick Answer restated a sourced figure without the citation and without the population caveat. It now carries both, plus the corroborating Krieger 2018 finding ([PMID 30344005](https://pubmed.ncbi.nlm.nih.gov/30344005/)).

**The caveat that does stand:** both studies enrolled people who inject drugs, not festival attendees. The effect is real and large; it was measured in a different population than this article advises. That is now stated in the text.

**Lesson for the skill:** an audit that filters lines by "does it contain PMID" will mark a correctly-cited claim as uncited whenever the citation sits in a different sentence than the number. Check the surrounding paragraph, not the line.

### "Fentanyl detected in 25% of non-heroin samples" and "BCCDC: 15–20% of stimulant samples"
Neither traced to a verifiable primary source. Both removed. The replacement text explains *why* no single percentage is quoted: contamination rates vary enormously by region, year, and collecting service, and a national-sounding figure misrepresents that variance. The practical advice does not depend on the exact rate.

## Other corrections in this pass

- **GBL onset was contradictory**: "5–15 minutes" on `faq.astro` and `ghb-vs-gbl.md` versus "15–30 minutes" twice on `ghb.astro`. No controlled human PK study gives a definitive window. Harmonised to "commonly 5 to 20 minutes, varies with stomach contents and between people," with the variability itself named as the hazard, since **a first dose that feels slow is the most common reason people redose early**.
- **`ghb-dosing-guide.md` retitled** from "The 1mL Rule and Why Redosing Kills" to "**Start at 0.5mL**, and Why Redosing Kills" (resolves P2-1). The old title promoted the number the body spends the article walking back, and titles are what get quoted.
- **Hippie flip timing (P2-3) was a false alarm.** All instances say 60–90 minutes; only en-dash versus "to" formatting differs. No contradiction. Withdrawn.

## Revised status

| Item | Status |
|---|---|
| P0-1 GHB redose | Fixed and now sourced to PMID 8299669 + 33417072 |
| P0-2 GHB starting dose | Fixed |
| P0-3 NBOMe taste test | Fixed |
| P1-1 Ketamine bladder capacity | **Now sourced** to PMID 23996856, with sampling caveat |
| P1-2 GBL onset/potency | **Now harmonised**; onset window has no primary source, stated as such |
| P2-1 1mL rule title | **Fixed** |
| P2-2 Uncited statistics | **3 sourced, 2 removed as untraceable, 1 was a false alarm (see correction)** |
| P2-3 Hippie flip timing | **Withdrawn, not a real finding** |

## The pattern worth keeping

Two of the six flagged statistics did not survive contact with the literature: the "25% of non-heroin samples" and "BCCDC 15-20%" figures, both regional numbers quoted without a year or a traceable source. Both were removed.

One flagged statistic turned out to be **correctly sourced already**, and my detection method was what was broken. That is worth more attention than the two real findings, because a false positive in an audit costs credibility in both directions: it wastes a fix, and if acted on carelessly it would have deleted a well-evidenced claim.

**A number that cannot be traced should be removed, not softened.** Softening preserves the authority of a figure while hiding that nobody can check it.
