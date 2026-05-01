# Branding, SEO & Monetization Playbook

A living strategy document for turning the color-picker repo into a sustainable, ad-funded utility site. Pair this with `CLAUDE.md` (engineering rules) and `GEMINI.md` (project context) — those describe *how* to build; this describes *what to build, what to call it, and how it makes money*.

---

## 1. Project diagnosis (April 2026 baseline)

The current app is a single-page React 19 + Vite client that lets a visitor upload an image, watches a mandatory 10-second ad roll, then click pixels to read HEX/RGB values and auto-detects the five most common colors via a canvas median pass. There are top and bottom banner slots, a magnifier, and a clipboard-copy color grid. There is no routing, no server, no analytics, no consent layer, and no SEO surface — `index.html` ships with `<title>color-picker</title>` and no description, OG tags, or structured data. The only rankable URL is `/`. Everything below is built around that gap: the product is technically sound, but the business is one page wide.

---

## 2. Brand identity

### 2.1 Naming strategy

A good name for this category does three things at once: signals function (color picker / image color tool), is short enough to type and link, and contains at least one searched keyword so the brand itself rides organic intent. Pure invented names (Pantonely, Chromata) are brandable but force you to spend on awareness. Exact-match names (ImageColorPicker.com) rank instantly but feel commodity and are crowded with competitors. The recommendation is a hybrid: a brandable root with an embedded keyword.

### 2.2 Existing brainstorm (preserved from prior draft)

This is the 20-candidate list already in this file's history. It's a useful starting pool — the recommendation below picks from it and adds a few new options.

| # | Brand Name | Potential Domain | Pros | Cons |
|---|---|---|---|---|
| 1 | ColorExtract | colorextract.io | High keyword relevance | Competitive for SEO |
| 2 | ImagePalette | imagepalette.pro | Very descriptive | Longer URL |
| 3 | HexGrabber | hexgrabber.com | Catchy, action-oriented | Less professional |
| 4 | ColorFindr | colorfindr.app | Modern tech feel | Requires explanation |
| 5 | PalettePix | palettepix.com | Short, memorable | Less intuitive |
| 6 | ChromaPick | chromapick.com | Professional sounding | "Chroma" is niche |
| 7 | InstaPalette | instapalette.io | Suggests speed | Potential trademark |
| 8 | ColorVision | colorvision.tools | Authority feel | Generic |
| 9 | PixelPalette | pixelpalette.net | SEO strong keywords | .net TLD lower value |
| 10 | HueHelper | huehelper.com | Alliteration, friendly | "Hue" is slightly niche |
| 11 | ColorSnap | colorsnap.app | Strong imagery | TM blocked — Sherwin-Williams |
| 12 | ScanColor | scancolor.me | Concise action | .me TLD varies |
| 13 | PaletteEngine | paletteengine.com | Suggests powerful tool | Corporate sounding |
| 14 | ColorLogic | colorlogic.app | Trustworthy | Somewhat abstract |
| 15 | QuickChroma | quickchroma.com | Highlights speed | Niche phrasing |
| 16 | TheColorTool | thecolortool.com | Very clear intent | Boring, long |
| 17 | SmartPalette | smartpalette.io | Modern, clever | Generic |
| 18 | ColorScanPro | colorscanpro.com | SEO dense | Sounds "salesy" |
| 19 | PaletteMate | palettemate.com | Approachable | "Mate" can be colloquial |
| 20 | ImageHue | imagehue.com | Two-keyword combo | Slightly confusing |

### 2.3 Refined shortlist

After filtering for trademark conflicts, syllable count, and brandability, these are the candidates worth a serious USPTO TESS check before purchase. Best-first:

| Name | Vibe | Why it works | Risk |
|---|---|---|---|
| **Hexly** | Modern, brandable, dev-friendly | Short, .com class brandable, "hex" cue | Already a small SaaS — verify TM |
| **PalettePix** | Memorable, designer-friendly | Two strong keywords, alliterative | Worth checking `.com` |
| **ChromaPick** | Authoritative | "Chroma" = color authority + clear action | Three syllables, slight typing cost |
| **Pixpick** | Playful, sticky | Alliterative, describes the action | Slightly toy-feeling for B2B |
| **Hueform** | Designer-leaning | Reads as "hue + form" | Less obvious to laypeople |
| **PaletteLab** | Authoritative, expandable | Implies a lab — supports product line growth | Three syllables |

**Top pick: Hexly** for a brandable consumer site, **PalettePix** as a more search-friendly alternative, **PaletteLab** if you want room to expand into related design tools.

