/**
 * RGB ↔ CIELAB color-space conversion.
 *
 * Used by the colorizer pipeline: DDColor takes the L (luminance) channel and
 * predicts a/b (chrominance), which we recombine with the original L to
 * preserve detail and brightness.
 *
 * Reference: http://www.brucelindbloom.com/index.html?Eqn_RGB_to_XYZ.html
 *
 * Operates on Float32Array buffers in HWC layout where each channel is a
 * separate plane to keep arithmetic vectorizable.
 */

const REF_X = 0.95047;
const REF_Y = 1.0;
const REF_Z = 1.08883;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function f(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function fInv(t: number): number {
  const t3 = t * t * t;
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
}

/** RGB(0..1) → LAB. Returns three planar buffers L, a, b each of size W*H. */
export function rgbToLab(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
): { L: Float32Array; a: Float32Array; bch: Float32Array } {
  const n = r.length;
  const L = new Float32Array(n);
  const aOut = new Float32Array(n);
  const bOut = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lr = srgbToLinear(r[i]);
    const lg = srgbToLinear(g[i]);
    const lb = srgbToLinear(b[i]);
    const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / REF_X;
    const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175) / REF_Y;
    const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / REF_Z;
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);
    L[i] = 116 * fy - 16;
    aOut[i] = 500 * (fx - fy);
    bOut[i] = 200 * (fy - fz);
  }
  return { L, a: aOut, bch: bOut };
}

/** LAB → RGB(0..1). Inputs are planar. */
export function labToRgb(
  L: Float32Array,
  a: Float32Array,
  bch: Float32Array,
): { r: Float32Array; g: Float32Array; b: Float32Array } {
  const n = L.length;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const fy = (L[i] + 16) / 116;
    const fx = a[i] / 500 + fy;
    const fz = fy - bch[i] / 200;
    const x = fInv(fx) * REF_X;
    const y = fInv(fy) * REF_Y;
    const z = fInv(fz) * REF_Z;
    const lr = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
    const lg = x * -0.969266 + y * 1.8760108 + z * 0.041556;
    const lb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
    r[i] = clamp01(linearToSrgb(lr));
    g[i] = clamp01(linearToSrgb(lg));
    b[i] = clamp01(linearToSrgb(lb));
  }
  return { r, g, b };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Split an ImageData (RGBA) into 3 planar Float32Arrays in [0,1]. */
export function splitRgbPlanes(img: ImageData): {
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
} {
  const n = img.width * img.height;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    r[i] = img.data[j] / 255;
    g[i] = img.data[j + 1] / 255;
    b[i] = img.data[j + 2] / 255;
  }
  return { r, g, b };
}

/** Combine 3 planar [0,1] buffers back into an RGBA ImageData. */
export function combineRgbPlanes(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  width: number,
  height: number,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < r.length; i++) {
    const j = i * 4;
    data[j] = r[i] * 255;
    data[j + 1] = g[i] * 255;
    data[j + 2] = b[i] * 255;
    data[j + 3] = 255;
  }
  return new ImageData(data, width, height);
}
