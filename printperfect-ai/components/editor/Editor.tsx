'use client';

import { useState } from 'react';
import { useEditorStore } from '@/lib/store';
import { Toolbar } from './Toolbar';
import { CanvasStage } from './CanvasStage';
import { UploadDropzone } from './UploadDropzone';
import { FeaturePanel } from './FeaturePanel';
import { PrintCheckout } from './PrintCheckout';

export function Editor() {
  const sourceImage = useEditorStore((s) => s.sourceImage);
  const activeTool = useEditorStore((s) => s.activeTool);
  const [showCheckout, setShowCheckout] = useState(false);

  return (
    <div className="grid h-full w-full grid-cols-[64px_1fr_320px] grid-rows-[48px_1fr] bg-ink-950">
      {/* Top bar */}
      <div className="col-span-3 flex items-center justify-between border-b border-ink-800 px-4 py-2">
        <a href="/" className="text-sm font-semibold tracking-tight">
          PrintPerfect<span className="text-accent">.ai</span>
        </a>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!sourceImage}
            onClick={() => setShowCheckout(true)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Order as print
          </button>
        </div>
      </div>

      {/* Tool sidebar */}
      <Toolbar />

      {/* Canvas stage */}
      <main className="relative bg-dots overflow-hidden">
        {sourceImage ? <CanvasStage /> : <UploadDropzone />}
      </main>

      {/* Right panel */}
      <aside className="border-l border-ink-800 bg-ink-900/40 overflow-y-auto">
        {activeTool ? (
          <FeaturePanel tool={activeTool} />
        ) : (
          <div className="p-6 text-sm text-ink-400">
            <h2 className="text-base font-semibold text-ink-100 mb-2">Pick a tool</h2>
            <p>
              Choose from the left sidebar to upscale, colorize, restore, or inpaint your image.
            </p>
          </div>
        )}
      </aside>

      {showCheckout && <PrintCheckout onClose={() => setShowCheckout(false)} />}
    </div>
  );
}
