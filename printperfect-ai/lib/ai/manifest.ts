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
    id: 'ddcolor-paper-tiny',
    url: env(
      'NEXT_PUBLIC_MODEL_COLORIZE_URL',
      'https://huggingface.co/onnx-community/ddcolor-paper-tiny/resolve/main/model.onnx',
    ),
    sizeMb: 86,
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
