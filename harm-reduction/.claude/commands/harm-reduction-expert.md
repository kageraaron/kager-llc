Audit the *advice* on ravewellness.org the way an experienced harm reduction practitioner would: not whether a citation is real, but whether following the guidance would actually keep someone safer.

**Usage:**
- `/harm-reduction-expert audit <file>` — audit one file (e.g. `mdma.astro`, `ghb-dosing-guide.md`)
- `/harm-reduction-expert audit all` — sweep every blog post and drug guide page
- `/harm-reduction-expert audit monetisation` — audit only for commercial distortion of advice
- `/harm-reduction-expert audit emergency` — audit only overdose/emergency guidance
- `/harm-reduction-expert fix <finding>` — implement a specific fix

---

## How this differs from the other audit skills

Do not duplicate these. If a finding belongs to one of them, note it and move on.

| Skill | Owns |
|---|---|
| `/fact-check` | Is the claim true? Does the PMID support it? |
| `/legal` | Disclaimers, FTC disclosure, privacy, liability |
| `/eeat` | Authorship, trust signals, YMYL credibility |
| **this skill** | **Would following this advice actually reduce harm?** |

The distinction matters. A claim can be perfectly cited and still be bad advice, because it is incomplete, because it buries the action item, because it is contradicted on another page, or because a product link bent it.

---

## First principles this audits against

1. **The reader has already decided to use.** Advice that assumes otherwise is not harm reduction, it is abstinence messaging wearing a lab coat. "Don't do it" is not an answer to "how much should I take."
2. **The most dangerous thing is a confident wrong number.** Vagueness is safer than false precision. If we do not know, say so.
3. **Advice must be actionable at 2am by someone impaired, in the dark, possibly frightened.** Bury the action item in paragraph six and it does not exist.
4. **Never recommend a product as a solution to a problem it does not solve.** This is the single highest-risk failure mode on a monetised harm reduction site.
5. **Emergency guidance outranks everything**, including our own commercial interest and our own prior advice.
6. **Consistency is a safety property.** Two pages giving different redose intervals is worse than either one alone, because the reader cannot tell which to act on.

---

## Known failure modes, with real examples from this site

These are the patterns to hunt for. Every one of these was found live on ravewellness.org, so treat them as likely rather than hypothetical.

### 1. Commercial pressure bending the advice
The highest-value check on this site. Look for:
- **A product recommended for something it does not fix.** The tinnitus post nearly linked supplements while reporting they do not work for existing ringing. The rule that survived: *do not link any supplement you have just reported as ineffective.*
- **Advice built on a stale vendor fact.** The site told readers for months that the DanceSafe MDMA kit contained no fentanyl strips and they must buy strips separately. The kit ships with one. The advice was not dangerous, but it was wrong and it favoured a purchase.
- **Unsubstantiated merchant claims used to drive conversions.** "Proceeds fund free drug checking" appeared in 14 places and could not be verified on DanceSafe's own site. Nonprofit status and running free drug checking are both verifiable; the causal link between store revenue and programmes is not.
- **A purchase prompt inside an emergency answer.** Overdose response, naloxone, 911, sudden hearing loss, and serotonin syndrome answers must carry no product link ahead of the advice.
- **Topics that should carry no monetisation at all.** GHB and drink spiking is the standing example: drink-spiking test strips have poor accuracy for GHB and promoting them is actively harmful.

**Test to apply:** if the affiliate link were removed, would the advice still read the same way? If not, the advice is compromised.

### 2. Folk tests promoted without the caveat that using them is the exposure
The FAQ recommended "if it's bitter, it's a spitter" for NBOMe with no warning. The pattern is real, but putting a suspected NBOMe blotter in your mouth *is* the exposure being avoided. Any folk test needs: does it work, and what does running it cost you?

### 3. Counterintuitive instructions stated once, or stated backwards
Fentanyl test strips: **one line is positive, two lines is negative.** This is backwards from every other test strip people have used. It must be explicit every time strips are described, not assumed.

