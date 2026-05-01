'use client';

import { useEffect, useState } from 'react';
import { MASK_TOOLS, useEditorStore, type ToolId } from '@/lib/store';
import { Toolbar } from './Toolbar';
import { CanvasStage } from './CanvasStage';
import { BrushCanvas } from './BrushCanvas';
import { UploadDropzone } from './UploadDropzone';
import { FeaturePanel } from './FeaturePanel';
import { PrintCheckout } from './PrintCheckout';
import { ThumbnailStrip } from './ThumbnailStrip';

/**
 * The editor reads an optional `?tool=upscale` query param to pre-select a
 * tool when the user lands here from a per-feature SEO page (/upscaler,
 * /colorize, etc).
 */
function getToolFromQuery(): ToolId | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const t = params.get('tool');
  const valid: ToolId[] = [
    'upscale',
    'colorize',
    'inpaint',
    'restore',
    'remove-bg',
    'watermark-remove',
  ];
  return valid.includes(t as ToolId) ? (t as ToolId) : null;
}

export function Editor() {
  const itemCount = useEditorStore((s) => s.items.length);
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    const tool = getToolFromQuery();
    if (tool) setActiveTool(tool);
  }, [setActiveTool]);

  const isMaskTool = activeTool ? MASK_TOOLS.includes(activeTool) : false;
  const hasContent = itemCount > 0;

  return (
    <div className="grid h-full w-full grid-cols-[64px_1fr_320px] grid-rows-[48px_1fr_auto] bg-ink-950">
      {/* Top bar */}
      <div className="col-span-3 flex items-center justify-between border-b border-ink-800 px-4 py-2">
        <a href="/" className="text-sm font-semibold tracking-tight">
          PrintPerfect<span className="text-accent">.ai</span>
        </a>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!hasContent}
            onClick={() => setShowCheckout(true)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Order as print
          </button>
        </div>
      </div>

      {/* Tool sidebar */}
      <Toolbar />

      {/* Canvas area */}
      <main className="relative bg-dots overflow-hidden">
        {!hasContent ? (
          <UploadDropzone />
        ) : isMaskTool ? (
          <BrushCanvas />
        ) : (
          <CanvasStage />
        )}
      </main>

      {/* Right panel */}
      <aside className="border-l border-ink-800 bg-ink-900/40 overflow-y-auto">
        {activeTool ? (
          <FeaturePanel tool={activeTool} />
        ) : (
          <div className="p-6 text-sm text-ink-400">
            <h2 className="text-base font-semibold text-ink-100 mb-2">Pick a tool</h2>
            <p>
              Upload one or more photos, then choose a tool from the left sidebar.
            </p>
          </div>
        )}
      </aside>

      {/* Album strip — spans the canvas + panel columns at the bottom */}
      <div className="col-start-2 col-span-2">
        <ThumbnailStrip />
      </div>

      {showCheckout && <PrintCheckout onClose={() => setShowCheckout(false)} />}
    </div>
  );
}
