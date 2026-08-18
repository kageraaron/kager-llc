Scan for new peer-reviewed research relevant to ravewellness.org, and report what actually changes what we publish.

**Usage:**
- `/research-watch` — scan the last 3 months across all site topics
- `/research-watch <months>` — scan a different window, e.g. `/research-watch 6`
- `/research-watch <topic>` — scan one topic, e.g. `/research-watch ketamine bladder`
- `/research-watch contradictions` — only look for findings that conflict with what the site currently says

---

## The point of this skill

Not "here are some new papers." The output that matters is **"here is a paper that contradicts something we currently publish."** A finding that changes existing content outranks a finding that could become a new post, because the first one is a correctness problem and the second is an opportunity.

Rank everything you find in this order:

1. **Contradicts a live claim on the site.** Highest priority, always. This is a correctness issue and should be handed to `/fact-check` or `/harm-reduction-expert` immediately.
2. **Fills a gap we have explicitly flagged as unsourced.** Check `harm-reduction-audit-*.md` and `research-monetizable-faqs.md` for open "evidence needed" items. We have real ones outstanding, for example the ketamine bladder capacity threshold and the GBL onset window.
3. **Strengthens a claim currently resting on weak evidence**, for example replacing a community-practice figure with a trial-derived one.
4. **Supports a new post** on a topic we do not cover.
5. **Incremental confirmation of something we already cite well.** Lowest value. Usually not worth reporting.

---

## Before you search: know what we already have

**Read `pmid-index.md` first.** It is a generated, gitignored index of every PMID the site cites, with title, year, journal and which pages use it. Do not report a paper we already cite as though it were new. If a search returns something in that index, note it as already-used and move on.

Also skim, for open questions:
- `harm-reduction-audit-2026-08-15.md` — the "what still needs doing" and "evidence needed" items
- `research-monetizable-faqs.md` — each idea has an "Evidence needed" line
- `blog-ideas.md` — open `[ ]` items

---

## Topics to cover

The site's substance coverage: **MDMA, cocaine, ketamine, LSD, psilocybin, GHB and GBL, nitrous oxide, poppers and alkyl nitrites, 2C-B, DMT and 5-MeO-DMT, fentanyl and xylazine and nitazenes, ADHD stimulant medications.**

Cross-cutting themes: **drug checking and reagent testing, fentanyl test strip accuracy, hearing loss and tinnitus in music settings, serotonin syndrome, drug interactions with SSRIs and MAOIs, harm reduction supplements, overdose response and naloxone, hyperthermia and hyponatremia at events, emerging adulterants.**

---

## How to search

Use NCBI E-utilities. PubMed HTML is behind a cookie wall that blocks fetching; E-utilities works.

Date-filtered search:
```
https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=<query>&datetype=pdat&mindate=YYYY/MM/DD&maxdate=YYYY/MM/DD&retmax=40&retmode=json
```

Then batch-fetch metadata (POST, up to ~180 ids per request):
```
POST https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi
  db=pubmed  id=<comma-separated>  retmode=json
```

And read the abstract before believing a title:
```
https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=<PMID>&rettype=abstract&retmode=text
```

**Sleep about 1 second between requests.** Hammering E-utilities returns empty results that look like "no new research" when they are actually rate limiting. If a search returns nothing, retry once before concluding the topic is quiet.

**Get today's date from the environment context.** Do not guess the current date when building a date range.

---

## Quality filter: what is worth reporting

**Report:**
- Systematic reviews and meta-analyses
- Randomised controlled trials in humans
- Large observational or cohort studies
- Case series that document a genuinely new harm or a new adulterant
- Analytical chemistry work relevant to drug checking
- Anything that contradicts a live site claim, at any evidence level, because we need to know

**Do not report, or report only with an explicit caveat:**
- **Animal studies**, unless the site currently cites animal work for the same claim, or the finding is a genuinely new mechanism. Rodent dose extrapolation has burned this project before.
- **Cell-line and in-vitro work**, almost never actionable for harm reduction advice
- **Single case reports**, unless the harm itself is novel
- **Preprints and non-peer-reviewed sources**
- **Very small n** without saying the n out loud
- Papers whose abstract does not actually support the headline claim. Read the abstract, not just the title.

---

## Verification rules, non-negotiable

- **Never report a PMID from memory.** Every one must come from a live E-utilities response in this run.
- **Read the abstract before summarising a finding.** Titles overstate. This project has shipped multiple citations whose abstract did not support the claim attached to it, including one where the paper explicitly said the opposite.
- **Quote the sentence you are relying on.** A finding without a quotable line is not yet verified.
- **State the sample and the population.** "Five times the odds" means something different in 125 people who inject drugs than in festival attendees, and the site has made exactly that mistake before.
- If a paper is paywalled beyond the abstract, say so and limit the claim to what the abstract supports.

---

## Output

Write to `research-watch-<YYYY-MM-DD>.md` in the repo root. **Write incrementally**, appending each finding as you verify it, because agents in this project regularly die to session limits and computer sleep. Never hold findings in memory to write at the end.

For each finding:

```
### [PMID <n>] <Title>
- **Journal / year**: 
- **Design and sample**: (n, population, RCT vs observational vs review)
- **Key line**: "<verbatim quote from the abstract>"
- **Why it matters here**: 
- **Priority**: 1 contradicts live claim | 2 fills flagged gap | 3 strengthens weak claim | 4 new post | 5 incremental
- **Affected pages**: (specific files, if priority 1-3)
- **Action**: (e.g. hand to /fact-check, update <file>, write new post, monitor)
```

End with:
- A priority-1 section at the top, restated, so contradictions are impossible to miss
- A list of topics searched that returned **nothing** new, since a quiet topic is a real result and stops the next run re-searching it
- Any search that failed or rate-limited, so it can be retried

---

## Standing constraints

- Do not modify any site content. This skill reports; `/fact-check` and `/harm-reduction-expert` fix.
- Do not add findings to `blog-ideas.md` directly. Propose them in the report and let the user decide.
- If a new finding would make a currently monetised claim weaker, or would mean a product we link does not work, **say so plainly and prominently**. That is exactly the finding most likely to be quietly dropped, and the one most worth surfacing.
