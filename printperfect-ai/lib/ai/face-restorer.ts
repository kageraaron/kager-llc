/**
 * Face restoration using GFPGAN ONNX.
 *
 * v1 pipeline (single-face / portrait mode):
 *  1. Resize input to 512×512 (GFPGAN's training resolution).
 *  2. Convert to NCHW float32 in [-1, 1] (GFPGAN's expected normalization).
 *  3. Run inference; output is also NCHW float32 [-1, 1] at 512×512.
 *  4. Map back to [0, 1], rebuild ImageData, then resize to the original
 *     input dimensions.
 *
 * v2 (TODO): integrate a face detector (RetinaFace or MediaPipe) to crop
 * faces, restore each, and paste them back into the original at full
 * resolution. For now this works best on portraits where the face fills
 * the frame.
 *
 * Falls back to a sharpening kernel if the model fails to load.
 */

import type { AIFeature, ProgressCallback } from './types';
import { loadSession } from './runtime';
import { MANIFESTS } from './manifest';
import { resizeImageData } from './tensor';

const MODEL_SIZE = 512;

export class FaceRestorer implements AIFeature {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  private inputName: string | null = null;
  private fallback = false;

  async init(onProgress?: ProgressCallback): Promise<void> {
    if (this.session || this.fallback) return;
    try {
      this.session = await loadSession(MANIFESTS.restore, onProgress);
      this.inputName = this.session.inputNames?.[0] ?? 'input';
    } catch (err) {
      console.warn('[face-restorer] model unavailable, using sharpen fallback:', err);
      this.fallback = true;
    }
  }

  async run(input: ImageData, onProgress?: ProgressCallback): Promise<ImageData> {
    if (!this.session && !this.fallback) await this.init(onProgress);
    if (this.fallback) return sharpenFallback(input);

    const ort = await import('onnxruntime-web');
    onProgress?.(0.2, 'Preparing image');

    const small = resizeImageData(input, MODEL_SIZE, MODEL_SIZE);
    // GFPGAN normalization: pixels [0, 255] → [-1, 1].
    const tensor = new Float32Array(3 * MODEL_SIZE * MODEL_SIZE);
    const planeSize = MODEL_SIZE * MODEL_SIZE;
    for (let i = 0; i < planeSize; i++) {
      const j = i * 4;
      tensor[i] = small.data[j] / 127.5 - 1;
      tensor[i + planeSize] = small.data[j + 1] / 127.5 - 1;
      tensor[i + 2 * planeSize] = small.data[j + 2] / 127.5 - 1;
    }

    onProgress?.(0.5, 'Restoring face');
    const inputTensor = new ort.Tensor('float32', tensor, [1, 3, MODEL_SIZE, MODEL_SIZE]);
    const result = await this.session.run({ [this.inputName!]: inputTensor });
    const outName = Object.keys(result)[0];
    const outData = result[outName].data as Float32Array;

    // Map [-1, 1] → [0, 255] and rebuild ImageData at MODEL_SIZE.
    const restored = new Uint8ClampedArray(MODEL_SIZE * MODEL_SIZE * 4);
    for (let i = 0; i < planeSize; i++) {
      const j = i * 4;
      restored[j] = clamp255((outData[i] + 1) * 127.5);
      restored[j + 1] = clamp255((outData[i + planeSize] + 1) * 127.5);
      restored[j + 2] = clamp255((outData[i + 2 * planeSize] + 1) * 127.5);
      restored[j + 3] = 255;
    }
    const restoredImage = new ImageData(restored, MODEL_SIZE, MODEL_SIZE);

    onProgress?.(0.9, 'Resizing');
    const final =
      input.width === MODEL_SIZE && input.height === MODEL_SIZE
        ? restoredImage
        : resizeImageData(restoredImage, input.width, input.height);
    onProgress?.(1, 'Done');
    return final;
  }

  dispose() {
    this.session?.release?.();
    this.session = null;
    this.inputName = null;
    this.fallback = false;
  }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Unsharp mask fallback: convolve a 3×3 sharpening kernel.
 * Modest visual improvement; no detail invented (unlike the real model).
 */
function sharpenFallback(input: ImageData): ImageData {
  const { data, width, height } = input;
  const out = new Uint8ClampedArray(data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            acc += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        out[(y * width + x) * 4 + c] = clamp255(acc);
      }
    }
  }
  return new ImageData(out, width, height);
}
