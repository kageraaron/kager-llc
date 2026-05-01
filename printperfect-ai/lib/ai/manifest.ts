/**
 * Central catalog of model URLs.
 *
 * Models are hosted on Hugging Face Hub — free, unlimited bandwidth, no
 * server-side cost on our end. Each URL can be overridden with an env var so
 * we can swap models without code changes.
 *
 * If you're forking or self-hosting: the only requirement is that the URL
 * serves the raw .onnx file with permissive CORS. Hugging Face's
 * `*.huggingface.co/.../resolve/main/...` URLs satisfy this.
 *
 * Sourcing notes:
 *  - Real-ESRGAN x4 was released by Xinntao under BSD-3 in 2021. ONNX exports
 *    are widely available on HF; we use the FP16 variant for ~½ the bandwidth.
 *  - DDColor was released by Alibaba (2022, Apache 2.0). The "tiny" variant
 *    is small enough to ship over the wire reasonably.
 *  - LaMa was released by Samsung (2021, Apache 2.0). Carve maintains a
 *    well-tested ONNX export.
 *
 * If a URL 404s in the future, swap to any HF mirror that serves the same
 * model architecture — preprocessing in lib/ai/{module}.ts will still apply.
 */

import type { ModelManifest } from './types';

const env = (key: string, fallback: string) =>
  (typeof process !== 'undefined' && process.env?.[key]) || fallback;

export const MANIFESTS: Record<
  'upscale' | 'colorize' | 'inpaint' | 'restore' | 'remove-bg',
  ModelManifest
> = {
  upscale: {
    id: 'real-esrgan-x4plus-fp16',
    url: env(
      'NEXT_PUBLIC_MODEL_UPSCALE_URL',
      'https://huggingface.co/Xenova/Real-ESRGAN-x4plus/resolve/main/onnx/model_fp16.onnx',
    ),
    sizeMb: 33,
  },
  colorize: {
    // Zhang ECCV16 "Colorful Image Colorization" — the classic L → ab regressor.
    // ~129 MB, trained at 256×256. Output is more saturated than SIGGRAPH17,
    // which is what we want for the "full spectrum RGB" goal.
    //
    // The ONNX file is too big for git. Two ways to host it:
    //   (a) Local dev only: run `python scripts/export-eccv16-onnx.py` once
    //       and the file lands at `public/models/eccv16.onnx`. The default
    //       URL below ('/models/eccv16.onnx') resolves to that file.
    //   (b) Production: upload the .onnx as a GitHub Release asset (or to
    //       any CORS-enabled CDN), then set NEXT_PUBLIC_MODEL_COLORIZE_URL
    //       to its public URL. The runtime caches it via the Cache API on
    //       first use, so each browser only downloads it once.
    id: 'eccv16',
    url: env('NEXT_PUBLIC_MODEL_COLORIZE_URL', '/models/eccv16.onnx'),
    sizeMb: 129,
    // Zhang's training resolution. The model is fully convolutional in PyTorch,
    // but ONNX exports typically pin it; we export at 256 to match. Plenty for
    // chrominance because we recombine the ab output with the *original* L.
    inputSize: 256,
  },
  inpaint: {
    id: 'lama-fp32',
    url: env(
      'NEXT_PUBLIC_MODEL_INPAINT_URL',
      'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
    ),
    sizeMb: 196,
    // Carve's LaMa export bakes in 512×512 input dims. Inputs of any other
    // size will fail with `Got invalid dimensions for input: image`.
    inputSize: 512,
  },
  restore: {
    id: 'gfpgan-v1.4',
    url: env(
      'NEXT_PUBLIC_MODEL_RESTORE_URL',
      'https://huggingface.co/Xenova/gfpgan/resolve/main/onnx/model.onnx',
    ),
    sizeMb: 333,
  },
  'remove-bg': {
    id: 'rmbg-1.4',
    url: env(
      'NEXT_PUBLIC_MODEL_REMOVE_BG_URL',
      'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx',
    ),
    sizeMb: 176,
  },
};
