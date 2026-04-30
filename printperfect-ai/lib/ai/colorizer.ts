/**
 * Photo colorization using DDColor ONNX.
 *
 * Pipeline:
 *  1. Resize input to 256×256 (model's training resolution).
 *  2. Convert RGB → LAB; the L channel becomes the model input.
 *  3. Model returns ab chrominance channels.
 *  4. Upscale ab back to original size, recombine with the *original* L
 *     (preserves full-resolution detail), convert LAB → RGB.
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

const MODEL_SIZE = 256;

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
      console.warn('[colorizer] model unavailable, using sepia fallback:', err);
      this.fallback = true;
    }
  }

  async run(input: ImageData, onProgress?: ProgressCallback): Promise<ImageData> {
    if (!this.session && !this.fallback) await this.init(onProgress);
    if (this.fallback) return sepiaFallback(input);

    const ort = await import('onnxruntime-web');
    onProgress?.(0.2, 'Preparing image');

    // 1. Resize to model input size for the L channel feed.
    const small = resizeImageData(input, MODEL_SIZE, MODEL_SIZE);
    const smallPlanes = splitRgbPlanes(small);
    const smallLab = rgbToLab(smallPlanes.r, smallPlanes.g, smallPlanes.b);

    // DDColor expects L normalized to [-1, 1] (L is in [0, 100]).
    const lTensor = new Float32Array(MODEL_SIZE * MODEL_SIZE);
    for (let i = 0; i < lTensor.length; i++) {
      lTensor[i] = smallLab.L[i] / 50 - 1;
    }

    onProgress?.(0.5, 'Running colorizer');
    const inputTensor = new ort.Tensor('float32', lTensor, [1, 1, MODEL_SIZE, MODEL_SIZE]);
    const result = await this.session.run({ [this.inputName!]: inputTensor });
    const outName = Object.keys(result)[0];
    const ab = result[outName].data as Float32Array; // [1,2,H,W]

    // 2. Extract a/b planes from model output (still at MODEL_SIZE).
    const planeSize = MODEL_SIZE * MODEL_SIZE;
    const aSmall = new Float32Array(planeSize);
    const bSmall = new Float32Array(planeSize);
    for (let i = 0; i < planeSize; i++) {
      // DDColor outputs ab in [-128, 127] range (or normalized; clamp for safety)
      aSmall[i] = ab[i];
      bSmall[i] = ab[i + planeSize];
    }

    // 3. Upscale ab to original size by drawing into an ImageData and resizing.
    const abAsImage = abPairToImageData(aSmall, bSmall, MODEL_SIZE, MODEL_SIZE);
    const abFull = resizeImageData(abAsImage, input.width, input.height);
    const { aFull, bFull } = imageDataToAbPair(abFull);

    onProgress?.(0.85, 'Recombining colors');

    // 4. Get L from the *original* high-res image to preserve detail.
    const fullPlanes = splitRgbPlanes(input);
    const fullLab = rgbToLab(fullPlanes.r, fullPlanes.g, fullPlanes.b);
    const rgb = labToRgb(fullLab.L, aFull, bFull);

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

/** Pack a/b planes into an RGBA image so we can use canvas resize. */
function abPairToImageData(
  a: Float32Array,
  b: Float32Array,
  w: number,
  h: number,
): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < a.length; i++) {
    const j = i * 4;
    // a/b are roughly in [-128, 127]; map to [0, 255] with offset 128
    data[j] = Math.max(0, Math.min(255, a[i] + 128));
    data[j + 1] = Math.max(0, Math.min(255, b[i] + 128));
    data[j + 2] = 0;
    data[j + 3] = 255;
  }
  return new ImageData(data, w, h);
}

function imageDataToAbPair(img: ImageData): { aFull: Float32Array; bFull: Float32Array } {
  const n = img.width * img.height;
  const aFull = new Float32Array(n);
  const bFull = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    aFull[i] = img.data[j] - 128;
    bFull[i] = img.data[j + 1] - 128;
  }
  return { aFull, bFull };
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
