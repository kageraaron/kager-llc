# Gemini CLI Instructions

This project is a revenue-focused web application for color identification from images. Success is measured by SEO performance and ad impressions.

## Project Context
- **Core Loop:** User uploads image -> 10s Ad Roll -> Color Analysis (HEX/RGB/etc) -> Results with Banner Ads.
- **Monetization:** Banner ads (top, bottom, sides) and interstitial ad-rolls during processing.
- **Goal:** Maximum SEO visibility and high ad engagement.

## Engineering Standards
- **Performance:** Ensure fast initial load for SEO. Optimization is critical for Core Web Vitals.
- **SEO:** Use semantic HTML. Prioritize meta-tags, schema.json (ImageObject, SoftwareApplication), and SSR-friendly patterns.
- **Ads:** Ensure ad placeholders are stable to prevent Layout Shift (CLS).
- **Validation:** Always verify that ad-roll logic does not break the core image processing pipeline.

## Tech Stack (Preferred)
- **Frontend:** React (TypeScript) with Vanilla CSS for performance.
- **Processing:** Client-side canvas/WASM for color extraction to keep server costs low.
