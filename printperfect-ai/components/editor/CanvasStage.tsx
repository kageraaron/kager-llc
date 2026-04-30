'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/lib/store';

export function CanvasStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentImage = useEditorStore((s) => s.currentImage);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !currentImage) return;

    // Fit the image into the available container while preserving aspect.
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const ar = currentImage.width / currentImage.height;
    let w = cw;
    let h = cw / ar;
    if (h > ch) {
      h = ch;
      w = ch * ar;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
  }, [currentImage]);

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center p-8">
      <canvas
        ref={canvasRef}
        className="max-h-full max-w-full rounded-md shadow-2xl ring-1 ring-ink-800"
      />
    </div>
  );
}
