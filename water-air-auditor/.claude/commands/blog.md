Generate blog content for waterairaudit.com — either new topic ideas or a full blog post.

**Usage:**
- `/blog ideas` — generate 10 new topic ideas and append them to `blog-ideas.md`
- `/blog write <topic or title>` — write a complete, publish-ready blog post on that topic

---

## If generating IDEAS (`/blog ideas`)

Read `blog-ideas.md` first to avoid duplicates. Then brainstorm 10 new topics focused on:

1. **High-volume environmental health searches** — questions people actually type: "is [city] water safe", "PFAS in [state] water", "best water filter for [contaminant]", "how to reduce PM2.5 indoors", "is well water safe"
2. **AI search snippet targets** — direct Q&A posts that answer a specific question in the first paragraph, optimized for Google's SGE/featured snippets: "What is PFAS?", "Does reverse osmosis remove fluoride?", "What causes high PM2.5?"
3. **Local SEO posts** — city or state-specific articles: "PFAS levels in North Carolina", "Flint Michigan water quality today", "Bakersfield air quality guide"
4. **Product comparisons** — high-intent buying queries: "AquaTru vs iSpring", "Berkey vs Clearly Filtered", "best HEPA for wildfire smoke"

For each idea, output in this format (ready to paste into `blog-ideas.md`):
```
- [ ] **[Title]** — "[primary keyword]", "[secondary keyword]", "[long-tail query]" — [which internal pages to link to], [affiliate opportunities if any]
```

After outputting the ideas, append them to the appropriate section of `blog-ideas.md`.

---

## If writing a BLOG POST (`/blog write <topic>`)

The argument (`$ARGUMENTS`) is the topic or title. Write a complete, publish-ready Markdown file.

### Step 1 — Research the topic

Before writing, think through:
- What does the peer-reviewed or agency literature say? Use EPA, USGS, WHO, and PubMed-indexed sources.
- What's the primary search intent? (Informational, comparison, local, product)
- What specific facts will make this article more reliable than generic content?
- What are the limitations or caveats that must be disclosed for accuracy?
- Which internal pages should this link to?
- What affiliate products are genuinely relevant (not forced)?

Cite specific studies when making health claims. Use real PMIDs when referencing epidemiological research.

### Step 2 — Filename

Generate a URL-friendly slug from the title. The file goes in:
`src/content/blog/<slug>.md`

### Step 3 — Frontmatter

```yaml
---
title: "<Full title — include the primary search query naturally>"
description: "<155-char meta description — answers the question directly, includes primary keyword>"
date: <today's date as YYYY-MM-DD>
tags: ["<tag1>", "<tag2>", "<tag3>"]
author: "WaterAirAudit"
---
```

### Step 4 — Content structure

**Opening paragraph** (first 100 words are critical for SEO):
- Answer the core question directly and completely in the first paragraph
- State the key finding up front — do not bury the lede
- Include the primary keyword naturally in the first sentence

**Quick answers block** (place near the top — targets AI search results and People Also Ask):
```markdown
## Quick answers

**Is [X] safe?** Short direct answer in 1–2 sentences.

**What does [X] do to health?** Short direct answer.

**How do I remove [X] from water?** Short direct answer.
```

**Body sections** (H2 headings — each targeting a secondary keyword):
- Cite specific studies: link to PubMed as `[PMID XXXXXXXX](https://pubmed.ncbi.nlm.nih.gov/XXXXXXXX/)` or name the source
- Be specific: concentrations, standards, mechanisms — not vague statements
- Include at least one section explaining *why* the risk exists mechanistically
- Where data exists, include it in numbers (e.g., "45% of U.S. public water systems")

**Internal links** — link to relevant site pages:
- Home / ZIP audit: `/`
- Blog index: `/blog.html`
- State pages: `/water-quality/[state-name-with-hyphens].html`
  - e.g., `/water-quality/north-carolina.html`, `/water-quality/michigan.html`

Link anchor text should be descriptive: "check [your state]'s PFAS levels" not "click here"

**Affiliate links** — include where genuinely relevant:
- AquaTru RO: `https://www.amazon.com/s?k=AquaTru+countertop+reverse+osmosis&tag=ekager05-20`
- Berkey + PF-2: `https://www.amazon.com/s?k=Big+Berkey+water+filter+PF-2&tag=ekager05-20`
- Clearly Filtered: `https://www.amazon.com/s?k=Clearly+Filtered+water+pitcher&tag=ekager05-20`
- Blueair 211i Max: `https://www.amazon.com/s?k=Blueair+Blue+Pure+211i+Max&tag=ekager05-20`
- Coway Airmega 400S: `https://www.amazon.com/s?k=Coway+Airmega+400S&tag=ekager05-20`
- IQAir HealthPro: `https://www.amazon.com/s?k=IQAir+HealthPro+Plus&tag=ekager05-20`
- Tap Score water test: `https://www.amazon.com/s?k=Tap+Score+Advanced+City+Water+Test&tag=ekager05-20`
- Airthings View Plus: `https://www.amazon.com/s?k=Airthings+View+Plus+PM2.5+monitor&tag=ekager05-20`
- Do NOT force affiliate links. Only include when the product directly addresses the article's topic.

**Closing section:**
- Summarize the key takeaway in 1–2 sentences
- End with a natural internal link to the ZIP audit tool or a relevant state page

### Step 5 — SEO checklist before outputting

- [ ] Primary keyword in title, first sentence, and at least one H2
- [ ] Meta description is under 155 characters and answers the question
- [ ] At least 2 internal links
- [ ] At least 1 citation with a real source (PubMed PMID, EPA document, or credible agency)
- [ ] Quick answers block present
- [ ] No affiliate links that feel forced
- [ ] Factual claims are accurate and caveated appropriately

### Style guide

- Tone: direct, non-alarmist, evidence-based. The reader is an adult who wants real information.
- Reading level: ~12th grade. Technical terms are fine but always define them.
- Length: 800–1400 words. Long enough to be comprehensive, short enough to stay focused.
- No filler intros ("In today's world..."). Start immediately with the topic.
- Use **bold** for key facts, standards, and takeaways.
- Use bullet lists for steps, comparisons, and symptoms.
- Use tables for comparisons (filter types, contaminant levels, etc.) — Markdown tables render in the blog.

### Step 6 — Output

Write the file directly to `src/content/blog/<slug>.md` using the Write tool.
Then confirm the filename and remind the user to run `npm run build` to preview.
