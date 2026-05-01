/**
 * Background removal using briaai/RMBG-1.4 ONNX.
 *
 * Pipeline:
 *  1. Resize input to 1024×1024 (RMBG's training resolution).
 *  2. Convert to NCHW float32 normalized to [0, 1] (RMBG-1.4's spec).
 *  3. Run inference; output is a 1×1×1024×1024 alpha mask in [0, 1].
 *  4. Resize the mask back to the original input dimensions, then apply it
 *     as the alpha channel of the original image. Result is a transparent
 *     PNG of just the foreground subject.
 *
 * Falls back to a passthrough that adds a fully-opaque alpha channel when
 * the model is unavailable.
 *
 * NOTE: RMBG-1.4 is licensed for non-commercial use without a Bria license.
 * For commercial deployment, either obtain a Bria license or swap the
 * manifest URL to a permissively licensed alternative (e.g. ISNet).
 */

import type { AIFeature, ProgressCallback } from './types';
import { loadSession } from './runtime';
import { MANIFESTS } from './manifest';
import { resizeImageData } from './tensor';

const MODEL_SIZE = 1024;

export class BackgroundRemover implements AIFeature {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  private inputName: string | null = null;
  private fallback = false;

  async init(onProgress?: ProgressCallback): Promise<void> {
    if (this.session || this.fallback) return;
    try {
      this.session = await loadSession(MANIFESTS['remove-bg'], onProgress);
      this.inputName = this.session.inputNames?.[0] ?? 'input';
    } catch (err) {
      console.warn('[bg-remover] model unavailable, using passthrough:', err);
      this.fallback = true;
    }
  }

  async run(input: ImageData, onProgress?: ProgressCallback): Promise<ImageData> {
    if (!this.session && !this.fallback) await this.init(onProgress);
    if (this.fallback) return passthroughAlpha(input);

    const ort = await import('onnxruntime-web');
    onProgress?.(0.2, 'Preparing image');

    const small = resizeImageData(input, MODEL_SIZE, MODEL_SIZE);
    const tensor = new Float32Array(3 * MODEL_SIZE * MODEL_SIZE);
    const planeSize = MODEL_SIZE * MODEL_SIZE;
    for (let i = 0; i < planeSize; i++) {
      const j = i * 4;
      tensor[i] = small.data[j] / 255;
      tensor[i + planeSize] = small.data[j + 1] / 255;
      tensor[i + 2 * planeSize] = small.data[j + 2] / 255;
    }

    onProgress?.(0.5, 'Segmenting subject');
    const inputTensor = new ort.Tensor('float32', tensor, [1, 3, MODEL_SIZE, MODEL_SIZE]);
    const result = await this.session.run({ [this.inputName!]: inputTensor });
    const outName = Object.keys(result)[0];
    const maskData = result[outName].data as Float32Array;

    // Pack the mask into an RGBA image so we can resize it via canvas.
    const maskAsImage = new Uint8ClampedArray(MODEL_SIZE * MODEL_SIZE * 4);
    for (let i = 0; i < planeSize; i++) {
      const a = clamp255(maskData[i] * 255);
      const j = i * 4;
      maskAsImage[j] = a;
      maskAsImage[j + 1] = a;
      maskAsImage[j + 2] = a;
      maskAsImage[j + 3] = 255;
    }
    const maskImage = new ImageData(maskAsImage, MODEL_SIZE, MODEL_SIZE);
    const fullMask = resizeImageData(maskImage, input.width, input.height);

    onProgress?.(0.9, 'Compositing');
    const out = new Uint8ClampedArray(input.data);
    for (let i = 0; i < out.length; i += 4) {
      // Use the red channel of the resized mask as the alpha (mask is grayscale).
      out[i + 3] = fullMask.data[i];
    }

    onProgress?.(1, 'Done');
    return new ImageData(out, input.width, input.height);
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

function passthroughAlpha(input: ImageData): ImageData {
  const out = new Uint8ClampedArray(input.data);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return new ImageData(out, input.width, input.height);
}
