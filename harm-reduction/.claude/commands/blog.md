Generate blog content for ravewellness.org — either new topic ideas or a full blog post.

**Usage:**
- `/blog ideas` — generate 10 new topic ideas and append them to `blog-ideas.md`
- `/blog write <topic or title>` — write a complete, publish-ready blog post on that topic

---

## If generating IDEAS (`/blog ideas`)

Read `blog-ideas.md` first to avoid duplicates. Then brainstorm 10 new topics focused on:

1. **High-volume harm reduction searches** — questions people actually type into Google when they want real information: "can I mix X and Y", "is X dangerous", "what does X feel like", "how to use X safely", "how long does X last"
2. **AI search result targets** — direct Q&A posts that answer a specific question in the first paragraph, optimized for Google's SGE/featured snippets and AI overviews
3. **Trending harm reduction topics** — new research, new drug trends, festival season queries

For each idea, output in this format (ready to paste into `blog-ideas.md`):
```
- [ ] **[Title]** — "[primary keyword]", "[secondary keyword]", "[long-tail query]" — [which site pages to link to], [affiliate opportunities if any]
```

After outputting the ideas, append them to the appropriate section of `blog-ideas.md`.

---

## If writing a BLOG POST (`/blog write <topic>`)

The argument (`$ARGUMENTS`) is the topic or title. Write a complete, publish-ready Markdown file.

### Step 1 — Research
Use the `/harm-research` skill to research the topic before writing. Pass the topic as the argument — it will apply the correct evidence hierarchy, flag methodological traps (heavy-user sampling bias, animal dose extrapolation, retracted studies), and return tiered citations with real PMIDs.

From the research output, extract:
- The 2–3 strongest citations (prefer RCTs and systematic reviews over case reports)
- The specific evidence tier for each claim you make in the post
- Any caveats or limitations that must be disclosed to be accurate
- The specific Rave Wellness pages that should be linked internally
- Any relevant DanceSafe product that's a natural affiliate fit

### Step 2 — Filename
Generate a URL-friendly slug from the title. The file goes in:
`src/content/blog/<slug>.md`

### Step 3 — Frontmatter
```yaml
---
title: "<Primary search query first; keep to 54 characters or fewer (see Title length rule)>"
description: "<155-char meta description — answers the question directly, includes primary keyword>"
date: <YYYY-MM-DD — use the exact date from the currentDate system context, never guess or use a past date>
tags: ["<tag1>", "<tag2>", "<tag3>"]
author: "Rave Wellness"
---
```

**Date rule:** Always read the `currentDate` value injected into the conversation context and use that exact date. Do not infer the date from git history, file timestamps, or training data. The date must be `YYYY-MM-DD` format (e.g. `2026-05-14`) — Astro parses this as UTC midnight, and the blog template renders it with `timeZone: 'UTC'` to avoid off-by-one display bugs in US timezones.

**Title length rule:** The blog template builds the page `<title>` as `<your frontmatter title> | Rave Wellness`, but it appends ` | Rave Wellness` (16 chars) **only when the result stays within 70 characters**; if your frontmatter title is longer than 54, the template drops the brand suffix automatically so the title never breaks Bing's 70-char limit. To **keep the brand in your title**, write a frontmatter `title` of **54 characters or fewer** (aim for 45–50), primary keyword first. Bing flags any `<title>` over 70; Google truncates the visible title around 60. Do **not** put an ampersand (`&`) in the title — write "and" instead (a stray `&amp;` in source double-encodes to a broken `&amp;` in the rendered title; "and" avoids the trap). After building, verify: `grep -o '<title>[^<]*</title>' dist/blog/<slug>.html` and count the characters.

**`lastmod` rule:** On a brand-new post, set only `date`. When you later make a substantive edit to an existing post (title/description/content), add or update `lastmod: <currentDate>` in the frontmatter so the BlogPosting `dateModified` reflects the change.

### Step 4 — Content structure

**Opening paragraph** (first 100 words are critical for SEO and AI snippets):
- Answer the core question directly and completely in the first paragraph
- State the key finding/bottom line up front — do not bury the lede
- Include the primary keyword naturally in the first sentence

**FAQ block** (place near the top, after the intro — targets AI search results):
Use a `## Quick answers` section with 3–5 bolded Q&A pairs covering the most common sub-questions. These get picked up by Google's "People also ask" and AI overviews.

```markdown
## Quick answers

**Is X safe to combine with Y?** Short direct answer in 1–2 sentences.

**What happens if you mix X and Y?** Short direct answer.

**What should you do if someone takes X and Y?** Short direct answer.
```

**Body sections** (H2 headings — each targeting a secondary keyword):
- Use evidence: cite specific studies inline as `[PMID XXXXXXXX](https://pubmed.ncbi.nlm.nih.gov/XXXXXXXX/)` or name the study/journal — **never write bare `PMID XXXXXXXX` text; it must always be a markdown hyperlink**
- Write for someone who has already decided to participate — not preachy, practical
- Be specific: doses, timings, mechanisms, not vague warnings
- Include at least one mechanism section explaining *why* the risk exists

