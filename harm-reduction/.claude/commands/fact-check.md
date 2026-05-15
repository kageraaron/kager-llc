Audit existing site content for factual inaccuracies and correct them. Applies to blog posts (`src/content/blog/*.md`) and drug guide pages (`src/pages/*.astro`).

**Usage:**
- `/fact-check audit <file>` — audit a specific file (e.g. `mdma-neurotoxicity.md`, `mdma.astro`)
- `/fact-check audit all` — audit every blog post and drug guide page
- `/fact-check fix <file>` — fix all identified inaccuracies in a specific file

---

## Why this matters

Rave Wellness is maximum YMYL: people use this information to make decisions about drug use. An incorrect dose, a misattributed study, or an overstated supplement claim can cause real harm. The site's credibility depends on every clinical claim being accurate and appropriately caveated.

Common error types on harm reduction sites:
- Animal study data presented as human evidence
- PMID numbers that don't match the claim or don't exist
- Doses from research contexts applied to recreational settings without adjustment
- Supplement efficacy overstated (injectable animal protocols ≠ oral human doses)
- Retracted studies still cited as evidence (Ricaurte 2002 is the canonical example)
- Drug interaction severity understated or mechanism wrong
- Legal/scheduling information that has changed

---

## How to audit a file

### Step 1 — Read the file
Read the full file. For `.astro` pages, focus on the visible content text (ignore layout/component boilerplate). For `.md` blog posts, read everything.

### Step 2 — Extract all verifiable claims
Build a list of every specific claim that could be right or wrong:
- Dose recommendations (amounts, timing, routes)
- Pharmacological mechanisms (how a drug works)
- Drug interaction descriptions and severity
- PMID citations — record each one and the claim it supports
- Supplement recommendations and claimed effects
- Safety thresholds ("safe", "dangerous", "rare", "common")
- Legal/scheduling status
- Statistics ("X% of users report...", "risk increases by Y")
- Named studies — author, year, journal, what the study showed

### Step 3 — Verify with /harm-research
For each claim category, invoke the `/harm-research` skill to verify. Pass the specific claim and ask for:
- Confirmation the claim is accurate at the correct evidence tier
- Whether the PMID matches the claim (request the actual citation details)
- Whether newer studies supersede the cited evidence
- Whether any methodological caveats are missing

Focus `/harm-research` queries on:
- Any claim citing a specific PMID
- Any dose or timing recommendation
- Any supplement efficacy claim
- Any drug interaction mechanism or severity
- Any claim presented as human evidence that may be animal data

### Step 4 — Flag issues
For each inaccuracy found, record:

```
**[SEVERITY] Claim:** "<exact quote from file>"
**Issue:** what is wrong
**Correction:** what it should say
**Evidence:** source (PMID, study author/year, or institution)
**Line/section:** where in the file
```

Severity levels:
- **CRITICAL** — wrong information that could directly cause harm (wrong dose, missed contraindication, incorrect interaction severity)
- **HIGH** — materially misleading claim (animal data presented as human, overstated supplement efficacy, incorrect mechanism)
- **MEDIUM** — inaccurate but unlikely to cause direct harm (wrong PMID, wrong study details, outdated but not dangerous information)
- **LOW** — minor imprecision or missing caveat that should be added for accuracy

### Step 5 — Output the audit report
Format:

```
## Fact-check audit: <filename>
Audited: <date>

### Summary
- X claims reviewed
- X issues found (X critical, X high, X medium, X low)
- X claims verified accurate

### Issues

[list each issue in severity order]

### Verified accurate
[brief list of claims that checked out]
```

---

## How to fix a file (`/fact-check fix <file>`)

1. Run the audit (Steps 1–4 above) if not already done
2. For each CRITICAL and HIGH issue: make the minimal edit that corrects the claim. Do not rewrite surrounding copy — only change the specific inaccuracy.
3. For MEDIUM issues: fix PMID errors and incorrect study attributions. For outdated-but-harmless information, add a caveat rather than deleting.
4. For LOW issues: add a missing caveat inline or update imprecise language.
5. After fixing, re-read the corrected passages to verify the fix is accurate and the sentence still reads naturally.
6. Report: which issues were fixed, which were left (and why), and any issues that require the user to make a judgment call (e.g., removing a claim entirely vs. recaveatting it).

