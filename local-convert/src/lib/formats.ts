/**
 * Central catalog of supported formats and conversions.
 * Mirrors the capabilities of src/lib/converters/*.ts.
 *
 * Used by the Converter UI to render per-file format pickers
 * and to validate that a chosen conversion is actually wired up.
 */

export type FormatKind = 'image' | 'media' | 'document';

export interface FormatInfo {
  /** Canonical uppercase code (e.g. "PNG") */
  code: string;
  /** User-facing label */
  label: string;
  /** Type group used for routing the conversion */
  kind: FormatKind;
  /** All file extensions that should be treated as this format (lowercase, no dot) */
  extensions: string[];
  /** MIME type hints used for input acceptance */
  mimes: string[];
}

export const FORMATS: FormatInfo[] = [
  // Images
  { code: 'PNG',  label: 'PNG',  kind: 'image', extensions: ['png'],         mimes: ['image/png'] },
  { code: 'JPG',  label: 'JPG',  kind: 'image', extensions: ['jpg', 'jpeg'], mimes: ['image/jpeg'] },
  { code: 'WEBP', label: 'WebP', kind: 'image', extensions: ['webp'],        mimes: ['image/webp'] },
  { code: 'HEIC', label: 'HEIC', kind: 'image', extensions: ['heic', 'heif'],mimes: ['image/heic', 'image/heif'] },
  { code: 'SVG',  label: 'SVG',  kind: 'image', extensions: ['svg'],         mimes: ['image/svg+xml'] },
  { code: 'TIFF', label: 'TIFF', kind: 'image', extensions: ['tif', 'tiff'], mimes: ['image/tiff'] },

  // Media
  { code: 'MP4',  label: 'MP4',  kind: 'media', extensions: ['mp4'],  mimes: ['video/mp4'] },
  { code: 'MOV',  label: 'MOV',  kind: 'media', extensions: ['mov'],  mimes: ['video/quicktime'] },
  { code: 'WEBM', label: 'WebM', kind: 'media', extensions: ['webm'], mimes: ['video/webm'] },
  { code: 'GIF',  label: 'GIF',  kind: 'media', extensions: ['gif'],  mimes: ['image/gif'] },
  { code: 'MP3',  label: 'MP3',  kind: 'media', extensions: ['mp3'],  mimes: ['audio/mpeg'] },
  { code: 'WAV',  label: 'WAV',  kind: 'media', extensions: ['wav'],  mimes: ['audio/wav', 'audio/x-wav'] },

  // Documents
  { code: 'PDF',  label: 'PDF',  kind: 'document', extensions: ['pdf'], mimes: ['application/pdf'] },
];

const FORMAT_BY_CODE: Record<string, FormatInfo> = Object.fromEntries(
  FORMATS.map((f) => [f.code, f])
);

const FORMAT_BY_EXT: Record<string, FormatInfo> = Object.fromEntries(
  FORMATS.flatMap((f) => f.extensions.map((ext) => [ext, f]))
);

export function getFormat(code: string): FormatInfo | undefined {
  return FORMAT_BY_CODE[code.toUpperCase()];
}

export function detectFormat(file: File): FormatInfo | undefined {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (FORMAT_BY_EXT[ext]) return FORMAT_BY_EXT[ext];
  const mime = file.type.toLowerCase();
  return FORMATS.find((f) => f.mimes.includes(mime));
}

const IMAGE_CODES = FORMATS.filter((f) => f.kind === 'image').map((f) => f.code);
const MEDIA_CODES = FORMATS.filter((f) => f.kind === 'media').map((f) => f.code);

/**
 * Given a source format, return the list of valid output formats.
 * This must stay in sync with the routing logic in Converter.tsx.
 */
export function getValidTargets(fromCode: string): string[] {
  const from = getFormat(fromCode);
  if (!from) return [];

  const targets = new Set<string>();

  if (from.kind === 'image') {
    // Image -> Image (any other image format)
    IMAGE_CODES.filter((c) => c !== from.code).forEach((c) => targets.add(c));
    // Image -> PDF
    targets.add('PDF');
  }

  if (from.kind === 'media') {
    // Media -> Media (any other media format)
    MEDIA_CODES.filter((c) => c !== from.code).forEach((c) => targets.add(c));
  }

  if (from.code === 'PDF') {
    // PDF -> raster images
    targets.add('JPG');
    targets.add('PNG');
  }

  return Array.from(targets);
}

export function isConversionSupported(from: string, to: string): boolean {
  return getValidTargets(from).includes(to.toUpperCase());
}

/** Build an `accept` string for <input type="file"> based on supported source formats. */
export function buildAcceptAttribute(): string {
  const exts = FORMATS.flatMap((f) => f.extensions.map((e) => `.${e}`));
  const mimes = FORMATS.flatMap((f) => f.mimes);
  return [...exts, ...mimes].join(',');
}

/** Curated list of high-traffic conversions surfaced on the homepage. */
export interface ConversionCategory {
  name: string;
  description: string;
  conversions: { from: string; to: string }[];
}

export const CONVERSION_CATEGORIES: ConversionCategory[] = [
  {
    name: 'Images',
    description: 'Lossless, in-browser image conversion across the formats you use every day.',
    conversions: [
      { from: 'HEIC', to: 'JPG' },
      { from: 'HEIC', to: 'PNG' },
      { from: 'WEBP', to: 'PNG' },
      { from: 'WEBP', to: 'JPG' },
      { from: 'PNG',  to: 'JPG' },
      { from: 'JPG',  to: 'PNG' },
      { from: 'SVG',  to: 'PNG' },
      { from: 'TIFF', to: 'PNG' },
    ],
  },
  {
    name: 'Video & Audio',
    description: 'Re-encode video, extract audio, or build a GIF — all locally with FFmpeg.wasm.',
    conversions: [
      { from: 'MP4',  to: 'MP3' },
      { from: 'WAV',  to: 'MP3' },
      { from: 'MOV',  to: 'MP4' },
      { from: 'WEBM', to: 'MP4' },
      { from: 'MP4',  to: 'GIF' },
    ],
  },
  {
    name: 'Documents',
    description: 'Build PDFs from images or rasterise PDF pages — without uploading a thing.',
    conversions: [
      { from: 'PDF', to: 'JPG' },
      { from: 'PDF', to: 'PNG' },
      { from: 'JPG', to: 'PDF' },
      { from: 'PNG', to: 'PDF' },
    ],
  },
];
