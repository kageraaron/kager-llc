/**
 * Tensor utilities for converting between ImageData (RGBA, uint8 [0,255])
 * and the NCHW float32 layout most ONNX vision models expect.
 *
 * All functions operate on plain TypedArrays so they're worker-safe.
 */

/**
 * Convert an ImageData buffer (HWC uint8 RGBA) to NCHW float32 RGB,
 * normalized to [0, 1]. Drops the alpha channel.
 */
export function imageDataToNCHW(img: ImageData): Float32Array {
  const { data, width, height } = img;
  const chw = new Float32Array(3 * width * height);
  const planeSize = width * height;
  for (let i = 0; i < planeSize; i++) {
    const j = i * 4;
    chw[i] = data[j] / 255; // R
    chw[i + planeSize] = data[j + 1] / 255; // G
    chw[i + 2 * planeSize] = data[j + 2] / 255; // B
  }
  return chw;
}

/**
 * Inverse: NCHW float32 RGB in [0, 1] back into an ImageData (RGBA uint8).
 */
export function nchwToImageData(
  tensor: Float32Array,
  width: number,
  height: number,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const planeSize = width * height;
  for (let i = 0; i < planeSize; i++) {
    const j = i * 4;
    data[j] = clamp255(tensor[i] * 255);
    data[j + 1] = clamp255(tensor[i + planeSize] * 255);
    data[j + 2] = clamp255(tensor[i + 2 * planeSize] * 255);
    data[j + 3] = 255;
  }
  return new ImageData(data, width, height);
}

/** Single-channel HWC uint8 → NCHW float32 in [0, 1]. */
export function imageDataAlphaToMask(img: ImageData): Float32Array {
  const { data, width, height } = img;
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    // Alpha < 128 means "inpaint here" → 1.0; else 0.0
    out[i] = data[i * 4 + 3] < 128 ? 1 : 0;
  }
  return out;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Resize an ImageData to a new size using OffscreenCanvas (high-quality bilinear). */
export function resizeImageData(src: ImageData, w: number, h: number): ImageData {
  const tmp = new OffscreenCanvas(src.width, src.height);
  tmp.getContext('2d')!.putImageData(src, 0, 0);
  const dst = new OffscreenCanvas(w, h);
  const ctx = dst.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Pad an ImageData up to the next multiple of `mod` on each axis. */
export function padToMultiple(
  src: ImageData,
  mod: number,
): { padded: ImageData; padW: number; padH: number } {
  const padW = (mod - (src.width % mod)) % mod;
  const padH = (mod - (src.height % mod)) % mod;
  if (!padW && !padH) return { padded: src, padW: 0, padH: 0 };
  const c = new OffscreenCanvas(src.width + padW, src.height + padH);
  const ctx = c.getContext('2d')!;
  // Copy original
  const tmp = new OffscreenCanvas(src.width, src.height);
  tmp.getContext('2d')!.putImageData(src, 0, 0);
  ctx.drawImage(tmp, 0, 0);
  // Edge-replicate the padded strip (avoids seams in models that don't like black borders)
  if (padW) ctx.drawImage(tmp, src.width - 1, 0, 1, src.height, src.width, 0, padW, src.height);
  if (padH)
    ctx.drawImage(
      tmp,
      0,
      src.height - 1,
      src.width + padW,
      1,
      0,
      src.height,
      src.width + padW,
      padH,
    );
  return { padded: ctx.getImageData(0, 0, c.width, c.height), padW, padH };
}
