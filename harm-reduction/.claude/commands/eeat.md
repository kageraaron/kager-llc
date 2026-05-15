Audit and improve E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) and YMYL (Your Money or Your Life) signals for ravewellness.org.

**Usage:**
- `/eeat audit` — run a full E-E-A-T audit and output a prioritized punch list with current status
- `/eeat fix <item>` — implement a specific fix
- `/eeat about` — scaffold the About + editorial policy page (requires user to fill in personal/org details)

---

## Why this matters for this site

Ravewellness.org is **maximum YMYL**: drug safety content where incorrect information can cause death. Google's Quality Rater Guidelines require the highest E-E-A-T bar for health and safety content. The site competes for the same queries as government health agencies, academic institutions, and established harm reduction nonprofits — all of which have stronger institutional authority signals. Every E-E-A-T signal we add closes that gap.

---

## Current audit status (last run: 2026-05-15)

### Trustworthiness
| Signal | Status | Notes |
|---|---|---|
| "Not medical advice" disclaimer on every page | ✅ | Hero section + sitewide footer |
| Affiliate link disclosure | ⚠️ | Footer only; should be inline on pages with affiliate links |
| PMID citations linked to PubMed | ✅ | Strong — all clinical claims cite source |
| Evidence tiers disclosed ("animal data", "community consensus") | ✅ | Blog posts flag this explicitly |
| Privacy policy page | ✅ | Created 2026-05-15 at `/privacy.html` |
| Contact information | ❌ | No contact page or email visible to users |
| About page | ❌ | `/about.html` does not exist — highest priority gap |
| Editorial/sourcing policy | ❌ | No public policy page; exists only in internal skills |

### Expertise
| Signal | Status | Notes |
|---|---|---|
| Named human author with credentials | ❌ | All content attributed to "Rave Wellness" org, no person named |
| Author bio / credentials displayed | ❌ | No author page or bio section |
| "Medically reviewed by" byline | ❌ | Not present on any page |
| Primary source citations visible | ✅ | PubMed PMIDs inline throughout |
| Methodology explained to readers | ❌ | Evidence tiers explained per-post but no dedicated policy page |

### Authoritativeness
| Signal | Status | Notes |
|---|---|---|
| `Organization` schema with `@id` | ✅ | Present on homepage |
| `knowsAbout` on Organization schema | ✅ | Implemented — lists 10 topical expertise areas |
| `publishingPrinciples` on schema | ✅ | Points to `/about.html#editorial-policy` (page needs to be created) |
| `sameAs` links to own social/web profiles | ❌ | Removed incorrect DanceSafe/MAPS sameAs — needs real social profile URLs |
| Links to/from DanceSafe, MAPS, academic sources | ✅ | Multiple outbound links to authoritative orgs |
| Last reviewed / updated date on content | ❌ | Only `datePublished` shown; no `lastmod` or "last reviewed" label |

### Experience
| Signal | Status | Notes |
|---|---|---|
| First-person experience language | ⚠️ | Content is authoritative but clinical; no lived-experience voice |
| Community perspective acknowledged | ✅ | Content written for the community, non-judgmental framing |

---

## Priority fixes

### 1. About page + editorial policy (CRITICAL)
Google Quality Raters are instructed to look for "who is responsible for this content" as their first step when evaluating YMYL sites. An anonymous org with no About page is a major negative signal.

**What to build at `/about.html`:**
- Who runs Rave Wellness (even a pseudonymous but consistent identity helps)
- Mission statement and harm reduction philosophy
- Editorial methodology section (`#editorial-policy`):
  - How claims are sourced (PubMed, peer-reviewed journals)
  - Evidence hierarchy (RCTs > cohort studies > case reports > animal data > community consensus)
  - How posts are written and reviewed
  - Affiliate disclosure policy
- Links to partner organizations (DanceSafe, MAPS, TripSit, Fireside Project)

To scaffold this page: `/eeat about`

### 2. Named author attribution (HIGH)
For YMYL health content, Google strongly prefers a named human expert. Options:
- Add a named author with a harm reduction / pharmacology background
- Create an `/about.html#author` anchor and link author bylines to it
- In blog post schema, change `author` from `Organization` to `Person` with `name`, `url`, and optionally `sameAs` (LinkedIn, etc.)

