# Project Guide: Color Picker

Revenue-driven web app for color identification in images.

## Build & Development
- **Install:** `npm install`
- **Dev:** `npm run dev`
- **Build:** `npm run build`
- **Lint:** `npm run lint`

## Architecture & Conventions
- **SEO First:** Every page must have optimized titles, descriptions, and H1 tags.
- **Monetization:** 
  - Ad containers must have fixed dimensions to prevent layout shifts.
  - The 10-second ad-roll is mandatory for the "processing" state.
- **Formatting:** Use Prettier for consistent code style.
- **State Management:** Keep it lightweight (React Context or simple hooks).

## Key Files
- `src/components/AdBanner.tsx`: Reusable component for banner ads.
- `src/components/AdRoll.tsx`: The 10-second interstitial logic.
- `src/utils/colorExtractor.ts`: Core logic for image analysis.
