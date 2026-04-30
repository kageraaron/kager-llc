# PrintPerfect.ai

> Free, browser-based AI photo enhancement — upscale, colorize, and restore your images, then turn them into wall-ready prints shipped worldwide.

PrintPerfect.ai is a **fully client-side** AI image editor. Every model runs in your browser via WebGPU/WASM — your photos never leave your device. When you're happy with the result, one click sends the finished image to our print partner, who produces and ships canvas, framed, and metal prints to your door.

## Why client-side?

- **Privacy.** Photos never touch a server. Family memories, portraits, and personal photos stay on your machine.
- **Cost.** No GPU bills means we can offer the editor for free and earn revenue purely from print fulfillment.
- **Speed.** No upload/download round trips. WebGPU is fast enough on modern laptops to upscale a 12MP photo in seconds.
- **Offline-capable.** Models cache after first download; the editor works offline once warmed up.

## Features

| Feature | Status | Model |
|---|---|---|
| 4x AI upscaling | Planned | Real-ESRGAN (ONNX) |
| Photo colorization | Planned | DDColor (ONNX) |
| Inpainting / object removal | Planned | LaMa (ONNX) |
| Face restoration | Planned | GFPGAN (ONNX) |
| Background removal | Planned | RMBG-1.4 (Transformers.js) |
| Watermark removal | TODO Implement | TODO Source
| Upload entire album to editor; persist state of changes to each photo, order entire albums | TODO IMPLEMENT PLAN | TODO
| Print-on-demand checkout | Planned | Printify API |

## Tech stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **Styling:** Tailwind CSS
- **AI runtime:** ONNX Runtime Web with WebGPU backend (WASM fallback)
- **Image processing:** Canvas 2D API + OffscreenCanvas in Web Workers
- **Print fulfillment:** Printify REST API
- **Hosting target:** Vercel (edge for marketing pages, static for editor)

## Monetization

Editing is **free forever**. Revenue comes from a markup on every print sold through the integrated checkout. No subscriptions, no watermarks, no resolution caps.

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

### Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
PRINTIFY_API_TOKEN=...
PRINTIFY_SHOP_ID=...
```

(Required only for the print-checkout flow; the editor itself runs without any env vars.)

## Project structure

```
printperfect-ai/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Landing page
│   ├── editor/            # Editor app
│   └── api/printify/      # Printify webhook + checkout routes
├── components/            # React components (editor canvas, toolbars, etc.)
├── lib/
│   ├── ai/                # ONNX model loaders + inference wrappers
│   ├── image/             # Canvas helpers, tiling, color-space conversion
│   └── printify/          # Printify SDK wrapper
├── public/
│   └── models/            # Cached ONNX model files (gitignored if large)
└── workers/               # Web Workers for off-main-thread inference
```

## Roadmap

1. **MVP (v0.1):** Upscaling + Printify canvas/poster checkout
2. **v0.2:** Colorization + face restoration
3. **v0.3:** Inpainting (object removal)
4. **v0.4:** Background removal + transparent PNG export
5. **v1.0:** Multi-supplier print routing (Prodigi for fine-art, Gelato for EU)

## License

Proprietary — Kager LLC. All rights reserved.
