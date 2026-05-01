/**
 * Album download helpers — single photo or bulk ZIP.
 *
 * Uses JSZip (loaded dynamically) to keep the editor bundle small for users
 * who never use the bulk download.
 */

import type JSZipType from 'jszip';
import { bitmapToBlob } from '@/lib/image/canvas';
import type { AlbumItem } from '@/lib/store';

export async function downloadOne(item: AlbumItem): Promise<void> {
  const blob = await bitmapToBlob(item.currentImage, 'image/png');
  triggerDownload(blob, sanitizeFilename(item.name, '.png'));
}

export async function downloadAllAsZip(
  items: AlbumItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (!items.length) return;

  // Dynamic import keeps JSZip out of the editor's initial bundle.
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const blob = await bitmapToBlob(item.currentImage, 'image/png');
    const name = uniqueName(zip, sanitizeFilename(item.name, '.png'));
    zip.file(name, blob);
    onProgress?.(i + 1, items.length);
  }

  const archive = await zip.generateAsync({ type: 'blob' });
  triggerDownload(archive, `printperfect-album-${Date.now()}.zip`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick to ensure the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^\w\-. ]+/g, '_');
  return `${base || 'photo'}${ext}`;
}

function uniqueName(zip: JSZipType, candidate: string): string {
  if (!zip.file(candidate)) return candidate;
  const dot = candidate.lastIndexOf('.');
  const base = dot >= 0 ? candidate.slice(0, dot) : candidate;
  const ext = dot >= 0 ? candidate.slice(dot) : '';
  let i = 2;
  while (zip.file(`${base}_${i}${ext}`)) i++;
  return `${base}_${i}${ext}`;
}
