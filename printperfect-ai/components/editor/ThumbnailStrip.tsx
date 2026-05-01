'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useEditorStore, type AlbumItem } from '@/lib/store';
import { downloadAllAsZip, downloadOne } from '@/lib/album/download';
import { UploadDropzone } from './UploadDropzone';

/**
 * Horizontal strip of thumbnails for the album. Each tile shows a 96×96 preview
 * of the item's *current* image (so the strip reflects edits live), an edited
 * indicator, and a delete-on-hover affordance.
 *
 * Lives below the canvas area in the editor grid.
 */
export function ThumbnailStrip() {
  const items = useEditorStore((s) => s.items);
  const activeItemId = useEditorStore((s) => s.activeItemId);
  const selectItem = useEditorStore((s) => s.selectItem);
  const removeItem = useEditorStore((s) => s.removeItem);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);

  if (items.length === 0) return null;

  return (
    <div className="border-t border-ink-800 bg-ink-900/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 overflow-x-auto pb-1">
          {items.map((item) => (
            <Thumbnail
              key={item.id}
              item={item}
              active={item.id === activeItemId}
              onSelect={() => selectItem(item.id)}
              onRemove={() => removeItem(item.id)}
              onDownload={() => void downloadOne(item)}
            />
          ))}
          <UploadDropzone compact />
        </div>
        <div className="flex shrink-0 items-center gap-2 border-l border-ink-800 pl-2">
          <span className="text-xs text-ink-400">{items.length} photo{items.length === 1 ? '' : 's'}</span>
          <button
            type="button"
            onClick={async () => {
              setZipping({ done: 0, total: items.length });
              try {
                await downloadAllAsZip(items, (done, total) => setZipping({ done, total }));
              } finally {
                setZipping(null);
              }
            }}
            disabled={!!zipping}
            className="rounded-md bg-ink-800 px-3 py-1.5 text-xs font-medium text-ink-100 hover:bg-ink-700 disabled:opacity-50 transition"
          >
            {zipping ? `Zipping ${zipping.done}/${zipping.total}…` : 'Download all (.zip)'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Thumbnail({
  item,
  active,
  onSelect,
  onRemove,
  onDownload,
}: {
  item: AlbumItem;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDownload: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Re-render the thumb whenever the item's currentImage changes.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const SIZE = 64;
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Letterbox to preserve aspect.
    const ar = item.currentImage.width / item.currentImage.height;
    let dw = SIZE;
    let dh = SIZE;
    if (ar > 1) dh = SIZE / ar;
    else dw = SIZE * ar;
    ctx.fillStyle = '#15161b';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(item.currentImage, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh);
  }, [item.currentImage]);

  return (
    <div className="group relative shrink-0">
      <button
        type="button"
        onClick={onSelect}
        className={clsx(
          'block rounded-lg ring-1 transition',
          active
            ? 'ring-accent shadow-[0_0_0_3px_rgba(124,92,255,0.18)]'
            : 'ring-ink-800 hover:ring-ink-600',
        )}
        title={item.name}
      >
        <canvas ref={canvasRef} className="block h-16 w-16 rounded-md" />
      </button>

      {item.edited && (
        <span
          className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-ink-900"
          title="Edited"
        />
      )}

      {/* Hover actions */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-1 rounded-b-md bg-ink-950/70 px-1 py-0.5 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          type="button"
          onClick={onDownload}
          title="Download"
          className="text-[10px] text-ink-200 hover:text-ink-50 px-1"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Remove"
          className="text-[10px] text-ink-200 hover:text-red-400 px-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
