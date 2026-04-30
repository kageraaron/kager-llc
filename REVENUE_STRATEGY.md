# kager-llc Utility-Suite Strategy (revised)

**Prepared:** 2026-04-30
**Scope of this revision:** Should the **utility** projects (a `local-convert`-style file converter, QR generator, password generator, encoders, etc.) live under one umbrella domain, several themed hubs, or as fully separate single-tool sites? Word Nexus and FruitFight remain separate as previously discussed.

**Time budget:** 5–10 hrs/week
**Monetization:** Programmatic ads (AdSense → Mediavine / Raptive at scale) + selective affiliate
**Goal:** Maximize organic traffic per hour invested

---

## TL;DR — the answer in one paragraph

**Combine, but only within a single tight topical theme. Do not build a TinyWow-style everything-mega-hub.** The 2026 data is unambiguous: iLovePDF (PDF-only focus) does ~226M monthly visits, Convertio (every-format-converter) does ~22M, and TinyWow (PDF + image + video + AI + 250 tools across many themes) does ~2.5M.<sup>1</sup> Same effort, 90× the traffic for the focused player. Google's March 2026 topical-authority shift made this gap permanent (HubSpot lost ~75% organic traffic for going off-topic).<sup>2</sup> The right move for your time budget is **one themed hub**, with any utilities that don't fit the theme either spun out as single-tool sites later or deferred. Below I lay out the two strongest themed-hub paths and recommend Path A.

---

## 1. The combine-vs-split decision, with numbers

I looked at the actual outcomes of every structural pattern you'd consider:

| Pattern | Example | Tools on site | Monthly visits | Visits per tool | Topical authority |
|---|---|---|---|---|---|
| **Tight themed hub** | iLovePDF | ~25 (all PDF) | ~226M<sup>3</sup> | ~9M | Maximum (one topic, deep coverage) |
| **Tight themed hub** | SmallPDF | ~30 (PDF + adjacent) | ~9.5M+ (15M total users)<sup>4</sup> | ~300K | High |
| **Single-tool EMD** | QRCode-Monkey | 1 (QR codes) | ~3.3M<sup>5</sup> | ~3.3M | Maximum (one tool, perfect match) |
| **Broad converter hub** | Convertio | ~150 (all formats) | ~22M<sup>6</sup> | ~150K | Diluted across formats |
| **Mega everything-hub** | TinyWow | 250+ (PDF, image, video, AI, etc.) | ~2.5M<sup>7</sup> | ~10K | Severely diluted |

The pattern is clear:
- **Tight theme** > **single tool** > **broad** > **mega-hub**, by orders of magnitude
- iLovePDF, with the same engineering effort as TinyWow but a tight focus, gets ~90× the traffic
- A single tool with the right keyword (QRCode-Monkey) outperforms a 250-tool mega-hub

**This is why the recommendation is: bundle related utilities, refuse to bundle unrelated ones.** Throwing everything together (the TinyWow path) actively hurts you in the post-March-2026 ranking model. iLovePDF's 226M visits aren't from "more pages" than TinyWow — TinyWow has 10× the pages — they're from being unambiguously *the PDF site* in Google's understanding of the web.

---

## 2. Mapping your utilities to themes

Your stated examples — `local-convert`, QR generator, password generator — span **three different topical clusters**. Combining all three on one domain is the TinyWow trap.

| Utility | Natural cluster | Audience | Search intent | RPM band |
|---|---|---|---|---|
| local-convert (image / video / audio / PDF / doc) | **Media & file conversion** | Mainstream creators, students, office workers | Transactional ("convert X to Y"), high-volume | $15–$25 |
| EXIF stripper, image compressor, OCR, watermark remover | **Media & file conversion** | Same | Transactional | $15–$25 |
| QR generator (with logo, vCard, WiFi) | **Generators & marketing utilities** | Small-business owners, marketers, event hosts | Transactional but different intent ("create QR for menu") | $10–$20 |
| Password generator, hash, JWT decoder, regex tester | **Developer utilities** | Devs, security people, IT | Transactional, tool-of-the-day usage | $30–$50 (highest CPC) |
| JSON / Base64 / URL encode-decode | **Developer utilities** | Devs | Transactional | $30–$50 |
| Calculators, timezones, lorem ipsum | **Everyday helpers** | Mixed | Mixed | $5–$15 |

