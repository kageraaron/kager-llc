export interface CompressionOptions {
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  width: number;
  height: number;
}

export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const { quality = 0.8, maxWidth, maxHeight, mimeType = 'image/jpeg' } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = { width: img.width, height: img.height };

      if (maxWidth && width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (maxHeight && height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const originalSize = file.size;
            const compressedSize = blob.size;
            resolve({
              blob,
              originalSize,
              compressedSize,
              compressionRatio: Math.round((1 - compressedSize / originalSize) * 100),
              width,
              height,
            });
          } else {
            reject(new Error('Failed to create compressed blob'));
          }
        },
        mimeType,
        quality
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export async function compressImageToTarget(
  file: File,
  targetSizeBytes: number,
  mimeType: 'image/jpeg' | 'image/webp' = 'image/jpeg'
): Promise<CompressionResult> {
  let low = 0.01;
  let high = 1.0;
  let bestResult: CompressionResult | null = null;

  for (let i = 0; i < 10; i++) {
    const quality = (low + high) / 2;
    const result = await compressImage(file, { quality, mimeType });

    if (result.compressedSize > targetSizeBytes) {
      high = quality;
    } else {
      low = quality;
      bestResult = result;
    }
  }

  if (!bestResult) {
    return compressImage(file, { quality: 0.01, mimeType });
  }

  return bestResult;
}

export function estimateFileSize(width: number, height: number, quality: number): number {
  const pixels = width * height;
  const bytesPerPixel = 3 * quality;
  const compressionFactor = 0.15;
  return Math.round(pixels * bytesPerPixel * compressionFactor);
}
