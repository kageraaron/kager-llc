# GEMINI.md

Guidance for Google Gemini (Gemini CLI and Gemini Code Assist) working in this repository.

This file mirrors `CLAUDE.md` so both agents share the same mental model of the project. If the two ever drift, `CLAUDE.md` is the source of truth.

## Project summary

PrintPerfect.ai is a Next.js 14 web app that runs AI image-enhancement models entirely in the browser (ONNX Runtime Web + WebGPU) and sells the resulting prints through Printify's API. **No image data ever leaves the user's device** — this is a hard architectural constraint, not a preference.

## Architectural rules

1. **No server-side image processing.** All upscaling, colorization, inpainting happens in the browser. Server only handles marketing pages (SSG), Printify API proxying, and checkout webhooks.
2. **No image uploads to third parties from our infra.** Browser uploads directly to Printify via our token-injecting proxy; we never persist the bytes.
3. **Inference runs in a Web Worker.** Use `OffscreenCanvas` and transferable objects to keep the main thread responsive.
4. **Models are lazy-loaded and cached** via the Cache API. Show download progress on first use.
5. **Tile large images** to stay within WebGPU VRAM limits (typically 256x256 or 512x512 with overlap).

## Tech stack

- Next.js 14 (App Router), TypeScript strict mode
- Tailwind CSS
- `onnxruntime-web` for inference (WebGPU primary, WASM fallback)
- `@huggingface/transformers` for models without readily available ONNX exports
- Printify REST API v1

## Common commands

```bash
npm run dev          # Dev server :3000
npm run build        # Production build
npm run start        # Run production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

## Directory map

```
app/                    Next.js App Router pages
components/             React components (editor/, marketing/)
lib/
  ai/                   Model loaders + inference wrappers
  image/                Canvas helpers, tiling
  printify/             Typed Printify API wrapper
workers/                Web Workers
public/models/          Bundled or runtime-fetched ONNX files
```

## Conventions

- TypeScript strict; avoid `any`, prefer `unknown` with narrowing.
- Default to server components; mark client components with `'use client'` only when necessary.
- Zustand for editor state, not Redux.
- Tailwind utilities inline; extract to a component before reaching for `@apply`.
- Absolute imports via `@/` alias.
- Always show progress UI for any async operation longer than ~300ms.

## SEO requirements

Landing and per-feature pages are the primary acquisition channel. Each must:

- Be statically rendered (no `'use client'` at the top).
- Use semantic headings; `h1` should contain the target keyword.
- Export `metadata` with title, description, OpenGraph tags.
- Include JSON-LD `SoftwareApplication` schema.
- Lazy-load the editor bundle so LCP isn't blocked by ONNX runtime.

## User-facing privacy guarantees (must remain true)

- "Your photos never leave your browser."
- "We don't store your images."
- "No account required to edit."

If you're about to add code that breaks any of these, stop and flag it.

## Printify integration

- `PRINTIFY_API_TOKEN` env var, server-only.
- All calls go through `/api/printify/*` routes.
- Image upload streams through `POST /v1/uploads/images.json` proxy without server-side persistence.
- Use the sandbox shop ID for development.

## Things to avoid

- Server-side image-processing libs in request handlers (sharp/jimp at build time only).
- Analytics that capture pixel data or screenshots.
- "Save to cloud" features without explicit product discussion.
- Bundling models >50MB; fetch large models at runtime with progress UI.

## Workflow

- Read this file first.
- Check `README.md` for user-facing feature list and roadmap.
- New AI features follow the pattern in `lib/ai/upscaler.ts`: class with `init()`, `run(imageData)`, `dispose()`.
- Add a corresponding feature panel in `components/editor/panels/`.
- Verify `npm run build` passes before reporting work as done.

## Recent developer notes

Small maintenance applied:

- Added client-side i18n provider at `src/lib/i18n.tsx` and `public/translations.json`.
- Added `components/LanguageSwitcher.tsx` and wired it to the header via `app/layout.tsx` (centered header placement).
- Updated sample components to use `useI18n()` (`Hero.tsx`, `PrintCTA.tsx`).
- Fixed build-time ESLint issues (hook helper rename in `Editor.tsx`, escaped apostrophes, and added `@typescript-eslint` parser/plugin to devDependencies with `.eslintrc.json` updates).
