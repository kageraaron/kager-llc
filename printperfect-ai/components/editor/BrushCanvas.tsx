'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore, type BrushApi } from '@/lib/store';

/**
 * Interactive canvas that lets the user brush a mask on top of the current
 * image. Exposes a `BrushApi` through the editor store so FeaturePanel can
 * pull the masked ImageData on Apply.
 *
 * Layout is two stacked canvases at identical dimensions:
 *   - imageCanvas: shows the working image (read-only).
 *   - maskCanvas:  full-resolution paintable layer; we draw it on top with
 *                  reduced opacity as a red overlay so the user can see the
 *                  selection.
 *
 * The mask canvas is kept at the *image's* native resolution so brushed
 * regions translate 1:1 into the inpainter input. We use CSS to scale both
 * canvases to fit the viewport.
 */
export function BrushCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const currentImage = useEditorStore((s) => s.currentImage);
  const brushSize = useEditorStore((s) => s.brushSize);
  const brushMode = useEditorStore((s) => s.brushMode);
  const setBrushApi = useEditorStore((s) => s.setBrushApi);

  // Layout & draw the image when it changes.
  useEffect(() => {
    const container = containerRef.current;
    const imgC = imageCanvasRef.current;
    const maskC = maskCanvasRef.current;
    if (!container || !imgC || !maskC || !currentImage) return;

    // Native dimensions (mask runs at full image resolution).
    imgC.width = currentImage.width;
    imgC.height = currentImage.height;
    maskC.width = currentImage.width;
    maskC.height = currentImage.height;

    // Fit-to-container CSS sizing.
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

    // Don't auto-clear the mask on image change; the user may have committed
    // an inpaint and want to refine. They can press "Clear mask" to reset.
  }, [currentImage]);

  // Convert a pointer event into mask-canvas coordinates (image-native).
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
      // Scale brush to image coordinates (CSS px → image px).
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
      // Round caps at endpoints so single clicks register as a dot.
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

  // Register the BrushApi with the store so FeaturePanel can read the mask.
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

        // Set alpha to 0 wherever the mask has any opacity. The inpainter
        // treats alpha < 128 as "fill this in".
        for (let i = 0; i < img.data.length; i += 4) {
          if (mask.data[i + 3] > 16) {
            img.data[i + 3] = 0;
          }
        }
        return img;
      },
      hasMask: () => {
        const maskC = maskCanvasRef.current;
        if (!maskC) return false;
        const ctx = maskC.getContext('2d');
        if (!ctx) return false;
        // Sampling every pixel is O(n) — sample a sparse grid for speed.
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
          // The mask canvas sits visually on top of the image canvas with
          // pointer events enabled. The red strokes are part of the canvas
          // pixel data itself (drawn with semi-transparent red).
        />
      </div>
    </div>
  );
}
