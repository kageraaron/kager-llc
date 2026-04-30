# local-Converter: Development Guide

## Project Overview
A revenue-generating web application for local-first file conversion. 
Goal: High SEO visibility, ad-supported free tier, and premium subscription/token-based features.

## Architecture: SEO-First Monolith
- **Single Domain Strategy:** Consolidate all traffic into one domain to build high Domain Authority (DA) quickly.
- **Dynamic Routing:** Use a template-based approach (e.g., `/convert/[from]-to-[to]`) to generate hundreds of SEO-optimized landing pages.
- **Shared Core:** Centralize ad placement logic, UI components, and local-first conversion wrappers.

## Roadmap
- **Phase 1: Foundation:** Build the monolith, optimize for Core Web Vitals, and implement ad-supported local conversions.
- **Phase 2: Validation & Reliability:** Implement a robust testing suite including:
    - A directory of sample files for all supported extensions.
    - Automated unit tests for conversion logic (`src/lib/converters`).
    - Integration tests using Playwright/Cypress to verify end-to-end file processing in the browser.
- **Phase 3: Monetization Depth:** 
    - Introduce token-based and subscription tiers for premium/cloud features.
    - **TODO:** Implement interstitial video ads during the conversion process (require 15-second watch time before download is enabled).
- **Phase 4: Market Dominance (Scale):** Spin off high-performing conversion types into dedicated "niche" domains (polyrepo).

## Technical Implementation Details
- **Next.js App Router:** Dynamic routes (e.g., `/convert/[slug]`) must handle `params` as a `Promise` (Next.js 15+ standard).
- **Cross-Origin Isolation:** Required for `SharedArrayBuffer` (used by FFmpeg.wasm). Headers are set in `next.config.js`.
- **Client-Side Processing:** All conversion logic must reside in `src/lib/converters` and be imported dynamically in client components to keep initial bundle size small.

## Deployment & Monetization
### 1. Deployment (Vercel)
- **Method:** Connect the GitHub repository to Vercel for automated CI/CD.
- **Environment:** Ensure `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers are active in production (managed via `next.config.js`).
- **Optimization:** Enable "Vercel Analytics" to monitor Core Web Vitals for SEO impact.

### 2. Domain & SEO
- **Connection:** Point the primary domain (e.g., `local-convert.com`) to Vercel using CNAME/A records.
- **Sitemaps:** Use `next-sitemap` or a custom `src/app/sitemap.ts` to generate a dynamic sitemap that includes all `/convert/[slug]` permutations.
- **Robots:** Maintain a `public/robots.txt` that allows all crawlers to index conversion routes.

### 3. Google AdSense / Ezoic Integration
- **Site Verification:** Place the `ads.txt` file in `public/ads.txt`.
- **Auto-Ads:** Insert the AdSense/Ezoic script tag in `src/app/layout.tsx` within the `<head>` to enable "Auto Ads" across all SEO landing pages.
- **Placeholder Management:** Use reserved CSS classes (e.g., `.ad-slot`) in UI components to prevent Layout Shift (CLS) when ads load.

### 4. Obsess over SEO and Ads performance
- integrate with Google Ads API to consistently test and optimize for best ad performance that yields traffic.

## Build & Test Commands
*Placeholder commands - update as the stack is finalized*
- Build: `npm run build`
- Development: `npm run dev`
- Test: `npm test`
- Lint: `npm run lint`

## Coding Standards
- **Local-First:** All conversions must happen in the browser/client-side unless explicitly requested via a premium cloud feature.
- **Privacy:** User files should never touch the server in the free tier.
- **SEO & Performance:** Prioritize Core Web Vitals to ensure high search engine ranking and ad revenue optimization.
- **TypeScript:** Use strict typing for all components and conversion logic.
