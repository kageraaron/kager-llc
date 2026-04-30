/**
 * Inpainting using LaMa ONNX.
 *
 * Caller convention: pixels with alpha < 128 in `input` are the regions to
 * fill. (Brush UI in the editor sets alpha=0 in masked areas.)
 *
 * Pipeline:
 *  1. Pad image and mask to multiples of 8 (LaMa is convolutional and prefers
 *     padded inputs).
 *  2. Image → NCHW float32 [0,1]. Mask → N1HW float32 (1=inpaint, 0=keep).
 *  3. session.run({ image, mask }) → filled image.
 *  4. Crop back to original dimensions.
 */

import type { AIFeature, ProgressCallback } from './types';
import { loadSession } from './runtime';
import { MANIFESTS } from './manifest';
import {
  imageDataToNCHW,
  imageDataAlphaToMask,
  nchwToImageData,
  padToMultiple,
} from './tensor';

export class Inpainter implements AIFeature {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  private inputNames: string[] = [];
  private fallback = false;

  async init(onProgress?: ProgressCallback): Promise<void> {
    if (this.session || this.fallback) return;
    try {
      this.session = await loadSession(MANIFESTS.inpaint, onProgress);
      this.inputNames = this.session.inputNames ?? ['image', 'mask'];
    } catch (err) {
      console.warn('[inpainter] model unavailable, using passthrough:', err);
      this.fallback = true;
    }
  }

  async run(input: ImageData, onProgress?: ProgressCallback): Promise<ImageData> {
    if (!this.session && !this.fallback) await this.init(onProgress);
    if (this.fallback) {
      // Fill masked regions with the average color so the user sees *something*.
      return averageColorFallback(input);
    }

    const ort = await import('onnxruntime-web');
    onProgress?.(0.3, 'Preparing image and mask');

    const { padded, padW, padH } = padToMultiple(input, 8);
    const W = padded.width;
    const H = padded.height;
    const imgTensor = imageDataToNCHW(padded);
    const maskTensor = imageDataAlphaToMask(padded);

    const feeds: Record<string, unknown> = {
      [this.inputNames[0] ?? 'image']: new ort.Tensor('float32', imgTensor, [1, 3, H, W]),
      [this.inputNames[1] ?? 'mask']: new ort.Tensor('float32', maskTensor, [1, 1, H, W]),
    };

    onProgress?.(0.6, 'Running LaMa');
    const result = await this.session.run(feeds);
    const outName = Object.keys(result)[0];
    const outData = result[outName].data as Float32Array;
    const outDims = result[outName].dims as number[];
    const filledPadded = nchwToImageData(outData, outDims[3], outDims[2]);

    // Crop back to original size.
    const cropped = crop(filledPadded, input.width, input.height);
    onProgress?.(1, 'Done');
    return cropped;
  }

  dispose() {
    this.session?.release?.();
    this.session = null;
    this.inputNames = [];
    this.fallback = false;
  }
}

function crop(src: ImageData, w: number, h: number): ImageData {
  if (src.width === w && src.height === h) return src;
  const tmp = new OffscreenCanvas(src.width, src.height);
  tmp.getContext('2d')!.putImageData(src, 0, 0);
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d')!.drawImage(tmp, 0, 0);
  return c.getContext('2d')!.getImageData(0, 0, w, h);
}

function averageColorFallback(input: ImageData): ImageData {
  let r = 0,
    g = 0,
    b = 0,
    count = 0;
  for (let i = 0; i < input.data.length; i += 4) {
    if (input.data[i + 3] >= 128) {
      r += input.data[i];
      g += input.data[i + 1];
      b += input.data[i + 2];
      count++;
    }
  }
  if (count === 0) return input;
  r = r / count;
  g = g / count;
  b = b / count;
  const data = new Uint8ClampedArray(input.data);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, input.width, input.height);
}
