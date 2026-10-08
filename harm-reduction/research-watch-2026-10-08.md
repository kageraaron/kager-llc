# Research Watch — 2026-10-08

Window: **2026-07-08 to 2026-10-08** (PubMed publication date). Run per `.claude/commands/research-watch.md` with the `harm-research` evidence hierarchy.

**Method.** 21 topic queries via NCBI E-utilities, with titles containing rat/mouse/zebrafish/in vitro excluded. That returned about 1,350 hits. 471 PMIDs currently cited on the site were regenerated from `src/` and excluded, which flagged 4 hits as already cited (42761401, 42481906, 42168692, 42392847). I screened about 1,050 titles and read about 70 abstracts in full. Every PMID below comes from a live E-utilities response in this run, and every key line is quoted from the abstract.

---

## ⚠️ Priority 1: contradicts a live claim

### [PMID 42476595] Relationships among nitrous oxide exposure, neurological injury and biomarkers
- **Journal / year**: Br J Clin Pharmacol, 2026
- **Design and sample**: Retrospective cohort. 81 people (100 presentations) hospitalised with N₂O toxicity at six Sydney hospitals, 2020–2025. Tier 2–3 (observational human).
- **Key line**: "B12 and holotranscobalamin showed high specificity (87% and 98%) but low sensitivity (22% and 5%) for detecting cases associated with SCD, while homocysteine and MMA showed high sensitivity (95% and 93%) but lower specificity (13% and 45%)."
- **Why it matters here**: `nitrous-oxide-b12-nerve-damage.md:58` says "**Active B12 (holotranscobalamin)** and methylmalonic acid are the sensitive markers." In this cohort holotranscobalamin was the *least* sensitive marker: it missed 95% of subacute combined degeneration cases. A reader who asks for "active B12" because of our post and gets a normal result is falsely reassured. Homocysteine and MMA are the right markers. `galaxy-gas-nitrous-tanks-nerve-damage.md` already says this correctly ("Ask for MMA and homocysteine by name"), so the two posts currently disagree.
- **Secondary**: `nitrous.astro:217` tells regular users to "Get a serum B12 test before regular nitrous use, **and periodically** if you use more than occasionally." A pre-use serum baseline is defensible. As a *monitoring* test, though, serum B12 had 22% sensitivity here. The periodic check should name homocysteine and MMA, which the same page already does at lines 339 and 367.
- **Also new from this paper**: "Higher cumulative N2O exposure was associated with worse neurological impairment … and correlated with greater neuropathy severity (Spearman's ⍴ = 0.43)". This is dose-response evidence for the "frequency and volume are the lever" claim (`nitrous-oxide-b12-nerve-damage.md:56`), which is currently case-series based.
- **Priority**: 1
- **Affected pages**: `src/content/blog/nitrous-oxide-b12-nerve-damage.md:58`, `src/pages/nitrous.astro:217`
- **Action**: Hand to `/fact-check`. Replace "holotranscobalamin" with "homocysteine" in the post, cite 42476595, and make the periodic-monitoring advice in `nitrous.astro` name homocysteine and MMA.

---

## Priority 2: fills a flagged gap

No new paper closes the two flagged gaps: the ketamine bladder-capacity mL threshold (already resolved Aug 15 via PMID 23996856) and the GBL onset window. The ketamine uropathy review below adds prevalence context but no capacity figure. GBL onset: nothing new.

---

## Priority 3: strengthens existing claims

### [PMID 41943478] The impact of antidepressant use on MDMA fatalities: a matched case-control study using a post-mortem database
- **Journal / year**: J Psychopharmacol, 2026
- **Design and sample**: Retrospective matched case-control, UK National Programme on Substance Use Mortality 1997–2023. 1,328 MDMA deaths vs 5,312 matched non-MDMA drug deaths.
- **Key line**: "antidepressant use was less likely in MDMA fatalities compared to other drug-related deaths (adjusted OR [aOR] 0.595 [95% CI 0.491-0.722]). In the prescribed analysis, there was no significant association between the prescription of antidepressants and MDMA fatalities (aOR 0.838 [95% CI 0.688-1.021])."
- **Why it matters here**: Directly supports `mdma-ssri-interaction.md`'s central claim that SSRIs blunt MDMA and are not the lethal combination (MAOIs are). Today that claim rests on 20 FAERS reports. This is a much larger dataset. **Caveat to state:** the control group is other drug deaths, not living users, and "antidepressants" lumps classes together, so this cannot speak to MAOIs.
- **Priority**: 3
- **Affected pages**: `src/content/blog/mdma-ssri-interaction.md` (serotonin syndrome section, line ~34)
- **Action**: Add as a supporting citation, with the control-group caveat.

