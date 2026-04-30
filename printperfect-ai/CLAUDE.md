# CLAUDE.md

Guidance for Claude (Claude Code, Cowork, and Sonnet/Opus agents) working in this repository.

## Project summary

PrintPerfect.ai is a Next.js 14 web app that runs AI image-enhancement models entirely in the browser (ONNX Runtime Web + WebGPU) and sells the resulting prints through Printify's API. **No image data ever leaves the user's device** — this is a hard architectural constraint, not a preference.

## Architectural rules (don't break these)

1. **No server-side image processing.** All upscaling, colorization, inpainting, etc. happens in the browser. The only server-side concerns are: marketing pages (SSG), Printify API proxying (to hide the API token), and Stripe/checkout webhooks. Never add an endpoint that accepts uploaded image bytes for processing.
2. **No image uploads to third parties.** When sending a print to Printify, upload the user-confirmed final image directly from the browser to Printify's image-upload endpoint via our proxy. Don't persist it on our infra.
3. **Inference runs in a Web Worker.** Never block the main thread with model inference. Use `OffscreenCanvas` and transfer `ImageBitmap`/`ArrayBuffer` to workers.
4. **Models are lazy-loaded and cached.** Use the Cache API (`caches.open('pp-models-v1')`) to persist ONNX files across sessions. Show a download progress UI on first use of each feature.
5. **Tile large images.** WebGPU has VRAM limits. Upscalers should tile inputs (typically 256x256 or 512x512 with 16-32px overlap) and stitch outputs. Helpers live in `lib/image/tiling.ts`.

## Tech stack

- Next.js 14 (App Router), TypeScript strict mode
- Tailwind CSS (no UI kit yet — keep components small and custom)
- `onnxruntime-web` for inference
- `@huggingface/transformers` only where ONNX models aren't readily available (e.g. RMBG)
- Printify REST API (v1) for fulfillment

## Common commands

```bash
npm run dev          # Next.js dev server on :3000
npm run build        # Production build
npm run start        # Run production build locally
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

## Directory map

```
app/                    Next.js App Router
  page.tsx             Landing page (SSG, SEO-optimized)
  editor/page.tsx      Main editor (client component)
  api/printify/        Server-only Printify proxy routes
components/            React components
  editor/              Editor UI (Canvas, Toolbar, FeaturePanels)
  marketing/           Landing-page sections
lib/
  ai/                  Model loaders, ONNX session management
    upscaler.ts
    colorizer.ts
    inpainter.ts
  image/               Canvas helpers, tiling, conversions
  printify/            Typed Printify API wrapper
workers/               Web Workers (inference runners)
public/
  models/              Small models bundled directly; large models fetched at runtime
```

## Conventions

- **TypeScript strict.** No `any` unless escape-hatching a 3rd-party type. Use `unknown` and narrow.
- **Server vs client components.** Default to server components. Mark client components with `'use client'` only when needed (anything touching `window`, `canvas`, ONNX, or React hooks).
- **State management.** Editor state lives in a single Zustand store (`lib/store.ts`) — avoid prop-drilling. Don't reach for Redux.
- **Styling.** Tailwind utility classes inline. Extract to a component before reaching for `@apply`.
- **Imports.** Use absolute imports from `@/` (configured in `tsconfig.json`).
- **Async work.** Always show progress for anything >300ms. The editor should never feel frozen.

## SEO requirements

The landing page and any per-feature pages (e.g. `/upscaler`, `/colorize`, `/restore`) are the primary acquisition channel. They must:

- Be statically rendered (no `'use client'` at the top of the page file).
- Include semantic headings (`h1` with the feature keyword).
- Set `metadata` exports with title, description, and OpenGraph tags.
- Include a JSON-LD `SoftwareApplication` schema block.
- Lazy-load the editor bundle so the LCP isn't dragged down by ONNX runtime.

## Safety / privacy guarantees we make to users

These are stated on the landing page and **must remain true**:

- "Your photos never leave your browser."
- "We don't store your images."
- "No account required to edit."

If you're about to add code that violates any of these, stop and flag it.

## Printify integration notes

- API token stored in `PRINTIFY_API_TOKEN` env var, never exposed to the client.
- All Printify calls go through `/api/printify/*` routes that inject the token server-side.
- Image upload to Printify happens via `POST /v1/uploads/images.json` — we proxy the request and stream the user's image bytes through without persisting.
- Test with the Printify sandbox shop ID first; production shop ID is set per-environment.

## Things to avoid

- Don't add server-side image processing libraries (sharp, jimp, etc. on the server). They're fine in build scripts but never in request handlers.
- Don't add analytics that ship pixel data or screenshots. Plausible/Fathom OK; Hotjar/FullStory not OK.
- Don't add a "save to cloud" feature without explicit product discussion — it breaks the privacy promise.
- Don't bundle models >50MB into the JS bundle. Fetch them at runtime with progress UI.

## When working on this codebase

- Read this file first.
- Check `README.md` for the user-facing feature list and roadmap.
- If implementing a new AI feature, follow the pattern in `lib/ai/upscaler.ts` (once it exists): a class with `init()`, `run(imageData)`, and `dispose()` methods.
- Add a corresponding feature panel in `components/editor/panels/`.
- Always verify the build passes (`npm run build`) before reporting work as done.

## Recent developer notes

Small maintenance applied:

- Added client-side i18n provider at `src/lib/i18n.tsx` and `public/translations.json`.
- Added `components/LanguageSwitcher.tsx` and wired it to the header via `app/layout.tsx` (centered header placement).
- Updated sample components to use `useI18n()` (`Hero.tsx`, `PrintCTA.tsx`).
- Fixed build-time ESLint issues (hook helper rename in `Editor.tsx`, escaped apostrophes, and added `@typescript-eslint` parser/plugin to devDependencies with `.eslintrc.json` updates).
