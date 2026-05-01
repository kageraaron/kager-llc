export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

export interface CmykColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

export interface ColorInfo {
  hex: string;
  hex8: string;
  rgb: RgbColor;
  hsl: HslColor;
  hsv: HsvColor;
  cmyk: CmykColor;
  name?: string;
  luminance: number;
  isDark: boolean;
  complementary: string;
  analogous: string[];
  triadic: string[];
}

export function hexToRgb(hex: string): RgbColor | null {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6) return null;

  const num = parseInt(hex, 16);
  if (isNaN(num)) return null;

  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

export function rgbToHex(rgb: RgbColor): string {
  return '#' + ((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1).toUpperCase();
}

export function rgbToHsl(rgb: RgbColor): HslColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToRgb(hsl: HslColor): RgbColor {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

export function rgbToHsv(rgb: RgbColor): HsvColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const v = max;
  const s = max === 0 ? 0 : d / max;

  if (max !== min) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
}

export function rgbToCmyk(rgb: RgbColor): CmykColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const k = 1 - Math.max(r, g, b);

  if (k === 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }

  return {
    c: Math.round(((1 - r - k) / (1 - k)) * 100),
    m: Math.round(((1 - g - k) / (1 - k)) * 100),
    y: Math.round(((1 - b - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

export function getRelativeLuminance(rgb: RgbColor): number {
  const [rs, gs, bs] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function getColorInfo(hex: string): ColorInfo | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const hsl = rgbToHsl(rgb);
  const hsv = rgbToHsv(rgb);
  const cmyk = rgbToCmyk(rgb);
  const luminance = getRelativeLuminance(rgb);

  const complementaryHue = (hsl.h + 180) % 360;
  const analogousHues = [(hsl.h - 30 + 360) % 360, (hsl.h + 30) % 360];
  const triadicHues = [(hsl.h + 120) % 360, (hsl.h + 240) % 360];

  const toHexFromHue = (hue: number) => rgbToHex(hslToRgb({ h: hue, s: hsl.s, l: hsl.l }));

  return {
    hex: rgbToHex(rgb),
    hex8: rgbToHex(rgb) + 'FF',
    rgb,
    hsl,
    hsv,
    cmyk,
    luminance,
    isDark: luminance < 0.5,
    complementary: toHexFromHue(complementaryHue),
    analogous: analogousHues.map(toHexFromHue),
    triadic: triadicHues.map(toHexFromHue),
  };
}

export function randomColor(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return rgbToHex({ r: bytes[0], g: bytes[1], b: bytes[2] });
}

export function generatePalette(baseHex: string, count: number = 5): string[] {
  const info = getColorInfo(baseHex);
  if (!info) return [];

  const palette: string[] = [info.hex];
  const step = 360 / count;

  for (let i = 1; i < count; i++) {
    const hue = (info.hsl.h + step * i) % 360;
    const rgb = hslToRgb({ h: hue, s: info.hsl.s, l: info.hsl.l });
    palette.push(rgbToHex(rgb));
  }

  return palette;
}

export function mixColors(hex1: string, hex2: string, ratio: number = 0.5): string {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return hex1;

  const r = Math.round(rgb1.r * (1 - ratio) + rgb2.r * ratio);
  const g = Math.round(rgb1.g * (1 - ratio) + rgb2.g * ratio);
  const b = Math.round(rgb1.b * (1 - ratio) + rgb2.b * ratio);

  return rgbToHex({ r, g, b });
}