### [PMID 42844883] Trends in fentanyl adulteration from RaDAR drug checking samples, Jan 2024 – Jun 2026
- **Journal / year**: Drug Test Anal, 2026
- **Design and sample**: NIST RaDAR drug-checking program, 4,563 qualitative and 1,224 quantitative results, 17 US states. Analytical chemistry.
- **Key line**: "paired concentration analysis suggests that the presence of IMF in stimulants such as cocaine and methamphetamine likely stems from low-level unintentional contamination rather than intentional mixing."
- **Why it matters here**: Mechanistic backing for `how-to-test-cocaine.md:24` ("contamination is uneven, a clean strip on one portion does not clear the whole bag") and `cocaine.astro:165`. Low-level cross-contamination is exactly the scenario where sampling location matters. It also documents medetomidine replacing xylazine, plus BTMPS and local anaesthetics (lidocaine, tetracaine, procaine), as current adulterants.
- **Priority**: 3
- **Affected pages**: `how-to-test-cocaine.md`, `cocaine.astro`, `levamisole-in-cocaine.md` (adulterant list)
- **Action**: Add a citation to the "uneven contamination" line.

### [PMID 42321998] Differentiating intentional ketamine use from unintentional exposure as an adulterant using oral fluid testing
- **Journal / year**: J Forensic Sci, 2026
- **Design and sample**: 1,819 adults surveyed and oral-fluid tested **entering nightclubs**. LC-QTOF-MS. This is the site's actual audience.
- **Key line**: "10.8% of participants reported past 24-h ketamine use, 23.7% tested positive for ketamine (≥ 1 ng/mL) … Among those testing positive for ketamine (n = 431), 41.5% reported past 24-h use."
- **Why it matters here**: More than half of ketamine-positive nightclub-goers did not report taking ketamine. The authors frame cocaine adulteration as the likely route, but self-report error and >24 h use are alternative explanations. The cocaine guides do not mention ketamine as a possible contaminant at all (`how-to-test-cocaine.md` contains no "ketamine"). **Caveat:** 1 ng/mL in oral fluid is a trace threshold, and the authors note that norketamine was the better predictor of real use.
- **Priority**: 3 (could support a priority-4 post)
- **Affected pages**: `how-to-test-cocaine.md`, `2cb-vs-tusi-pink-cocaine.md`
- **Action**: Consider one sentence on ketamine as a possible cocaine contaminant, with the threshold caveat.

### [PMID 42785038] Discordance between self-reported and detected synthetic opioids reveals cychlorphine emergence among people who inject drugs in Estonia
- **Journal / year**: Int J Drug Policy, 2026
- **Design and sample**: Cross-sectional bio-behavioural survey, 112 PWID in Kohtla-Järve, Estonia, with LC-Q-TOF-MS urine toxicology.
- **Key line**: "Self-reported use of synthetic opioid (fentanyl, nitazenes, 'heavy') was common (33.9%), whereas toxicological confirmation was rare. Half of these individuals had cychlorphine detected (50%) … cychlorphine was toxicologically detected in 22 cases (19.6%)."
- **Why it matters here**: First human-population prevalence data for cychlorphine. It directly supports `cychlorphine-dangers.md` (Sep 14), which currently rests on lab and forensic sources (it already cites 42481906). It also shows people believed they were taking fentanyl or nitazenes and were not. That is the core "you don't know what you have" argument, and it bears on the post's point that fentanyl strips miss non-fentanyl opioids. **Caveat:** small n, single Estonian city, PWID population.
- **Priority**: 3
- **Affected pages**: `src/content/blog/cychlorphine-dangers.md`, `nitazenes-dangers.md`
- **Action**: Add the citation. [PMID 41785913] (Addiction 2026, US nitazene detections from NFLIS: 43 in 2019 to 1,905 in 2024, but "did not increase statistically significantly from 2021 to 2024"; 98.3% of positive biospecimens were polysubstance) is the best current US trend source for `nitazenes-dangers.md`.