### 2.4 Tagline candidates

Pick a tagline that contains a search keyword and a benefit. Order is best-first.

- *"Pick any color from any image — instantly."* (clear, keyword-rich, benefit)
- *"The instant image color picker."* (category claim)
- *"From photo to palette in one click."* (designer angle)
- *"HEX, RGB, HSL — straight from the pixel."* (technical angle)

### 2.5 Visual identity notes

The current `index.css` already establishes a purple accent (`#aa3bff`) and a warm neutral palette with dark-mode support. That's a workable starting point — purple is uncommon among color-tool competitors (most lean rainbow or blue) and gives the brand visual differentiation. Keep the accent, formalize a small palette (one accent, one neutral text, one surface, one success green for the "Copied!" toast), and commission or generate a wordmark + favicon featuring an eyedropper or a stylized pixel grid. Avoid rainbow gradients in branding — they're the cliché in this category.

---

## 3. Domain strategy

### 3.1 Recommended approach

Buy two domains: a **brand domain** (your "real" home) and a **keyword domain** (organic catcher that 301-redirects to the brand). The keyword domain costs $10–$30/year and acts as a permanent ad against competitors who paid more for it. Avoid `.io` and `.app` for an ad-supported consumer utility — `.com` is still meaningfully better for trust signals and direct-type traffic, which matters when your monetization is impressions.

### 3.2 Brand domain candidates (.com priority)

These are intent-aligned with the names above. Availability changes daily — check on a registrar before assuming any are open.

- hexly.com / hexly.app / gethexly.com
- palettepix.com / palettepix.io
- chromapick.com / chromapick.io
- pixpick.com / pixpick.io
- hueform.com / hueform.app
- palettelab.com / palettelab.app

### 3.3 Keyword (EMD) domain candidates

These are crowded, but if any open ones are reasonably priced they're worth grabbing as redirects. The ranking floor for these is usually decent because the URL itself contains the query.

- imagecolorpicker.com
- pickcolorfromimage.com
- colorfromphoto.com
- hexfromimage.com
- imagepalette.com / palettefromimage.com
- photocolorfinder.com
- whatcolorisit.com (long-tail goldmine if available)

### 3.4 Localized expansion (Phase 3+)

Once the .com is performing, register country TLDs for the top three traffic sources from analytics — typically `.co.uk`, `.de`, `.com.br`, `.in`. Each can host a translated subset of the content library and re-monetize the same product in higher-CPM Tier 1 markets.

---

## 4. SEO roadmap

The product is a tool, but the **traffic engine has to be content**, because tool pages alone don't accumulate enough internal links or topical authority to outrank entrenched competitors (image-color-picker.com, imagecolorpicker.com, html-color-codes.info, coolors.co). The plan below treats the homepage as the conversion endpoint and builds a content moat around it.

### 4.1 Phase 1 — Technical foundation (Week 1–2)

The current `index.html` ships none of the basics. Before any content work, add:

A descriptive `<title>` (under 60 chars) and `<meta name="description">` (under 155 chars) on every route. Add Open Graph and Twitter Card tags so links unfurl with a preview image — that doubles social CTR. Generate a `robots.txt` and a `sitemap.xml` at build time. Add canonical tags to every page. Inject `application/ld+json` structured data: `SoftwareApplication` for the tool itself, `BreadcrumbList` on all interior pages, `FAQPage` on any page with a Q&A section, and `ImageObject` for example output. Verify the property in Google Search Console and Bing Webmaster Tools the day the site goes live.

Core Web Vitals matter directly for ranking and indirectly for ad revenue (CLS-friendly ad slots = AdSense quality score). The 10-second ad roll on upload is fine as long as it never displays before LCP — defer ad-network scripts until after the first interaction or after the `load` event. Reserve fixed dimensions on every ad slot with explicit `min-height` so the layout doesn't jump when ads load. Lazy-load anything below the fold.

### 4.2 Phase 2 — Programmatic SEO (Week 3–8)

This is where most of the traffic will eventually come from. The unique advantage of a color tool is that the *product itself generates content* — every color, palette, or image type is a long-tail query. Build templated routes that fill out a long tail nobody is hand-writing for:

