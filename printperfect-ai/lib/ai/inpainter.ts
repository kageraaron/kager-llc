/**
 * Inpainting using LaMa ONNX.
 *
 * Caller convention: pixels with alpha < 128 in `input` are the regions to
 * fill. (Brush UI in the editor sets alpha=0 in masked areas.)
 *
 * Pipeline:
 *  1. If the manifest specifies a fixed `inputSize` (e.g. Carve's 512×512
 *     LaMa export), run the **smart-crop** path:
 *       a. Compute the bbox of the masked pixels and expand it with context.
 *       b. Square + clamp the bbox to the image, then scale to inputSize².
 *       c. Run the model on the scaled crop.
 *       d. Scale the result back to the crop size and composite **only the
 *          masked pixels** back into the original full-resolution image.
 *     This preserves print-quality detail everywhere outside the painted
 *     region (which is being replaced anyway).
 *  2. Otherwise (dynamic-shape export), pad to a multiple of 8 and run on
 *     the full image, as LaMa is fully convolutional.
 *
 * Input convention to the ONNX graph:
 *   - image: NCHW float32 RGB in [0,1]
 *   - mask:  N1HW float32 (1 = inpaint here, 0 = keep)
 */

import type { AIFeature, ProgressCallback, ModelManifest } from './types';
import { loadSession } from './runtime';
import { MANIFESTS } from './manifest';
import {
  imageDataToNCHW,
  imageDataAlphaToMask,
  nchwToImageData,
  padToMultiple,
  resizeImageData,
} from './tensor';

// Extra context (in original-image pixels) added around the masked bbox before
// scaling to the model's input size. More context → better fill blending,
// but coarser resolution inside the masked area after scale-back.
const CONTEXT_MARGIN_RATIO = 0.4;
// Absolute floor on the crop side length so very small masks still get a
// reasonable amount of context to condition on.
const MIN_CROP_SIDE = 256;

export class Inpainter implements AIFeature {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  private inputNames: string[] = [];
  private fallback = false;
  private manifest: ModelManifest = MANIFESTS.inpaint;

  async init(onProgress?: ProgressCallback): Promise<void> {
    if (this.session || this.fallback) return;
    try {
      this.session = await loadSession(this.manifest, onProgress);
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
    onProgress?.(0.2, 'Preparing image and mask');

    if (this.manifest.inputSize) {
      return await this.runFixedSize(input, this.manifest.inputSize, ort, onProgress);
    }
    return await this.runDynamic(input, ort, onProgress);
  }

  /** Fully-convolutional path: pad to multiple of 8 and run on the full image. */
  private async runDynamic(
    input: ImageData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ort: any,
    onProgress?: ProgressCallback,
  ): Promise<ImageData> {
    const { padded } = padToMultiple(input, 8);
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

    onProgress?.(1, 'Done');
    return crop(filledPadded, input.width, input.height);
  }

  /**
   * Fixed-input-size path: smart-crop around the mask, scale to N×N, run,
   * scale back, composite into the full-resolution original.
   */
  private async runFixedSize(
    input: ImageData,
    modelSize: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ort: any,
    onProgress?: ProgressCallback,
  ): Promise<ImageData> {
    const bbox = computeMaskBbox(input);
    if (!bbox) {
      // No masked pixels — nothing to do, return the input untouched.
      onProgress?.(1, 'No mask, skipping');
      return input;
    }

    const cropSpec = expandToSquareCrop(
      bbox,
      input.width,
      input.height,
      CONTEXT_MARGIN_RATIO,
      MIN_CROP_SIDE,
    );

    onProgress?.(0.35, 'Cropping context window');
    const cropped = extractRegion(input, cropSpec);

    // Scale crop to the model's expected square input.
    const scaled = resizeImageData(cropped, modelSize, modelSize);
    const imgTensor = imageDataToNCHW(scaled);
    const maskTensor = imageDataAlphaToMask(scaled);

    const feeds: Record<string, unknown> = {
      [this.inputNames[0] ?? 'image']: new ort.Tensor('float32', imgTensor, [
        1,
        3,
        modelSize,
        modelSize,
      ]),
      [this.inputNames[1] ?? 'mask']: new ort.Tensor('float32', maskTensor, [
        1,
        1,
        modelSize,
        modelSize,
      ]),
    };

    onProgress?.(0.6, 'Running LaMa');
    const result = await this.session.run(feeds);
    const outName = Object.keys(result)[0];
    const outData = result[outName].data as Float32Array;
    const outDims = result[outName].dims as number[];
    const filledScaled = nchwToImageData(outData, outDims[3], outDims[2]);

    // Scale model output back to the original crop size.
    const filledCrop = resizeImageData(filledScaled, cropSpec.width, cropSpec.height);

    // Composite only the masked pixels back into the full-resolution image.
    onProgress?.(0.9, 'Compositing');
    const out = compositeMaskedRegion(input, filledCrop, cropSpec);

    onProgress?.(1, 'Done');
    return out;
  }

  dispose() {
    this.session?.release?.();
    this.session = null;
    this.inputNames = [];
    this.fallback = false;
  }
}

// ---------- helpers ----------

type Rect = { x: number; y: number; width: number; height: number };

/** Find the tight bounding box of pixels with alpha < 128. Returns null if none. */
function computeMaskBbox(img: ImageData): Rect | null {
  const { data, width, height } = img;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[(row + x) * 4 + 3] < 128) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Grow `bbox` by `marginRatio` on every side, then square + clamp it to the image. */
function expandToSquareCrop(
  bbox: Rect,
  imgW: number,
  imgH: number,
  marginRatio: number,
  minSide: number,
): Rect {
  const margin = Math.max(bbox.width, bbox.height) * marginRatio;
  let side = Math.max(bbox.width + 2 * margin, bbox.height + 2 * margin, minSide);
  side = Math.min(side, imgW, imgH);
  side = Math.round(side);

  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  let x = Math.round(cx - side / 2);
  let y = Math.round(cy - side / 2);
  // Clamp inside image
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + side > imgW) x = imgW - side;
  if (y + side > imgH) y = imgH - side;
  return { x, y, width: side, height: side };
}

function extractRegion(src: ImageData, rect: Rect): ImageData {
  const c = new OffscreenCanvas(src.width, src.height);
  c.getContext('2d')!.putImageData(src, 0, 0);
  const dst = new OffscreenCanvas(rect.width, rect.height);
  dst.getContext('2d')!.drawImage(c, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return dst.getContext('2d')!.getImageData(0, 0, rect.width, rect.height);
}

/**
 * Replace, in `original`, the pixels that were masked (alpha < 128) inside
 * `rect` with the corresponding pixels from `filledCrop`. Pixels outside the
 * mask keep their original full-resolution values.
 */
function compositeMaskedRegion(original: ImageData, filledCrop: ImageData, rect: Rect): ImageData {
  const out = new Uint8ClampedArray(original.data); // copy
  const { width: W } = original;
  const { width: cw, height: ch, data: cdata } = filledCrop;
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const ox = rect.x + i;
      const oy = rect.y + j;
      const oi = (oy * W + ox) * 4;
      // Only overwrite pixels that the user marked for inpainting.
      if (original.data[oi + 3] < 128) {
        const ci = (j * cw + i) * 4;
        out[oi] = cdata[ci];
        out[oi + 1] = cdata[ci + 1];
        out[oi + 2] = cdata[ci + 2];
        out[oi + 3] = 255;
      }
    }
  }
  return new ImageData(out, original.width, original.height);
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