### [PMID 42701355] US drug overdose deaths involving stimulants without opioids continued to rise in 2024 · [PMID 42830002] Declines in stimulant-involved overdose mortality occurred only with fentanyl co-involvement, US 2023–2024
- **Journal / year**: Addict Behav Rep 2026; Drug Alcohol Depend 2026
- **Design**: CDC WONDER / national mortality analyses
- **Key lines**: "rates of DODs involving stimulants without opioids increased slightly (cocaine: +1.7%; methamphetamine: +2.4%) from 2023 to 2024" and "The decline in stimulant-involved overdose mortality was observed only among deaths with fentanyl co-involvement."
- **Why it matters here**: Counters any reader inference that falling overdose headlines mean cocaine got safer. Supports `cocaine-harm-reduction.md` and `cocaine-heart-attack.md`, where the cardiac risk is the cocaine itself.
- **Priority**: 3
- **Action**: Optional citation in `cocaine-harm-reduction.md`.

### [PMID 42334445] Cardiovascular effects in acute recreational drug toxicity ED presentations (Euro-DEN Plus)
- **Journal / year**: Clin Toxicol, 2026
- **Design and sample**: 59,571 ED presentations, European sentinel network, 2013–2021
- **Key line**: "Cocaine (OR 3.19, 95% CI 2.99-3.39) and 3,4 methylenedioxymethamphetamine (OR 1.18, 95% CI 1.13-1.23) showed the strongest associations with cardiovascular features … Cardiovascular features were associated with … mortality (OR 15.8, 95% CI 7.36-33.9)."
- **Priority**: 3
- **Affected pages**: `cocaine-heart-attack.md`, `cocaine-harm-reduction.md`
- **Action**: Strong, large-n citation for "chest pain on cocaine is an ER trip."

### [PMID 41920509] Clinical characteristics of emergency visits related to recreational psychedelic use
- **Journal / year**: Community Ment Health J, 2026
- **Design and sample**: Retrospective chart review, UC San Diego ED 2010–2023, n = 232 (LSD 35%, MDMA 30%, psilocybin 24%). Single site, small.
- **Key line**: "Factors associated with psychiatric hospitalization included concurrent cannabis use (OR = 10.9, 95% CI 3.37–39.64), history of bipolar disorder (OR = 12.67 …), and history of a primary psychotic disorder (OR = 17.10 …)."
- **Why it matters here**: `weed-and-psychedelics.md` says the evidence on adding cannabis is "limited and mixed." This is one more human data point that cannabis co-use marks the worse outcomes. **Caveats:** the confidence intervals are wide, it is an ED sample (selected for bad outcomes), and the association is not causal.
- **Priority**: 3
- **Affected pages**: `weed-and-psychedelics.md`
- **Action**: Add with caveats. Do not overstate it.

### [PMID 42215638] Psychedelic-induced hypomania and mania: a systematic review and meta-analysis
- **Journal / year**: Mol Psychiatry, 2026 (Oct issue)
- **Design**: SR of 23 studies, 4 meta-analysed
- **Key line**: "Rates of psychedelic-associated dysphoria/euphoria, hypomania or mania ranged from 5.8% in controlled trials … to 30% in naturalistic studies of individuals with bipolar disorder … Observational studies identified higher risks among individuals with bipolar I disorder, familial vulnerability, polysubstance use, and unsupervised or illegal use."
- **Priority**: 3. Best current source for any "who should not take psychedelics" bipolar caveat on `psilocybin.astro`, `lsd.astro` and `faq.astro`.
- **Action**: Cite wherever the site gives the bipolar contraindication.

### [PMID 42593636] Efficacy and safety of psychedelic microdosing in healthy adults: SR and meta-analysis
- **Journal / year**: CNS Drugs, 2026
- **Design**: 24 studies (3,681 participants). Only 2 parallel RCTs (n = 117) were meta-analysed.
- **Key line**: "Microdosing does not show consistent immediate benefits for depressive, anxiety, or stress symptoms in healthy adults … these effects were not significantly different from placebo."
- **Why it matters here**: Confirms `microdosing-psilocybin.md` ("no meaningful difference between real doses and placebo"). Note that the pooled RCT n is tiny.
- **Priority**: 3 (borderline 5)
- **Action**: Add as the current meta-analytic citation.