In `src/pages/blog/[...slug].astro`, update the BlogPosting schema:
```json
"author": {
  "@type": "Person",
  "name": "<Author Name>",
  "url": "https://www.ravewellness.org/about.html#author"
}
```

### 3. Privacy policy (DONE)
Created 2026-05-15 at `/privacy.html`. Covers GA4, cookies, affiliate relationships, no-sale statement, contact email. Linked in the sitewide footer.

### 4. Inline affiliate disclosure (MEDIUM)
Footer disclaimer is not sufficient per FTC guidelines and Google's quality rater training. Add a visible inline note near affiliate links:

```html
<p class="affiliate-note"><em>Some links on this page are affiliate links. We earn a small commission at no cost to you — all recommendations are based on harm reduction value.</em></p>
```

Pages affected: `mdma.html`, `test-kits.html`, any blog post with DanceSafe or Amazon links.

### 5. `sameAs` social profiles (MEDIUM)
Once social profiles exist, add them to the Organization schema on `index.astro`:
```json
"sameAs": [
  "https://www.instagram.com/ravewellness",
  "https://twitter.com/ravewellness",
  "https://www.reddit.com/r/ravewellness"
]
```

### 6. "Last reviewed" dates (MEDIUM)
Add a `lastmod` field to blog frontmatter Zod schema (already noted in SEO skill). Display it:
```astro
{post.data.lastmod && (
  <p>Last reviewed: {post.data.lastmod.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })}</p>
)}
```
For YMYL content, showing that information is actively maintained is a meaningful trust signal.

### 7. Contact information (LOWER)
Add a contact email (even a generic hello@ravewellness.org) to the About page and/or footer. Google Quality Raters flag sites with no way to reach the publisher.

---

## How to scaffold the About page

Run `/eeat about` to generate a skeleton `src/pages/about.astro` with:
- Frontmatter and BaseLayout wiring
- Placeholder sections for: mission, team/author, editorial policy, methodology, affiliate policy, partner organizations
- Correct schema: `AboutPage` + `Person` (if named author) + updated `Organization` with `publishingPrinciples`

The user must fill in: real names, credentials, and personal details before publishing.

---

## Schema: what's in place and what's missing

**Currently in `index.astro`:**
```json
Organization: name, url, description, publishingPrinciples, knowsAbout ✅
WebSite: name, url, publisher ✅
ItemList: drug guides ✅
```

**Currently in `[...slug].astro`:**
```json
BlogPosting: headline, description, datePublished, dateModified, url, image, author (Org), publisher, mainEntityOfPage ✅
BreadcrumbList ✅
```

**Still missing:**
- `Organization.sameAs` (needs real social profile URLs)
- `Organization.foundingDate`
- `Organization.contactPoint` or `contactPage`
- `Person` schema for named author
- `MedicalWebPage` schema on drug guide pages (optional but strong signal for health content)

### MedicalWebPage schema (optional, high signal)
For drug guide pages (`mdma.astro`, `ketamine.astro`, etc.), adding `MedicalWebPage` alongside existing schema would be a strong YMYL signal:
```json
{
  "@type": "MedicalWebPage",
  "name": "MDMA Harm Reduction Guide",
  "url": "https://www.ravewellness.org/mdma.html",
  "medicalAudience": { "@type": "MedicalAudience", "audienceType": "Patient" },
  "about": { "@type": "Drug", "name": "MDMA" }
}
```

---

## Content-level E-E-A-T checklist (per blog post)

When writing or reviewing a post, verify:
- [ ] Opening paragraph directly answers the primary question (featured snippet / AI Overview signal)
- [ ] At least 2 inline PMID citations for clinical claims
- [ ] Evidence tier disclosed for each claim (human RCT vs. animal data vs. community consensus)
- [ ] Methodology limitations flagged where relevant (e.g., heavy-user sampling bias)
- [ ] "This is not medical advice" framing present (the blog template does not currently inject this — add a disclaimer block to `[...slug].astro`)
- [ ] Affiliate links disclosed inline on the page (not just footer)
- [ ] Author byline visible (currently shows "Rave Wellness" — will improve once named author is added)

---

## Monitoring

After implementing fixes:
- Submit to Google Search Console and monitor "Page Indexing" for manual action flags
- Watch for "Unnatural links" or "Thin content" manual actions (none expected, but monitor)
- Google's algorithms take 3–6 months to fully re-evaluate E-E-A-T signals after changes
- Track ranking position for YMYL queries in Search Console Performance tab