**Minimal edit principle:** Correct the specific error. Do not expand, rewrite, or improve surrounding content in the same pass — that conflates fact-checking with editing and makes changes harder to review.

---

## Known high-risk claims to check on every audit

These claim categories are frequently wrong on harm reduction sites. Prioritize checking them:

### MDMA
- **Supplement protocol efficacy:** NAC, ALA, ALCAR, Vitamin C — all key studies used IP injection in rodents, not oral dosing in humans. Claims should say "may reduce" or "animal evidence suggests," not "protects against neurotoxicity."
- **Neurotoxicity threshold:** The claim that neurotoxicity requires "heavy use" is based on heavy-user neuroimaging samples (median 50+ sessions, often 200+). Do not imply that occasional use is proven safe — absence of evidence is not evidence of safety.
- **Ricaurte 2002:** This study claiming dopaminergic neurotoxicity was retracted — the vials were methamphetamine. If cited, must be noted as retracted.
- **Serotonin syndrome:** Combination risk with SSRIs is real but severity is dose-dependent. "Never mix" is an overstatement; "high risk" is accurate.
- **Dose recommendations:** Recreational doses (75–125mg) are not FDA doses from MAPS trials (80–120mg with careful screening). Do not conflate.

### Ketamine
- **Bladder damage threshold:** Typically associated with frequent use (daily/near-daily for months). Not a risk from occasional use. Claims should specify frequency context.
- **K-hole:** Dissociative dose-dependent effect — describe mechanism (NMDA antagonism), not just phenomenology.
- **Addiction potential:** Low physiological dependence; psychological dependence is real and documented in heavy users.

### GHB/GBL
- **Lethal dose window:** GHB has a very narrow therapeutic window. The claim "just 1g more can be the difference" is approximately right but should cite the dose-response context.
- **GBL vs GHB:** GBL is a prodrug, converts to GHB. Onset is faster and dose is lower (by weight). Doses are NOT interchangeable — this is a CRITICAL harm reduction point.
- **Alcohol interaction:** Synergistic CNS depression is well-documented. Never describe this as "additive" — it's synergistic (worse than additive).

### Poppers / nitrous
- **Poppers + PDE5 inhibitors:** Combined use can cause severe hypotension and death. Mechanism: both cause vasodilation via different pathways (amyl nitrite → NO → cGMP; sildenafil → PDE5 inhibition → elevated cGMP). Check that mechanism is described correctly.
- **Nitrous + B12:** B12 deficiency risk is real with frequent use. Occasional use risk is low. Check that frequency context is specified.

### Cocaine
- **Cocaethylene:** Formed in the liver when alcohol and cocaine are co-ingested. Cardiac toxicity is documented — check that cardiac risk is not understated.
- **Levamisole contamination:** Extremely common adulterant (found in 70–80% of street cocaine samples in some jurisdictions). Check that this is mentioned in cocaine content.

### LSD / psilocybin
- **HPPD:** Hallucinogen persisting perception disorder — rare, not well-characterized, often resolves. Do not overstate prevalence.
- **"Non-toxic":** Psilocybin has very low direct physiological toxicity — this is accurate. But psychological risk (panic, psychosis in predisposed individuals) should not be omitted.

### Interactions checker / FAQ
- Verify each interaction rating against TripSit's combo chart and current literature
- "Caution" vs "dangerous" vs "low risk" ratings should match TripSit's evidence base

---

## Reference sources for verification

- **PubMed:** `https://pubmed.ncbi.nlm.nih.gov/<PMID>/` — verify every PMID by fetching the page and confirming title, authors, year match the claim
- **TripSit combo chart:** `https://tripsit.me/tripsit-factsheets/` — for interaction ratings
- **DanceSafe factsheets:** `https://dancesafe.org/drug-information/` — for community harm reduction consensus
- **Erowid technical vaults:** `https://www.erowid.org/chemicals/` — pharmacology summaries with citations
- **MAPS clinical data:** `https://maps.org/research/mdma/` — for MDMA-assisted therapy dosing and trial data

---

## Audit log

Keep a running record of audits performed. After each audit, append a line here:

| Date | File | Claims reviewed | Issues found | Fixed |
|---|---|---|---|---|
| 2026-05-15 | All 21 blog posts | ~200 claims | 8 (0 critical, 2 high, 4 medium, 2 low) | All 8 fixed |
