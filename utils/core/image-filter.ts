export type FilterType =
  | 'grayscale'
  | 'sepia'
  | 'invert'
  | 'blur'
  | 'brightness'
  | 'contrast'
  | 'saturate'
  | 'hue-rotate'
  | 'vintage'
  | 'cool'
  | 'warm';

export interface ImageFilter {
  type: FilterType;
  value: number;
}

export const FILTER_DEFAULTS: Record<FilterType, { min: number; max: number; default: number; unit: string }> = {
  grayscale: { min: 0, max: 100, default: 100, unit: '%' },
  sepia: { min: 0, max: 100, default: 100, unit: '%' },
  invert: { min: 0, max: 100, default: 100, unit: '%' },
  blur: { min: 0, max: 20, default: 5, unit: 'px' },
  brightness: { min: 0, max: 200, default: 100, unit: '%' },
  contrast: { min: 0, max: 200, default: 100, unit: '%' },
  saturate: { min: 0, max: 200, default: 100, unit: '%' },
  'hue-rotate': { min: 0, max: 360, default: 0, unit: 'deg' },
  vintage: { min: 0, max: 100, default: 50, unit: '%' },
  cool: { min: 0, max: 100, default: 50, unit: '%' },
  warm: { min: 0, max: 100, default: 50, unit: '%' },
};

export function buildCssFilterString(filters: ImageFilter[]): string {
  return filters
    .map((f) => {
      const unit = FILTER_DEFAULTS[f.type]?.unit ?? '';
      return `${f.type}(${f.value}${unit})`;
    })
    .join(' ');
}

export function applyFiltersToCanvas(
  ctx: CanvasRenderingContext2D,
  filters: ImageFilter[],
  source: HTMLImageElement | HTMLCanvasElement
): void {
  const filterString = buildCssFilterString(filters);
  ctx.filter = filterString;
  ctx.drawImage(source, 0, 0);
  ctx.filter = 'none';
}

export async function applyFiltersToImage(
  file: File,
  filters: ImageFilter[]
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      applyFiltersToCanvas(ctx, filters, img);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      }, file.type || 'image/png');
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export function applyPixelFilter(
  imageData: ImageData,
  filter: (r: number, g: number, b: number, a: number) => [number, number, number, number]
): ImageData {
  const { data, width, height } = imageData;
  const result = new ImageData(width, height);
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = filter(data[i], data[i + 1], data[i + 2], data[i + 3]);
    result.data[i] = Math.max(0, Math.min(255, r));
    result.data[i + 1] = Math.max(0, Math.min(255, g));
    result.data[i + 2] = Math.max(0, Math.min(255, b));
    result.data[i + 3] = a;
  }
  return result;
}

export function grayscale(r: number, g: number, b: number, a: number): [number, number, number, number] {
  const avg = 0.299 * r + 0.587 * g + 0.114 * b;
  return [avg, avg, avg, a];
}

export function sepia(r: number, g: number, b: number, a: number): [number, number, number, number] {
  return [
    Math.min(255, r * 0.393 + g * 0.769 + b * 0.189),
    Math.min(255, r * 0.349 + g * 0.686 + b * 0.168),
    Math.min(255, r * 0.272 + g * 0.534 + b * 0.131),
    a,
  ];
}

export function invert(r: number, g: number, b: number, a: number): [number, number, number, number] {
  return [255 - r, 255 - g, 255 - b, a];
}
