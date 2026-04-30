/** Canvas helpers shared across the editor and AI modules. */

export async function fileToBitmap(file: File): Promise<ImageBitmap> {
  return await createImageBitmap(file);
}

export function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

export async function imageDataToBitmap(data: ImageData): Promise<ImageBitmap> {
  const c = new OffscreenCanvas(data.width, data.height);
  c.getContext('2d')!.putImageData(data, 0, 0);
  return await createImageBitmap(c);
}

export async function bitmapToBlob(
  bitmap: ImageBitmap,
  type: 'image/png' | 'image/jpeg' = 'image/png',
  quality = 0.95,
): Promise<Blob> {
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  c.getContext('2d')!.drawImage(bitmap, 0, 0);
  return await c.convertToBlob({ type, quality });
}