### [PMID 42682043] Ketamine uropathy: an update on pathophysiology, complications, and treatment options
- **Journal / year**: Can J Urol, 2026 (narrative review)
- **Key line**: "Over one quarter of ketamine users will have at least one bothersome urological symptom, with heavier and longer use leading to potentially irreversible damage."
- **Priority**: 3 (narrative review, so lower tier; trace the primary source before quoting the "one quarter" figure)
- **Affected pages**: `ketamine-bladder-damage.md`
- **Action**: Trace the primary source for the 25% figure before using it.

---

## Priority 4: candidate new posts

1. **"Poppers candles": second-hand alkyl nitrite exposure and vision loss.** [PMID 42756605] Cureus 2026, single case report, flagged because the harm is novel: "vision loss following second-hand inhalation of vapor from a 'poppers' candle … alkyl nitrite-infused candles in confined spaces may be potent enough to cause poppers maculopathy." Vision improved but "persistent ellipsoid zone disruption" remained at one year. The site has `isopropyl-poppers-eye-damage.md` but no mention of candles or second-hand exposure. This fits best as a section in the existing post rather than a new one. Pair it with [PMID 42497637] (Int J Drug Policy essay): "diminished propensity for overdose (via methemoglobinemia) observed in octyl and tert-butyl nitrite."

2. **"What is actually in a 'ketamine vape'?" Etomidate.** [PMID 42515169] Toxics 2026, 496 seized e-liquids, Eastern Taiwan: "Etomidate dominated detections (87.0% of positive cases), followed by isopropoxate (25.4%), ketamine (9.7%)." The site has `ketamine-vapes.md`, which **does not mention etomidate** (checked). The finding is regional (Taiwan), so frame it as an emerging signal, not a US fact.

3. **"Sold as 3-MMC / the cathinone you didn't order."** [PMID 42452938] Addiction 2026, Dutch DIMS drug checking, n = 3,437: "By 2024, only 10% of samples still contained 3-MMC … DMP and NEP were associated with more severe adverse reactions." Pair with [PMID 42728645] J Anal Toxicol 2026 (N-isopropylbutylone replacing DMP after its 2024 scheduling; 15 postmortem cases, all polydrug) and [PMID 42411193] Addiction 2026 (Dutch NPS poisonings up 19%/yr; 2C-B among the five most-reported). This is a good drug-checking post: scheduling drives substitution.

4. **"Why your mushroom trip in a clinic ≠ at a festival": Oregon regulated-psilocybin safety data.** [PMID 42616497] JAMA Netw Open 2026, n = 346 across 24 licensed centres: "Four individuals (1.2%, all psychedelic-naive) experienced adverse behavioral reactions requiring medical attention." Mean dose 31.9 mg psilocybin. This is useful as a supervised-setting benchmark against naturalistic data. Lower urgency.

5. **ETH-LAD / LSD analogs ("1D-LSD", "1cP-LSD").** [PMID 42568216] Br J Clin Pharmacol 2026, first analytically confirmed ETH-LAD case: "acute aggression, agitation, unconsciousness … persistent psychosis … 17 days of hospitalization." Single case report, novel harm. Fits a "lysergamide analogs aren't just legal LSD" section in `lsd.astro`. Also [PMID 42656086] documents a new prodrug, 1D-LSD.

6. **ZC-B (2C-B-AZET), a new 2C-series compound in seized capsules.** [PMID 42822460] Drug Test Anal 2026, analytical characterisation only, no human toxicity data. Monitor. If it shows up in drug-checking reports, add a line to `2cb.astro`. **Not a post yet.**

---

## Monitor (not yet actionable)

