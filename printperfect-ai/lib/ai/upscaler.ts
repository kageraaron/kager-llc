/**
 * 4× image upscaler using Real-ESRGAN ONNX.
 *
 * Pipeline:
 *  1. Tile input into TILE×TILE patches with OVERLAP px overlap (avoids
 *     visible seams from receptive-field edge effects).
 *  2. Convert each tile to NCHW float32 in [0,1].
 *  3. Run inference; output is 4× larger NCHW float32 in [0,1].
 *  4. Stitch tiles, dropping overlap halves so seams hide cleanly.
 *
 * If the model fails to load (network error, URL drift), we fall back to
 * high-quality canvas bilinear upscale so the UI keeps working.
 */

import type { AIFeature, ProgressCallback } from './types';
import { loadSession } from './runtime';
import { MANIFESTS } from './manifest';
import { imageDataToNCHW, nchwToImageData } from './tensor';
import { planTiles, extractTile } from '@/lib/image/tiling';

const TILE = 256;
const OVERLAP = 16;
const SCALE = 4;

export class Upscaler implements AIFeature {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  private inputName: string | null = null;
  private fallback = false;

  async init(onProgress?: ProgressCallback): Promise<void> {
    if (this.session || this.fallback) return;
    try {
      this.session = await loadSession(MANIFESTS.upscale, onProgress);
      this.inputName = this.session.inputNames?.[0] ?? 'input';
    } catch (err) {
      console.warn('[upscaler] model unavailable, using canvas fallback:', err);
      this.fallback = true;
    }
  }

  async run(input: ImageData, onProgress?: ProgressCallback): Promise<ImageData> {
    if (!this.session && !this.fallback) await this.init(onProgress);
    if (this.fallback) return canvasUpscale(input, SCALE);

    const ort = await import('onnxruntime-web');
    const tiles = planTiles(input.width, input.height, TILE, OVERLAP);
    const out = new OffscreenCanvas(input.width * SCALE, input.height * SCALE);
    const outCtx = out.getContext('2d')!;

    for (let i = 0; i < tiles.length; i++) {
      const spec = tiles[i];
      const tileImg = extractTile(input, spec);
      // Pad tile to TILE×TILE if it's an edge tile (most ESRGAN exports want fixed size).
      const padded = padTo(tileImg, TILE, TILE);
      const tensor = imageDataToNCHW(padded);
      const inputTensor = new ort.Tensor('float32', tensor, [1, 3, TILE, TILE]);
      const result = await this.session.run({ [this.inputName!]: inputTensor });
      const outName = Object.keys(result)[0];
      const outData = result[outName].data as Float32Array;
      const outDims = result[outName].dims as number[];
      const outImg = nchwToImageData(outData, outDims[3], outDims[2]);

      // Draw the relevant (un-padded × SCALE) region into the output canvas.
      const srcW = spec.width * SCALE;
      const srcH = spec.height * SCALE;
      const tmp = new OffscreenCanvas(outDims[3], outDims[2]);
      tmp.getContext('2d')!.putImageData(outImg, 0, 0);
      // Drop overlap on inner edges so seams are hidden.
      const overlapL = spec.x > 0 ? Math.floor((OVERLAP * SCALE) / 2) : 0;
      const overlapT = spec.y > 0 ? Math.floor((OVERLAP * SCALE) / 2) : 0;
      outCtx.drawImage(
        tmp,
        overlapL,
        overlapT,
        srcW - overlapL,
        srcH - overlapT,
        spec.x * SCALE + overlapL,
        spec.y * SCALE + overlapT,
        srcW - overlapL,
        srcH - overlapT,
      );

      onProgress?.((i + 1) / tiles.length, `Upscaling tile ${i + 1}/${tiles.length}`);
    }

    return outCtx.getImageData(0, 0, out.width, out.height);
  }

  dispose() {
    this.session?.release?.();
    this.session = null;
    this.inputName = null;
    this.fallback = false;
  }
}

function padTo(src: ImageData, w: number, h: number): ImageData {
  if (src.width === w && src.height === h) return src;
  const tmp = new OffscreenCanvas(src.width, src.height);
  tmp.getContext('2d')!.putImageData(src, 0, 0);
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(tmp, 0, 0);
  // Edge-replicate padding
  if (src.width < w) ctx.drawImage(tmp, src.width - 1, 0, 1, src.height, src.width, 0, w - src.width, src.height);
  if (src.height < h) ctx.drawImage(tmp, 0, src.height - 1, w, 1, 0, src.height, w, h - src.height);
  return ctx.getImageData(0, 0, w, h);
}

function canvasUpscale(input: ImageData, factor: number): ImageData {
  const src = new OffscreenCanvas(input.width, input.height);
  src.getContext('2d')!.putImageData(input, 0, 0);
  const dst = new OffscreenCanvas(input.width * factor, input.height * factor);
  const ctx = dst.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, dst.width, dst.height);
  return ctx.getImageData(0, 0, dst.width, dst.height);
}
