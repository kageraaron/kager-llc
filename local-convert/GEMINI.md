# GEMINI.md: Project Mandates

## Core Vision
Local-Convert is a side-hustle aimed at generating revenue through high-volume, local-first file conversions. Monetization is driven by ads (AdSense/Ezoic) and future premium tiers.

## Absolute Mandates
1. **Privacy First:** Never implement a feature that uploads user files to a server without an explicit "Premium Cloud" opt-in.
2. **Monolith for SEO Authority:** Start as a single-domain monolith to maximize Domain Authority and consolidate traffic for premium ad network eligibility.
3. **SEO Optimized:** Every new conversion tool (e.g., "HEIC to PNG") must be accompanied by a dedicated, SEO-optimized landing page or route.
4. **Ad-Friendly Layout:** UI designs must reserve specific, high-visibility slots for ads (bottom banners, interstitials between conversions) without compromising the "local-first" speed.
5. **Performance:** Conversion logic must be optimized for client-side execution (WASM, Web Workers) to minimize infrastructure costs and maximize profit margins.
6. **Future Scaling:** Once established at scale, prepare to diversify into a polyrepo/multi-domain strategy to further dominate search engine real estate.
7. **Edge-First Deployment:** Use Vercel for deployment to leverage its global edge network, ensuring the lowest possible latency for WASM-heavy conversion tools.
8. **Automated Monetization Readiness:** The codebase must maintain `ads.txt` and `sitemap.xml` automatically to ensure immediate eligibility and crawlability for premium ad networks (AdSense/Ezoic).

## Roadmap & TODOs
- [ ] **Video Ad Interstitials:** Implement a mandatory 15-second video ad view during the conversion state before the download link is revealed. This maximizes revenue during the high-intent conversion window.

## Technical Preferences
- **Frontend:** Next.js (App Router) with TypeScript.
- **Styling:** Vanilla CSS (for performance and minimal bundle size).
- **Processing:** FFmpeg.wasm, pdf-lib, pdfjs-dist, heic2any, and browser-native APIs (Canvas) for local conversion.

##