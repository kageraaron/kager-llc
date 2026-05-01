/**
 * Photo colorization using Zhang et al. ECCV 2016 ("Colorful Image Colorization").
 *
 * The model is a single-input regressor: it takes the **L** channel of a CIELAB
 * image and predicts the **a/b** chrominance channels. We then recombine the
 * predicted a/b with the *original* full-resolution L so detail is preserved
 * exactly — only color is contributed by the network.
 *
 * Pipeline:
 *  1. Convert original RGB → LAB and keep the L plane at full resolution.
 *  2. Resize the input to 256×256 (the model's training resolution) and take
 *     its L plane.
 *  3. Normalize: `(L − 50) / 100` (Zhang's `l_cent=50`, `l_norm=100`).
 *  4. Run model → predicted ab at 256×256, normalized by `ab_norm=110`.
 *  5. Denormalize: `ab × 110` → real CIELAB ab (typically [−110, 110]).
 *  6. Resize ab back to the original dimensions (chrominance is smooth, so
 *     bilinear is visually lossless here).
 *  7. Combine [original_L, predicted_a, predicted_b] → RGB.
 *
 * Reference: https://github.com/richzhang/colorization (the `eccv16.py` /
 * `util.py` pre/post-processing).
 *
 * Falls back to a sepia tint if the model fails to load.
 */

import type { AIFeature, ProgressCallback } from './types';
import { loadSession } from './runtime';
import { MANIFESTS } from './manifest';
import { resizeImageData } from './tensor';
import {
  rgbToLab,
  labToRgb,
  splitRgbPlanes,
  combineRgbPlanes,
} from '@/lib/image/lab';

// Zhang's published normalization constants. If you swap to SIGGRAPH17 weights,
// these stay the same — both colorizers share the same I/O convention.
const L_CENT = 50; // L is subtracted by this before normalization
const L_NORM = 100; // ...then divided by this
const AB_NORM = 110; // model's ab output is divided by 110 in training

const DEFAULT_INPUT_SIZE = 256;

export class Colorizer implements AIFeature {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  private inputName: string | null = null;
  private fallback = false;

  async init(onProgress?: ProgressCallback): Promise<void> {
    if (this.session || this.fallback) return;
    try {
      this.session = await loadSession(MANIFESTS.colorize, onProgress);
      this.inputName = this.session.inputNames?.[0] ?? 'input';
    } catch (err) {
      console.warn(
        '[colorizer] model unavailable, using sepia fallback:',
        err,
        '\n  Tried URL:',
        MANIFESTS.colorize.url,
        '\n  Drop eccv16.onnx into public/models/ or override',
        'NEXT_PUBLIC_MODEL_COLORIZE_URL.',
      );
      this.fallback = true;
    }
  }

  async run(input: ImageData, onProgress?: ProgressCallback): Promise<ImageData> {
    if (!this.session && !this.fallback) await this.init(onProgress);
    if (this.fallback) return sepiaFallback(input);

    const ort = await import('onnxruntime-web');
    const N = MANIFESTS.colorize.inputSize ?? DEFAULT_INPUT_SIZE;

    onProgress?.(0.2, 'Preparing image');

    // 1. Get original full-resolution L for later recombination.
    const origPlanes = splitRgbPlanes(input);
    const origLab = rgbToLab(origPlanes.r, origPlanes.g, origPlanes.b);

    // 2. Resize input to 256×256, extract its L plane, normalize.
    const small = resizeImageData(input, N, N);
    const smallPlanes = splitRgbPlanes(small);
    const smallLab = rgbToLab(smallPlanes.r, smallPlanes.g, smallPlanes.b);

    const lTensor = new Float32Array(N * N);
    for (let i = 0; i < lTensor.length; i++) {
      lTensor[i] = (smallLab.L[i] - L_CENT) / L_NORM;
    }

    // 3. Run model.
    onProgress?.(0.45, 'Running ECCV16 colorizer');
    const inputTensor = new ort.Tensor('float32', lTensor, [1, 1, N, N]);
    const result = await this.session.run({ [this.inputName!]: inputTensor });
    const outName = Object.keys(result)[0];
    const abRaw = result[outName].data as Float32Array; // [1, 2, N, N], normalized

    // 4. Denormalize ab and split into separate planes.
    const planeSize = N * N;
    const aSmall = new Float32Array(planeSize);
    const bSmall = new Float32Array(planeSize);
    for (let i = 0; i < planeSize; i++) {
      aSmall[i] = abRaw[i] * AB_NORM;
      bSmall[i] = abRaw[i + planeSize] * AB_NORM;
    }

    onProgress?.(0.75, 'Upscaling color');

    // 5. Pack ab into an RGBA image so we can use the canvas resampler, then
    //    upscale to the original dimensions and unpack.
    const abAsImage = packAbToImageData(aSmall, bSmall, N, N);
    const abFull = resizeImageData(abAsImage, input.width, input.height);
    const { aFull, bFull } = unpackAbFromImageData(abFull);

    onProgress?.(0.9, 'Recombining channels');

    // 6. Combine original L with model ab → RGB.
    const rgb = labToRgb(origLab.L, aFull, bFull);

    onProgress?.(1, 'Done');
    return combineRgbPlanes(rgb.r, rgb.g, rgb.b, input.width, input.height);
  }

  dispose() {
    this.session?.release?.();
    this.session = null;
    this.inputName = null;
    this.fallback = false;
  }
}

// ---------- helpers ----------

/**
 * Pack two ab planes (each in roughly [-110, 110]) into an RGBA image so
 * `resizeImageData` can resample them on the GPU. We use the full 0–255 range
 * mapped from [-AB_RANGE, AB_RANGE] so we don't lose dynamic range to clamping.
 */
const AB_RANGE = 128; // a hair over Zhang's typical ab amplitude; gives us headroom

function packAbToImageData(
  a: Float32Array,
  b: Float32Array,
  w: number,
  h: number,
): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < a.length; i++) {
    const j = i * 4;
    data[j] = mapToByte(a[i]);
    data[j + 1] = mapToByte(b[i]);
    data[j + 2] = 0;
    data[j + 3] = 255;
  }
  return new ImageData(data, w, h);
}

function unpackAbFromImageData(img: ImageData): {
  aFull: Float32Array;
  bFull: Float32Array;
} {
  const n = img.width * img.height;
  const aFull = new Float32Array(n);
  const bFull = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    aFull[i] = byteToFloat(img.data[j]);
    bFull[i] = byteToFloat(img.data[j + 1]);
  }
  return { aFull, bFull };
}

function mapToByte(v: number): number {
  // [-AB_RANGE, AB_RANGE] → [0, 255]
  const x = ((v + AB_RANGE) / (2 * AB_RANGE)) * 255;
  return x < 0 ? 0 : x > 255 ? 255 : x;
}

function byteToFloat(byte: number): number {
  return (byte / 255) * (2 * AB_RANGE) - AB_RANGE;
}

function sepiaFallback(input: ImageData): ImageData {
  const data = new Uint8ClampedArray(input.data);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    data[i] = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
    data[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
    data[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
  }
  return new ImageData(data, input.width, input.height);
}