**Internal links** — link to relevant site pages using relative paths:
- Drug guides: `/mdma.html`, `/ketamine.html`, `/lsd.html`, `/psilocybin.html`, `/cocaine.html`, `/ghb.html`, `/poppers.html`, `/2cb.html`, `/nitrous.html`
- Tools: `/interactions.html` (interaction checker), `/test-kits.html`
- Other: `/hearing.html`, `/faq.html`

Link anchor text should be descriptive: `our [GHB harm reduction guide](/ghb.html)` not `click here`.

**Affiliate links** — include where genuinely relevant:
- DanceSafe test kits: `https://dancesafe.org/product/complete-set-of-all-9-testing-kits/r/ravewellness/` — for any post about drug checking, adulterants, fentanyl
- DanceSafe general store: `https://dancesafe.org/r/ravewellness/` — for posts about harm reduction supplies
- Amazon (tag: `ravewellness01-20`) — for supplements (5-HTP, ALA, Mg), earplugs (Loop Experience), oral syringes (GHB dosing), naloxone
- Do NOT force affiliate links. Only include when the product directly serves harm reduction for the topic.

**Closing section**:
- Summarize the key takeaway in 1–2 sentences
- End with a natural internal link: "For a full breakdown of [substance] risks, see our [substance guide](/substance.html)."

### Step 5 — SEO checklist before outputting
- [ ] Primary keyword in title, first sentence, and at least one H2
- [ ] Frontmatter title is ≤54 characters (so the rendered `<title>` stays under 70 with the ` | Rave Wellness` suffix); primary keyword first; uses "and" not "&"
- [ ] Meta description is under 155 characters and answers the question
- [ ] At least 2 internal links to drug guide pages
- [ ] At least 2 citations with real PMIDs (verify they exist)
- [ ] All PMID citations are markdown hyperlinks — both inline in body text and in the sources footer. No bare `PMID XXXXXXXX` text anywhere in the file.
- [ ] FAQ block present
- [ ] No affiliate links that feel forced

### Style guide
- Tone: direct, non-judgmental, evidence-based. Assume the reader has already decided to use. They need information, not a lecture.
- Reading level: ~12th grade. Medical terms are fine but always define them.
- Length: 800–1400 words. Long enough to be comprehensive, short enough to stay focused.
- No fluff intros ("In today's world..."). Start immediately with the substance.
- Use **bold** for key facts, warnings, and takeaways.
- Use bullet lists for steps, protocols, and symptoms.

### Style prohibitions (enforced — do not use)
- **No em-dashes (—).** Use commas, colons, semicolons, or periods instead. In bullet items with a bolded term, use a colon: `**Term**: description`. This is the single most common AI tell.
- **No:** "delve", "navigate" (metaphorical), "leverage" (metaphorical), "comprehensive", "crucial", "it's worth noting", "in other words", "essentially", "ultimately" as a sentence opener, "moreover", "furthermore", "shed light on", "deep dive", "unpack", "landscape" (metaphorical).
- **No** passive throat-clearing: "It is important to note that...", "It should be mentioned that...", "It's worth emphasizing..."
- **No** AI-flavored transitions between sections. Just start the next section.

### Step 6 — Output
Write the file directly to `src/content/blog/<slug>.md` using the Write tool.

### Step 7 — Reciprocal backlinks & FAQ (do not skip)
A post is not "done" when the file is written. Every new post must be wired into the site both directions, for crawlers and for AI scraping:

1. **Post → core pages (outbound):** already handled by the internal links in Step 4 (at least 2 drug-guide links + related posts).
2. **Core drug page → post (the backlink):** add a card to the "From the Blog" grid on each relevant drug page (`src/pages/<drug>.astro`). Copy an existing `<a class="...card">` block in that page's `From the Blog` section, point it at `/blog/<slug>.html`, and write a category label + title + one-line blurb. Add the card to every drug page the post centrally concerns (e.g. a cocaine+MDMA post gets a card on both `cocaine.astro` and `mdma.astro`). If a drug page has no "From the Blog" section yet, create one (match the markup used on `ghb.astro`).
3. **FAQ entry (`src/pages/faq.astro`):** add a Q&A in BOTH places, kept in sync:
   - the JSON-LD `FAQPage.mainEntity` array (append a `{ "@type": "Question", "name": ..., "acceptedAnswer": { "@type": "Answer", "text": ... } }`), and
   - the visible HTML, as a `faq-item` in the matching category section, ending with a `Full guide: <a href="/blog/<slug>.html">…→</a>` link.
   - In the JSON-LD `text`, use plain-text PMIDs and no double quotes (the FAQ page convention differs from blog posts, which hyperlink PMIDs). **First check for an existing FAQ on the topic** — if one exists, just add the `Full guide` link to it rather than duplicating.
4. **Cross off in `blog-ideas.md`:** flip the idea's `[ ]` to `[x]` (or add it as `[x]` if it wasn't listed).

### Step 8 — Verify
Run `npm run build` (expect 0 errors), then confirm: the new post built, its rendered `<title>` is ≤70, there are no em-dashes, every PMID is a live hyperlink, the FAQ JSON-LD still parses, and the drug-page backlink cards resolve. Then report the filename to the user.