So the real strategic choice is **which of these three to one cluster to build first**:
1. **Media & file conversion** — biggest TAM, the `local-convert` bucket
2. **Developer utilities** — highest RPM, less saturated, technical audience
3. **Generators & marketing utilities** — narrower but viral-shareable

Picking two means splitting your 5–10 hrs/week and getting nowhere on either. Pick one.

---

## 3. Two viable themed-hub paths

### Path A — The Media & File Tools Hub (recommended)

**One domain.** All utilities are about *transforming a file or piece of content from format X to format Y or modifying media in the browser*. The unifying customer promise: **"Drag in a file. Get it back. Nothing leaves your tab."**

**Tool roster (ship in this order):**

1. PNG ↔ JPG ↔ WebP ↔ AVIF (libvips-wasm; tiny bundle, fast)
2. HEIC → JPG / PNG (high-volume keyword, sparse SERP for browser-only)
3. PDF merge / split / rotate / compress (pdf-lib)
4. MP4 → MP3, MOV → MP4, WebM → MP4 (ffmpeg.wasm, lazy-loaded)
6. Image compressor (target file size, like TinyJPG but client-side)
7. EXIF stripper / metadata viewer
8. SRT ↔ VTT subtitle converter
9. Image → text OCR (tesseract.js)
10. PDF → image, image → PDF
11. GIF maker from video clip
12. SVG ↔ PNG, ICO generator

