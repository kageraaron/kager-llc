/**
 * Helpers for splitting a large image into overlapping tiles for inference,
 * and stitching the results back together. Required because WebGPU has VRAM
 * limits and most upscalers are trained at 256×256 or 512×512.
 */

export type TileSpec = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function planTiles(
  imgWidth: number,
  imgHeight: number,
  tileSize = 256,
  overlap = 16,
): TileSpec[] {
  const stride = tileSize - overlap;
  const tiles: TileSpec[] = [];
  for (let y = 0; y < imgHeight; y += stride) {
    for (let x = 0; x < imgWidth; x += stride) {
      tiles.push({
        x,
        y,
        width: Math.min(tileSize, imgWidth - x),
        height: Math.min(tileSize, imgHeight - y),
      });
      if (x + tileSize >= imgWidth) break;
    }
    if (y + tileSize >= imgHeight) break;
  }
  return tiles;
}

export function extractTile(src: ImageData, spec: TileSpec): ImageData {
  const c = new OffscreenCanvas(src.width, src.height);
  const ctx = c.getContext('2d')!;
  ctx.putImageData(src, 0, 0);
  return ctx.getImageData(spec.x, spec.y, spec.width, spec.height);
}

/**
 * Stitch tiles back together. Assumes each tile in `tiles` has been processed
 * with the same upscale factor and is ordered to match `specs` 1:1.
 */
export function stitchTiles(
  tiles: ImageData[],
  specs: TileSpec[],
  outWidth: number,
  outHeight: number,
  scale = 1,
): ImageData {
  const c = new OffscreenCanvas(outWidth * scale, outHeight * scale);
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const spec = specs[i];
    const tmp = new OffscreenCanvas(tile.width, tile.height);
    tmp.getContext('2d')!.putImageData(tile, 0, 0);
    ctx.drawImage(tmp, spec.x * scale, spec.y * scale);
  }
  return ctx.getImageData(0, 0, outWidth * scale, outHeight * scale);
}