- `/colors/[hex]` — one page per popular HEX, with name, RGB/HSL/CMYK conversions, complementary/analogous/triadic palettes, "where this color is used" examples, and accessibility contrast pairings. Pre-render the top 5,000 named/common colors at build time.
- `/palettes/[slug]` — curated palettes (e.g. `/palettes/sunset-beach`, `/palettes/wes-anderson`) that double as Pinterest fodder. Pinterest is a top-five referrer for color-niche sites.
- `/convert/[from]-to-[to]` — `/convert/hex-to-rgb`, `/convert/rgb-to-hsl`, etc. These are stable high-volume queries.
- `/from/[image-type]` — landing pages like `/from/logo`, `/from/screenshot`, `/from/photo`, each with the picker plus type-specific copy.
- `/learn/[topic]` — long-form articles: "How to extract a brand color from a logo", "Reading hex codes", "When to use HSL vs RGB", "Designing for color-blind users".

Programmatic pages have to feel *handmade* to avoid the thin-content penalty. Each templated page should have at least 300 unique words, an embedded usable tool, internal links to related pages, and one image.

### 4.3 Phase 3 — Authority (Month 3+)

Backlinks. Submit to design tool roundups (Toolify, There's An AI For That, Product Hunt). Pitch guest posts to design blogs (CSS-Tricks alumni network, Smashing Magazine, Designer News). Build a small free API (rate-limited) — developers will link to it from GitHub READMEs, which are high-DA links. Sponsor or contribute to a popular open-source design-token library and get a footer link.

### 4.4 Primary keyword targets

Tier 1 (homepage, high competition, high volume): *image color picker, color picker from image, pick color from image, hex color from photo*. Tier 2 (programmatic pages, mid competition): *[hex code] color, complementary color of [color], rgb to hex converter*. Tier 3 (long-tail, low competition, easy wins): *what color is in this picture, find color from screenshot, extract palette from logo*. Track 100+ tracked keywords in Ahrefs or a free alternative (Google Search Console + Serpstat trial).

---

## 5. Monetization roadmap

The current model — banner ads plus a 10-second interstitial — is viable but fragile. It relies on volume, has no second revenue stream, and the interstitial is the kind of UX choice ad networks (and Google) increasingly downrank. The plan below diversifies revenue across four streams while keeping ads as the foundation.

### 5.1 Phase 1 — Ads, done right (Month 1–3)

Start with **Google AdSense** because approval is fast and integration is well-documented. Move to **Ezoic** as soon as you cross 10,000 monthly sessions — Ezoic typically lifts RPMs 50–200% over raw AdSense by running real-time auctions across networks. Once you cross ~50,000 monthly sessions, qualify for **Mediavine** or **Raptive** (formerly AdThrive); both pay 2–4× AdSense RPM but require traffic and quality minimums.

Slot strategy: keep the existing top and bottom banners but make them sticky-on-scroll only on desktop (mobile sticky banners hurt Core Web Vitals). Add a sidebar slot on the desktop layout — utility sites in this category typically run sidebar 300×600 at the highest CPM of any unit. Replace the current 10-second mandatory interstitial with a **5-second skippable** version after the first upload only, then *no further interstitials in the same session*. The current "mandatory every upload" is a bounce-rate disaster once organic traffic arrives — first-time visitors don't have intent yet, and SERP click-through gets penalized when sessions are short. A/B test ruthlessly here.

Comply with **GDPR** (EU) and **CCPA/CPRA** (California) from day one — AdSense will pause on non-compliant sites. Use a Google-certified CMP (Funding Choices is free and integrates natively with AdSense). Add a cookie banner with reject-all parity.

### 5.2 Phase 2 — Affiliate revenue (Month 2–4)

Affiliate is the highest-margin add-on for a tool site, because there's zero per-impression cost. The category overlaps cleanly with affiliate-friendly products: design software (Adobe Creative Cloud, Figma plugins, Canva Pro), stock photo sites (Shutterstock, Adobe Stock — 20%+ commissions), color-related physical goods (paint sample kits via Sherwin-Williams or Behr referral programs, Pantone swatch books on Amazon Associates). Place contextual affiliate cards on `/learn/*` pages where intent is high; never on the tool page itself, where the user is task-focused.

### 5.3 Phase 3 — Pro tier (Month 4–6)

Once you have an audience, a paid tier solves the income volatility of pure ad revenue. Reasonable Pro features that don't damage the free experience: ad-free browsing, batch image processing (upload 10 images, get a unified palette), export to ASE/Sketch/Figma palette files, save palettes to a personal library, an API key with higher rate limits, and team workspaces for agency use. Price at $4–$6/month or $36/year — the magic price for prosumer design tools. A 2–3% conversion rate of monthly actives is realistic for a well-positioned utility; at 100,000 MAU that's $7k–$15k/month MRR before churn.

### 5.4 Phase 4 — B2B / API (Month 6+)

The same color extraction logic that runs in the browser can be packaged as a paid API: `POST /v1/extract` returns the palette of an image URL. Price by volume tier ($29 / $99 / $299 / custom). Customers: e-commerce platforms doing automated product tagging, design tools, AI image platforms needing color metadata. RapidAPI listing gets you discoverable instantly. This is also the highest-margin revenue stream — software margins, no ad-network cut.

### 5.5 Revenue mix target by Month 12

Roughly: 55% display ads, 20% affiliate, 15% Pro subscriptions, 10% API. Diversification matters because any single stream can collapse on a Google update or policy change.

---

## 6. Product roadmap aligned to revenue

A monetization plan only works if the product earns the impressions. These are the build priorities ordered by revenue impact.

**Quarter 1.** Add SEO foundation (titles, meta, schema, sitemap, OG tags). Add routing (React Router) so programmatic pages exist. Replace the mandatory 10s interstitial with a 5s skippable. Add Plausible or GA4 for analytics. Ship the consent banner. Submit to AdSense.

**Quarter 2.** Build the `/colors/[hex]` and `/convert/[from]-to-[to]` programmatic templates. Pre-render with Vite SSG or migrate to Next.js / Astro for proper SSR — the current Vite SPA setup will not rank well at scale because crawl budget on JS-heavy SPAs is thin. Astro is the lighter migration; Next.js is heavier but unlocks better incremental static regeneration when you scale to tens of thousands of pages.

**Quarter 3.** Ship Pro tier (Stripe + magic-link auth). Launch the public API in beta. Apply to Mediavine if traffic qualifies. Begin localized content for top non-English traffic sources.

**Quarter 4.** Mobile app (React Native wrapper or PWA install prompt) to capture repeat usage and reduce dependence on Google. Add Pinterest publishing pipeline for palette pages — this is a major underexploited channel for color content.

---

## 7. Analytics, measurement & iteration

Without measurement, monetization is guesswork. Install **GA4** for funnel analysis, **Google Search Console** for search performance, **Microsoft Clarity** (free) for session recordings to debug rage-clicks on the ad roll, and an ad-network dashboard (AdSense → Ezoic). Track three north-star metrics: organic sessions/month, RPM (revenue per thousand sessions), and 28-day retention. Review weekly. The trap with ad-supported sites is optimizing impressions at the expense of retention — high RPM on a single session is worth less than moderate RPM on a returning user.

Run an A/B test rotation: ad-roll length (10s vs 5s vs skippable), banner placement (top vs sticky vs in-content), and Pro upsell timing. The current 10-second mandatory roll is the single most likely thing to be quietly costing you 30%+ of would-be returning users.

---

## 8. Risks & mitigations

The biggest existential risks for an ad-supported utility are platform-dependency risks. A Google algorithm update can wipe out 70% of traffic overnight — mitigate by diversifying traffic sources (Pinterest, direct, API customers, mobile app). An AdSense policy strike can pause all revenue for weeks — mitigate by running Ezoic or a header-bidding wrapper as a backup ad source and by complying scrupulously with content policies (no scraping copyrighted images, no AI-generated thin content). A trademark dispute from a sleeping mark holder can force a rename mid-growth — mitigate by paying for a real trademark search before printing the brand on a domain. And finally: a competitor with a free open-source project can commoditize the tool, in which case content depth and the Pro tier's workflow features become the moat, not the picker itself.

---

## 9. Quick-start checklist

Concrete next 14 days, in order:

1. Lock the brand name (recommend **Hexly**), do a USPTO TESS search and a basic Google search for conflicts.
2. Buy the brand `.com` and one keyword EMD (e.g. `hexly.com` + `imagecolorpicker.com` redirect).
3. Update `index.html` with title, meta description, OG, Twitter Card, canonical, and `application/ld+json` for `SoftwareApplication`.
4. Add `public/robots.txt` and a build-time `sitemap.xml` generator.
5. Apply for AdSense; while waiting, integrate Funding Choices CMP.
6. Replace the 10s mandatory ad roll with 5s skippable, first-upload only.
7. Add GA4, Search Console verification, and Microsoft Clarity.
8. Stand up a basic blog/content surface (Astro or MDX in the existing Vite app) and publish three cornerstone articles targeting Tier-1 keywords.
9. Submit to Product Hunt and three design-tool directories.
10. Set up weekly analytics review — even a 30-minute calendar block makes the difference between drift and compounding growth.

---

*Document owner:* the project maintainer. *Cadence:* revisit at the end of each quarter, or whenever a major revenue stream changes.
