'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useActiveItem, useEditorStore, type BrushApi } from '@/lib/store';

/**
 * Interactive canvas that lets the user brush a mask on top of the active
 * album item's image. Exposes a `BrushApi` through the editor store so
 * FeaturePanel can pull the masked ImageData on Apply.
 *
 * Two stacked canvases at the image's native resolution. The mask canvas sits
 * visually on top of the image canvas with pointer events enabled. Strokes
 * are drawn directly into the mask canvas with a translucent red fill.
 *
 * The mask is intentionally NOT cleared when the user switches between album
 * items — switching photos clears their displayed mask via the canvas being
 * re-mounted, but the data layer rebinds to the new item's dimensions.
 */
export function BrushCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const item = useActiveItem();
  const currentImage = item?.currentImage ?? null;
  const brushSize = useEditorStore((s) => s.brushSize);
  const brushMode = useEditorStore((s) => s.brushMode);
  const setBrushApi = useEditorStore((s) => s.setBrushApi);

  useEffect(() => {
    const container = containerRef.current;
    const imgC = imageCanvasRef.current;
    const maskC = maskCanvasRef.current;
    if (!container || !imgC || !maskC || !currentImage) return;

    imgC.width = currentImage.width;
    imgC.height = currentImage.height;
    maskC.width = currentImage.width;
    maskC.height = currentImage.height;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const ar = currentImage.width / currentImage.height;
    let w = cw;
    let h = cw / ar;
    if (h > ch) {
      h = ch;
      w = ch * ar;
    }
    [imgC, maskC].forEach((c) => {
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    });

    const ictx = imgC.getContext('2d');
    if (!ictx) return;
    ictx.imageSmoothingEnabled = true;
    ictx.imageSmoothingQuality = 'high';
    ictx.clearRect(0, 0, imgC.width, imgC.height);
    ictx.drawImage(currentImage, 0, 0);
  }, [currentImage]);

  const eventToCanvas = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = maskCanvasRef.current!;
    const rect = c.getBoundingClientRect();
    const sx = c.width / rect.width;
    const sy = c.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
  }, []);

  const stroke = useCallback(
    (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const c = maskCanvasRef.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      const rect = c.getBoundingClientRect();
      const scale = c.width / rect.width;
      const radius = (brushSize / 2) * scale;

      ctx.globalCompositeOperation = brushMode === 'paint' ? 'source-over' : 'destination-out';
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.55)';
      ctx.fillStyle = 'rgba(255, 0, 0, 0.55)';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = radius * 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
      ctx.fill();
    },
    [brushSize, brushMode],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      const p = eventToCanvas(e);
      lastPointRef.current = p;
      stroke(p, p);
    },
    [eventToCanvas, stroke],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const p = eventToCanvas(e);
      const last = lastPointRef.current ?? p;
      stroke(last, p);
      lastPointRef.current = p;
    },
    [eventToCanvas, stroke],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastPointRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  useEffect(() => {
    const api: BrushApi = {
      composeMaskedImage: () => {
        const imgC = imageCanvasRef.current;
        const maskC = maskCanvasRef.current;
        if (!imgC || !maskC || !currentImage) return null;
        const ictx = imgC.getContext('2d');
        const mctx = maskC.getContext('2d');
        if (!ictx || !mctx) return null;
        const img = ictx.getImageData(0, 0, imgC.width, imgC.height);
        const mask = mctx.getImageData(0, 0, maskC.width, maskC.height);
        for (let i = 0; i < img.data.length; i += 4) {
          if (mask.data[i + 3] > 16) img.data[i + 3] = 0;
        }
        return img;
      },
      hasMask: () => {
        const maskC = maskCanvasRef.current;
        if (!maskC) return false;
        const ctx = maskC.getContext('2d');
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, maskC.width, maskC.height).data;
        const step = Math.max(4, Math.floor(data.length / 40000));
        for (let i = 3; i < data.length; i += step * 4) {
          if (data[i] > 16) return true;
        }
        return false;
      },
      clear: () => {
        const c = maskCanvasRef.current;
        if (!c) return;
        c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
      },
    };
    setBrushApi(api);
    return () => setBrushApi(null);
  }, [currentImage, setBrushApi]);

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center p-8">
      <div className="relative">
        <canvas
          ref={imageCanvasRef}
          className="block max-h-full max-w-full rounded-md shadow-2xl ring-1 ring-ink-800"
        />
        <canvas
          ref={maskCanvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute inset-0 block max-h-full max-w-full rounded-md cursor-crosshair touch-none"
        />
      </div>
    </div>
  );
}