### 4. Internal contradictions across pages
Found live: GHB redose interval stated four different ways (90 min, >2h, 2-3h, 3-4h); cocaethylene half-life given as ~5 hours in five places when it is 1.68h; MDMA half-life as both 7-8 and 8-9 hours; `mdma.astro` recommending three times the 5-HTP dose of every blog post and 1200 mg/day EGCG, over EFSA's 800 mg liver-injury threshold.

**Method:** grep the same figure across all files and diff. Do not audit one page in isolation.

### 5. Dose figures without a visible evidence tier
Every dose must be traceable to one of four tiers, stated in the text: **clinical trial** (name it, cite the PMID), **pharmacology** (show the derivation), **harm reduction consensus** (say "the range cited across harm reduction organisations"), **community practice** (say "no controlled trial has tested this"). Never present a tier-3 or tier-4 number in the register of a tier-1 one.

### 6. Risk framing out of proportion to actual risk
Both directions are failures. Overstating a low risk trains readers to discount the site. Understating a high one is obvious. Check especially: fentanyl-in-everything messaging, "holes in your brain", casual-contact fentanyl exposure, and any claim that a single use causes permanent damage.

### 7. Missing the thing that actually changes the outcome
Ask of every guide: what is the one action that most changes whether this person is harmed, and is it in the first screen? Examples that pass: the treatment clock for sudden hearing loss is measured in days; a positive fentanyl strip is a reason not to use, not to use less; asymmetric ear symptoms past 48 hours need same-week evaluation.

### 8. Advice that assumes equipment, money, or foresight the reader does not have
"Test it at home first" is useless at the venue. Good guidance includes the fallback for someone who did not prepare, and says plainly when there is no safe fallback.

---

## Audit procedure

1. **Read the whole file.** Advice quality is a property of the whole page, not of individual sentences.
2. **Extract every actionable instruction** (doses, timings, thresholds, "do this if X"). List them.
3. **For each instruction, ask:**
   - Is it correct and current?
   - Is it findable by someone impaired and in a hurry?
   - Does it contradict another page? (grep the figure site-wide)
   - Is its evidence tier visible?
   - Would it change if the affiliate link were removed?
4. **Check emergency paths specifically.** Every guide should make it obvious when to stop managing and call for help.
5. **Check the monetisation layer separately**, using the test in failure mode 1.
6. **Verify vendor facts against the live product page** before repeating them. Product contents change. Use WebFetch on the actual product URL. Do not trust a memory file or a prior guard: one was wrong for months.

---

## Severity tiers for findings

- **P0, dangerous:** following this advice could cause serious harm. Wrong dose, wrong emergency response, a product recommended for something it does not do, an interaction not flagged. Fix immediately, before anything else.
- **P1, misleading:** not directly dangerous but likely to produce a bad decision. Stale vendor facts, missing evidence tier, contradiction between pages, folk test without caveat.
- **P2, weak:** correct but poorly delivered. Action item buried, no fallback for the unprepared reader, risk framing out of proportion.
- **P3, polish:** phrasing, structure, consistency of terminology.

---

## Output format

For each finding:

```
[P0-P3] <file>:<line or section>
Current: <quote the actual text>
Problem: <what would go wrong for a real reader>
Fix: <the specific replacement>
Tier/source: <if a dose or clinical claim>
```

End with a summary table by severity, and an explicit list of **anything checked and found sound**, so a later audit does not re-litigate it.

---

## Standing constraints for any fix

- Never remove a dose figure to be safe. Removing dosing guidance sends people to worse sources. Label the tier instead.
- Never add a product link to an emergency answer.
- Never link a product you have just reported as ineffective.
- Prefer DanceSafe over Amazon where DanceSafe sells the equivalent, but never at the cost of accuracy. If a cheaper or different product is genuinely the right tool, say so.
- No prices anywhere. They go stale.
- If a correction changes a factual guard used elsewhere, grep for that guard site-wide and fix every instance in the same pass.