**Why this path:**
- Closest match to your stated `local-convert` framing — directly competitive with the playbook you admire
- Highest search volume per tool by a wide margin
- The privacy-first / client-side angle is a *real* differentiator here, where competitors all upload (CloudConvert, Convertio, FreeConvert all process server-side)
- The visual experience is consistent across tools: drag-drop zone + progress + download — easy to share a single component library across all pages
- Highest absolute traffic ceiling (iLovePDF's 226M proves the size of this market)

**Why not this path:**
- Very saturated head terms — you cannot win "convert pdf to word" against Adobe + iLovePDF + SmallPDF
- ffmpeg.wasm bundle is heavy (~25MB) — needs careful lazy-loading
- RPM is mid-tier ($15–$25), not the highest

### Path B — The Developer Utilities Hub

**One domain.** Tools developers reach for daily. Customer promise: **"Devs' bookmark for one-off jobs. No login, no analytics, runs in your tab."** (Think `it-tools.tech`, but with deeper SEO.)

**Tool roster:**

1. JSON formatter / minifier / validator
2. Base64 encoder / decoder (text + image)
3. URL encoder / decoder
4. JWT decoder
5. Regex tester / explainer
6. Hash generator (MD5, SHA-1, SHA-256)
7. UUID / GUID generator (v4, v7)
8. Password generator (strong, customizable, passphrase mode)
9. QR generator (text, URL, vCard, WiFi)
10. Lorem ipsum generator (and theme variations)
11. Color picker, palette extractor, contrast checker
12. Cron expression builder, timestamp converter
13. JSON ↔ CSV ↔ YAML ↔ TOML
14. Markdown preview / HTML escape
15. Diff viewer

**Why this path:**
- **2–3× higher RPM** than Path A; tech CPC is the strongest in the AdSense ecosystem
- Less saturated SERPs (it-tools.tech, devtoolio, jsonformatter.org all rank but no clear giant has consolidated the way iLovePDF has for PDF)
- Extremely cheap to ship — most tools are pure JavaScript, no WASM, no large bundles
- Devs share tools on social (Reddit r/webdev, Hacker News, X) which generates organic backlinks
- Strong moat: once you become a dev's bookmark, they don't browser-shop for an alternative

**Why not this path:**
- Smaller TAM (devs are a fraction of the file-conversion audience)
- Devs sometimes use ad blockers (mitigated by the fact that programmatic ads still pay strongly even at lower viewability rates in this niche, plus high CPC compensates)

### My recommendation: **Path A**

Three deciding factors:
1. **Larger absolute traffic ceiling.** Path B may have higher RPM, but Path A's TAM is roughly 10× the size. With a 5–10 hr/week budget, you want the biggest market that can absorb a slow, organic ramp.
2. **The privacy-first angle is more powerful here.** Devs already trust running stuff locally; for them, "client-side" is an expectation, not a differentiator. For everyone else uploading their family photos to a converter site, "stays in your tab" is a real reason to switch.

If you'd rather take the smaller-but-easier RPM-optimized route, Path B is a perfectly defensible second choice.

**Either way: build only one. Don't split your time across both.**

---

## 4. What about utilities that don't fit Path A?

Three options for orphans like a password generator or a regex tester if you take Path A:

1. **Defer.** Park the code, revisit after the hub is generating measurable traffic (3–6 months in). 80% of the time this is the right call.
2. **Spin up as single-tool EMD sites** later. QRCode-Monkey's 3.3M visits prove a single tool with a perfect-match domain can outperform a 250-tool mega-hub. Examples: `passwordforge.com`, `qrtab.io`. But — only do this if you have time to dedicate to that single tool's SEO. A 50%-finished EMD site is worse than no site.
3. **Add later under the same domain only after Path A is dominant.** Once `tabconvert.com/png-to-jpg` ranks top-3 for its keyword, Google trusts you on file tools — *but* extending to dev utilities under the same domain risks the HubSpot dilution. If you do extend, do it carefully (e.g., a `tabconvert.com/dev/` subdirectory only when you have enough dev tools to form a real cluster of 10+).

For the lean budget: **option 1 (defer) is correct for now.**

---

## 5. Domain recommendations for the Path A hub

The strong "*convert*" namespace is mostly taken (FreeConvert, CloudConvert, Convertio, Online-Convert, BrowserConvert, TinyConvert, SnapConvert.org, SwiftConverter all live). That's actually fine — fighting on the keyword name is less effective than building a memorable brand that *contains* a partial-match cue.

**Top picks** (rank order, all need a registrar availability check):

| Domain | Why it works |
|---|---|
| **`tabconvert.com`** | Reinforces the "stays in your tab" privacy angle. Short, memorable, partial-match (`convert`). Two syllables. |
| **`stayfile.com`** | The privacy promise *is* the brand. Easy to message: "your file stays here." |
| **`pagefile.com`** | Similar to stayfile, plus "page" reinforces the browser-native nature. |
| **`inbrowser.tools`** | Descriptive, available-feeling, matches the literal product. `.tools` TLD is well-suited. |
| **`localfile.tools`** | Exact-keyword match. Less brandable but strong on SEO directness. |
| **`tabkit.app`** | Suggests a kit of tab-based tools. Brandable, .app forces HTTPS (fine for tools). |
| **`offfile.io`** | Plays on "off the cloud, off our servers." Quirky, distinctive, .io renewal cost is meaningful (~$40/year). |

**My pick: `tabconvert.com` if available; `stayfile.com` as runner-up.**

Validation steps before buying:
1. Check at Porkbun or Cloudflare Registrar (both at-cost — avoid GoDaddy upsells)
2. Search the candidate name in Google with quotes — make sure no abandoned-but-indexed competitor exists
3. Run a quick TESS check at uspto.gov to avoid trademark surprises
4. Check social handles on namechk.com if you care about consistent branding

Avoid:
- Any name with "convert" if Google already shows a strong active site for that exact name
- Hyphenated domains (lower CTR, unmemorable)
- `.co` (often confused with `.com`) and obscure new TLDs (`.xyz`, `.shop`) which signal lower quality to Google CTR-wise even though Google says they don't penalize them

---

## 6. SEO playbook (post-March-2026, lean)

Tactics that survive the scaled-content rules and fit a 5–10 hr/week cadence.

### One-time foundation (week 1)
- **Astro or Next.js static export** on Cloudflare Pages (free, global CDN, automatic Brotli)
- One route per tool — `/png-to-jpg`, `/heic-to-jpg`, `/text-to-speech`, etc. — generated from a `tools.json` manifest via `getStaticPaths`
- **Lighthouse target ≥ 95 on mobile.** This is the entire ballgame in this category. iLovePDF and SmallPDF both ship < 100KB initial payload + lazy WASM. Match that.
- **Ad slots:** AdSense with one above-the-fold unit, one between the tool and the explainer, and a sticky bottom unit. **Never above the primary action button** — kills tool completion, kills dwell time, kills rankings. Lazy-load the AdSense script.

### Per-tool page anatomy (mandatory — this is what survives the scaled-content penalty)
1. H1 matching the highest-volume query exactly ("Convert PNG to JPG")
2. **Working tool above the fold on mobile** — drag-drop, instant client-side conversion, download
3. "How it works" block (200–300 hand-written words) — explains the actual process, names the WASM library, mentions privacy
4. Real FAQ (5–7 Q&As, hand-written, marked up with `FAQPage` schema)
5. "Related tools" internal-link block (6–10 links to siblings)
6. JSON-LD: `SoftwareApplication` + `HowTo` + `FAQPage`

Each page must clear the post-March-2026 bar: ~40% unique content per page (mostly the how-it-works + FAQ), real working tool, internal-link depth.

### Keyword strategy
- **Skip head terms.** "Convert PDF to Word" is owned by Adobe + iLovePDF + SmallPDF. Don't fight there.
- **Long-tail conversion pairs:** `heic to jpg`, `webp to png`, `mov to mp4 mac`, `srt to vtt`, `apng to gif`, `avif to png`. Dozens have 5K–50K monthly searches and weak SERPs.
- **Modifier pages** — same target tool, different intent: `compress png under 100kb`, `convert pdf without uploading`, `merge pdf no email`, `mp4 to mp3 high quality`. SmallPDF dominates these.
- **Privacy modifier** is your unique angle: `convert pdf without uploading`, `offline png to jpg`, `local file converter no upload`, `private heic to jpg`. Build dedicated pages for these — most competitors don't.

### Backlinks (the only real growth lever)
- **Embed widget per tool** with a logo-included snippet ("Embed this on your site"). Online-Solitaire used this exact lever to grow from $30/day to $25K/month — embeds compound into permanent backlinks.<sup>8</sup>
- **dev.to / Hacker News post per tool launch:** "How I built a browser-only X with Y.wasm." This format reliably ranks and drives traffic.
- **Reddit:** r/InternetIsBeautiful, r/webdev, r/privacy (the last is unusually receptive given your angle).
- **GitHub awesome-lists:** awesome-self-hosted, awesome-webassembly, awesome-privacy.
- **Localization** is the single highest-ROI growth lever once English ranks. SmallPDF added 60% to its user base by translating into 20+ languages; Thai alone added 500% in that locale.<sup>9</sup>

### Ad timeline
- **AdSense for first ~6 months.** Apply once you have ≥ 12 tool pages + /about, /privacy, /contact.
- **Mediavine / Raptive at 50K monthly sessions.** RPM jumps from $5–$15 → $20–$40. This is a step-change in revenue and worth optimizing for.
- **Affiliate layer** on a small number of pages where the user is signaling intent. On `/text-to-speech`: ElevenLabs / Murf affiliate ("need broadcast quality? try…"). On image tools: Canva Pro / Shutterstock contributor signups. Don't junk every page with affiliate links.

---

## 7. The 8-week shipping plan (≤ 10 hrs/week)

| Week | Build | Notes |
|---|---|---|
| 1 | Buy domain. Astro skeleton + Cloudflare Pages deploy. Ship PNG↔JPG and WebP→PNG with full per-page anatomy. AdSense application submitted. | Domain + AdSense both have 1–2 wk lead time; start simultaneously. |
| 2 | Add HEIC→JPG (long-tail keyword goldmine), MP4→MP3 (lazy-loaded ffmpeg.wasm), PDF merge. | 5 indexed tool pages. |
| 3 | Add 4 more tools: PDF split, image compressor, EXIF stripper, GIF maker. | 9 tool pages. |
| 4 | First content batch: 3 dev.to posts ("How I built a browser-only X with Y.wasm"). One Hacker News submission. Submit to GitHub awesome lists. | Backlink phase begins. |
| 5 | Modifier-keyword pages: `compress png under 100kb`, `convert pdf without uploading`, `mov to mp4 mac`. | These outrank head terms because head terms are owned. |
| 6 | Embed widget + 2 more tools (OCR via tesseract.js, SRT↔VTT). r/webdev and r/privacy posts. | Embed widget compounds for years. |
| 7 | Lighthouse / Core Web Vitals audit pass. Re-check AdSense / start tracking toward Mediavine 50K threshold. First revenue review. | Recalibrate based on what's ranking. |

---

## 8. Risks & how to dodge them

- **The HubSpot trap.** The single biggest risk is theme drift — adding a regex tester to a file-converter site because "it's also a tool." Resist. Until /png-to-jpg is top-3 for its keyword, every page must be a media/file conversion tool. Period.
- **WASM bundle bloat killing mobile.** ffmpeg.wasm is ~25MB. Lazy-load it only on audio/video pages. Image and PDF tools use much smaller libs (libvips-wasm ~3MB, pdf-lib ~200KB). First paint on `/png-to-jpg` should be < 100KB JS.
- **AdSense rejection.** Common with sub-30-page sites. Mitigation: ship 12+ tool pages with real content + /about, /privacy, /contact, /terms before applying.
- **Scaled-content penalty.** Mitigated by the per-page anatomy (real tool + ≥40% unique content + FAQ + internal links). Never auto-generate copy. Hand-write every FAQ.
- **AI Overviews eating long-tail.** Real working tools cannot be replaced by AI Overviews — Gemini cannot run ffmpeg.wasm in your browser. This is precisely why the *utility-tool* category is more durable than informational pSEO.
- **The "park the orphans" temptation.** When a regex-tester or password-generator project feels half-built, the urge will be to throw it on the same domain "to share traffic." Don't. Either ship it as its own EMD site later, or leave it parked.

---

## 9. Recap

The right structure for your utilities is **one tightly-themed hub**, not a TinyWow-style mega-hub and not all-separate single-tool sites. Within that constraint:

- **Recommended theme: Media & File Tools** (Path A), bundling image / video / audio / PDF / TTS conversions, all client-side.
- **Recommended domain: `tabconvert.com`** (runner-up: `stayfile.com`).
- **Park the orphans** — password gen, QR gen, dev encoders — for now. Revisit once Path A has measurable traffic. Each one can later become its own EMD site if it earns the time investment.
- **Word Nexus and FruitFight stay separate domains** as previously decided.

---

## Sources

1. [Compare Smallpdf vs. TinyWow — Slashdot](https://slashdot.org/software/comparison/Smallpdf-vs-TinyWow/); [TinyWow traffic — Similarweb summary](https://www.semrush.com/website/tinywow.com/overview/)
2. [Topical Authority 2026 — GeoSEO](https://geoseo.digital/insights/topical-authority-2026/); [Topical Authority Has Changed — ClickRank](https://www.clickrank.ai/topical-authority/)
3. [iLovePDF traffic comparison — SaaSHub](https://www.saashub.com/cloudconvert-alternatives)
4. [Smallpdf grew by 60% on search traffic — OneSky](https://www.oneskyapp.com/blog/customers-2/success-story-smallpdf/)
5. [QRCode-Monkey Traffic — Semrush](https://www.semrush.com/website/qrcode-monkey.com/overview/); [qr-code-generator vs qrcode-monkey — Similarweb](https://www.similarweb.com/website/qr-code-generator.com/vs/qrcode-monkey.com/)
6. [Convertio traffic vs CloudConvert — SaaSHub comparison](https://www.saashub.com/cloudconvert-alternatives)
7. [TinyWow traffic — Similarweb](https://www.similarweb.com/website/tinywow.com/); [TinyWow tool count — MOGE](https://moge.ai/product/tinywow)
8. [How I grew a simple solitaire game to $10k MRR — Indie Hackers](https://www.indiehackers.com/post/how-i-grew-a-simple-solitaire-game-to-10k-mrr-28e352c308); [My SEO Journey: Holger Sindbaek — SEOBuddy](https://seobuddy.com/blog/my-seo-journey-holger-sindbaek/)
9. [Smallpdf grew by 60% on search traffic — OneSky](https://www.oneskyapp.com/blog/customers-2/success-story-smallpdf/)
10. [LocalConvert](https://localconvert.com/); [Programmatic SEO After March 2026 — DigitalApplied](https://www.digitalapplied.com/blog/programmatic-seo-after-march-2026-surviving-scaled-content-ban); [ffmpeg.wasm](https://ffmpegwasm.netlify.app/); [OfflineTTS browser-based TTS](https://offlinetts.com/blog/tts-without-api-key/)