- **[PMID 42539197] "The 'dark magic mushroom' co-produces amatoxins and psilocybin."** **bioRxiv preprint, not peer-reviewed.** It reports *Galerina indica* producing both psilocybin and amatoxins. If it holds up, it weakens the ID table in `psilocybin-lookalikes-galerina.md:28`, which uses "Never blue" bruising as a Galerina marker: a psilocybin-producing Galerina could plausibly bruise blue. The post already says (line 41) that blue bruising is per-mushroom and that absence proves nothing, so the core advice survives. **Action:** re-check at the next run. If it is published, add "a blue bruise does not rule out every Galerina."
- **[PMID 42809289] JAMA Netw Open 2026, "Adverse Health Outcomes of Psilocybin, LSD, MDMA, Ibogaine, and 5-MeO-DMT."** Nationally representative US survey. **The E-utilities record has only a plain-language summary, no abstract**, so no figures can be quoted. Pull the full text (PMC13624878) next run. It is likely relevant to several drug pages.
- **[PMID 42332075] Structural basis of opioid receptor activation by PCP and ketamine** (Nat Struct Mol Biol 2026): "supporting that both ligands can directly bind and activate opioid receptors." This is a cryo-EM/in vitro structural result. Interesting for `is-ketamine-addictive.md`, but tier 7, so don't headline it.
- **[PMID 42767268] MDMA-related fatal poisoning in Australia, 2016–2025** (Addiction 2026, n = 217): "The fatal incident occurred in a private setting in 171 cases (78.8%), with 16 (7.4%) occurring at a music festival … Psychoactive drugs other than MDMA were detected in 199 cases (91.7%)." Useful context if the site ever implies MDMA deaths are mainly a festival phenomenon. I found no such claim this run.
- **[PMID 42710006] Las Vegas EDM festival wastewater, 2023–2025**: MDMA "approximately 10 to 30 times higher at off-site locations and nearly 100 times higher at the downstream WWTP during the festival"; "notable detections of norfentanyl" at the festival site. Supports opioid-awareness messaging at festivals. Good colour for `harm-reduction-at-festivals.md`.
- **[PMID 42663887] Hair analysis, Brazilian EDM festival attendees (n = 81)**: "The most prevalent substances were MDA (85.2%)". MDA outranked MDMA. That is regional, but it is relevant to `mda-and-ssris.md` and to the MDA/MDMA reagent distinction.
- **[PMID 42551105] State xylazine scheduling → more medetomidine** (Int J Drug Policy 2026, NFLIS): "xylazine scheduling was associated with a significant increase in medetomidine report rates." **Monetised-claim note:** xylazine test strips do not detect medetomidine. If any page implies a xylazine strip covers "tranq" generally, that is now a growing gap. Checked: neither `test-kits.astro` nor `which-test-kit.astro` mentions medetomidine. Consider one line saying xylazine strips do not detect it.
- **[PMID 41405371] Xylazine immunoassay strips in urine**: missed 63–74% of true positives because concentrations sat below the cut-offs. **This is a urine study, not powder drug checking, so it does not show our linked strips fail.** Don't over-apply it.
- **[PMID 42159737] Ethylbromazolam** replacing bromazolam since the Dec 2024 bromazolam scheduling, with similar GABA-A potency (in vitro). Relevant if the site covers benzo-contaminated pills.
- **[PMID 42713547] Severe serotonin syndrome after ayahuasca + OTC DXM** (case report, intubated). `dmt.astro:306` already lists DXM as a dangerous combo. This confirms it; no change needed.

---

## Priority 5 (incremental, not worth action)
- 42490582: no working-memory harm after a single MDMA or psilocybin dose (uncontrolled, n = 29 per arm)
- 42600962: SR showing MDMA cognitive impairments "transient … resolved within days"
- 42747747: no ketamine–ethanol PK interaction **in rats** (30 mg/kg). Does not affect the site's pharmacodynamic (CNS-depression) warning.
- 42717004: levamisole does not alter cocaine's dopamine effects (rats, in vitro); aminorex mostly undetected in humans. Checked: `levamisole-in-cocaine.md` makes no "boosts/enhances" claim, so nothing to change.
- 42600401: Italian cocaine seizures, mean purity rose from ~50% to ~75% (2015–2025). Regional.
- 42474763, 42067022, 42699751: nitrous adolescent myeloneuropathy SR, thrombosis review, and a low-normal B12 case. All consistent with the site, and they reinforce the P1 item above.
- 42438068 (NalPORS): peers administered naloxone at 83% of witnessed overdoses. 42139771: single-step nasal device beat improvised kits, 85% vs 20% first-try success.
- 42214911: FTS use declined over 12 months in rural PWID. Usage, not accuracy.

---

## Topics searched that returned nothing actionable
- **Hearing loss / tinnitus at music events**: 6 hits. Only a Malaysian questionnaire study (16.5% exceeded the NIOSH annual limit; 85% never used hearing protection at amplified events). Nothing that changes `hearing.astro` or the earplug posts.
- **MDMA harm reduction supplements** (5-HTP, magnesium, EGCG, antioxidants): 4 hits, none relevant.
- **ADHD stimulant + recreational drug interactions**: nothing new in humans.
- **HCV via shared straws / intranasal**: 1 irrelevant hit.
- **GHB/GBL**: one large community survey (42581015, n = 2,196: frequent users report more unconsciousness and overdose). No new PK or onset data, so the GBL onset gap stays open.
- **Festival heat / hyponatremia**: no new human studies. The "festival" query was swamped by false hits.
- **DMT / 5-MeO-DMT**: only clinical PK in IV/healthy volunteers. Not applicable to smoked or vaped use.

## Failed or degraded searches, retry next run
- **"festival" and "2cb_dmt" queries were noisy**: "festival" matched unrelated clinical studies, and "DMT" matched "disease-modifying therapy" in MS literature. Next run: use `"N,N-dimethyltryptamine"[tiab]` and `(festival*[tiab] AND (drug* OR MDMA)[tiab])`.
- **"poppers"** matched Ruddlesden-Popper perovskites. Next run: use `"alkyl nitrite*"[tiab] OR poppers[tiab] AND (inhal* OR recreational)`.
- **"LSD"** matched lumpy skin disease. Next run: use `"lysergic acid diethylamide"[tiab]`.
- **PMID 42225485**: esummary returned "Novel benzodiazepines in illicit drug use: sentinel ED data…" (Int J Drug Policy), but efetch for the same ID returned an unrelated radiotherapy paper. **Could not verify. Not reported.** Re-query by title next run.
- **PMID 42809289** (JAMA Netw Open): no abstract in PubMed. Full text needed.

---

## Applied — 2026-10-08

Every PMID below was re-verified via esummary after editing. Each edited post's `lastmod` is set to 2026-10-08.

| Finding | Applied to |
|---|---|
| P1 nitrous biomarkers (42476595) | `nitrous-oxide-b12-nerve-damage.md` (holoTC claim corrected, dose-response added), `nitrous.astro` (monitoring advice now names homocysteine and MMA; new research card), `galaxy-gas-nitrous-tanks-nerve-damage.md` |
| Antidepressants and MDMA deaths (41943478) | `mdma-ssri-interaction.md`, with control-group and MAOI caveats |
| RaDAR low-level contamination (42844883) | `how-to-test-cocaine.md`, `test-kits.astro` (medetomidine note) |
| Nightclub ketamine detection (42321998) | `how-to-test-cocaine.md`, with the 1 ng/mL threshold caveat |
| Euro-DEN cardiovascular (42334445) | `cocaine-harm-reduction.md`, `cocaine-heart-attack.md` |
| Stimulant-only deaths rising (42830002, 42701355) | `cocaine-harm-reduction.md` |
| Psychedelic ED visits and cannabis (41920509) | `weed-and-psychedelics.md`, with association-not-causation caveats |
| Microdosing meta-analysis (42593636) | `microdosing-psilocybin.md` |
| Psychedelic mania SR (42215638) | `microdosing-psilocybin.md`, `psilocybin.astro`, `lsd.astro` |
| Cychlorphine in Estonia (42785038) | `cychlorphine-dangers.md` |
| US nitazene detections (41785913) | `nitazenes-dangers.md` |
| Poppers candle (42756605) | `isopropyl-poppers-eye-damage.md` (section, not a new post) |
| Etomidate vapes (42515169) | `ketamine-vapes.md` (regional caveat) |
| Las Vegas festival wastewater (42710006) | `harm-reduction-at-festivals.md` |

**Not applied, still candidates:** a 3-MMC / cathinone-substitution post (42452938, 42728645, 42411193), the Oregon psilocybin services benchmark (42616497), an ETH-LAD / LSD-analog section (42568216), and the Galerina preprint (watching until it is peer-reviewed).
