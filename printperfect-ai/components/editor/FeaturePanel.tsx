'use client';

import { useEffect, useState } from 'react';
import { MASK_TOOLS, useActiveItem, useEditorStore, type ToolId } from '@/lib/store';
import { bitmapToImageData, imageDataToBitmap } from '@/lib/image/canvas';
import { useInferenceWorker } from './useInferenceWorker';
import { AdSlot } from '@/components/analytics/AdSlot';

const COPY: Record<
  ToolId,
  {
    title: string;
    cta: string;
    description: string;
    supported: boolean;
    workerTool?: 'upscale' | 'colorize' | 'restore' | 'remove-bg'; // | 'inpaint' 
  }
> = {
  upscale: {
    title: 'AI Upscale',
    cta: 'Upscale 4×',
    description: 'Enlarge your photo with sharp detail. Great for prepping low-res images for prints.',
    supported: true,
    workerTool: 'upscale',
  },
  colorize: {
    title: 'AI Colorize',
    cta: 'Colorize',
    description: 'Bring black-and-white or sepia photos to life with realistic color.',
    supported: true,
    workerTool: 'colorize',
  },
  restore: {
    title: 'Face Restoration',
    cta: 'Restore faces',
    description: 'Sharpen blurry portraits and bring back facial detail. Works best on tight portraits where the face fills most of the frame.',
    supported: true,
    workerTool: 'restore',
  },
  // inpaint: {
  //   title: 'Inpaint / Object Removal',
  //   cta: 'Remove brushed areas',
  //   description:
  //     'Brush over unwanted objects, then click Remove. The masked region is filled using surrounding context.',
  //   supported: true,
  //   workerTool: 'inpaint',
  // },
  // 'watermark-remove': {
  //   title: 'Watermark Remover',
  //   cta: 'Remove watermark',
  //   description:
  //     'Brush precisely over the watermark, logo, or text you want gone. Smaller brush = cleaner result.',
  //   supported: true,
  //   workerTool: 'inpaint',
  // },
  'remove-bg': {
    title: 'Background Remover',
    cta: 'Remove background',
    description: 'Isolate the subject and produce a transparent PNG. Great for product shots and portraits.',
    supported: true,
    workerTool: 'remove-bg',
  },
  inpaint: {
    title: '',
    cta: '',
    description: '',
    supported: false,
    workerTool: undefined
  },
  'watermark-remove': {
    title: '',
    cta: '',
    description: '',
    supported: false,
    workerTool: undefined
  }
};

const DEFAULT_BRUSH_SIZE: Record<ToolId, number> = {
  upscale: 32,
  colorize: 32,
  restore: 32,
  inpaint: 48,
  'watermark-remove': 16,
  'remove-bg': 32,
};

export function FeaturePanel({ tool }: { tool: ToolId }) {
  const item = useActiveItem();
  const currentImage = item?.currentImage ?? null;
  const itemCount = useEditorStore((s) => s.items.length);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const brushSize = useEditorStore((s) => s.brushSize);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const brushMode = useEditorStore((s) => s.brushMode);
  const setBrushMode = useEditorStore((s) => s.setBrushMode);
  const brushApi = useEditorStore((s) => s.brushApi);
  const { run, cancelAll, state } = useInferenceWorker();
  const [localError, setLocalError] = useState<string | null>(null);
  const copy = COPY[tool];
  const isMaskTool = MASK_TOOLS.includes(tool);

  useEffect(() => {
    setBrushSize(DEFAULT_BRUSH_SIZE[tool]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  async function handleRun() {
    if (!currentImage || !copy.workerTool) return;
    setLocalError(null);

    let inputData: ImageData;
    if (isMaskTool) {
      const masked = brushApi?.composeMaskedImage();
      if (!masked || !brushApi?.hasMask()) {
        setLocalError('Brush over the area you want to remove first.');
        return;
      }
      inputData = masked;
    } else {
      inputData = bitmapToImageData(currentImage);
    }

    try {
      const outputData = await run(copy.workerTool, inputData);
      const outBitmap = await imageDataToBitmap(outputData);
      pushHistory(outBitmap);
      if (isMaskTool) brushApi?.clear();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold">{copy.title}</h2>
        <p className="mt-2 text-sm text-ink-400 leading-relaxed">{copy.description}</p>
        {itemCount > 1 && (
          <p className="mt-2 text-xs text-ink-500">
            Working on <span className="text-ink-300">{item?.name ?? 'untitled'}</span>. Switch to
            another photo using the strip below.
          </p>
        )}
      </div>

      {isMaskTool && copy.supported && (
        <div className="space-y-3 rounded-lg ring-1 ring-ink-800 bg-ink-950/40 p-4">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="brush-size" className="text-xs font-medium text-ink-200">
                Brush size
              </label>
              <span className="text-xs text-ink-400">{brushSize}px</span>
            </div>
            <input
              id="brush-size"
              type="range"
              min={4}
              max={200}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="mt-2 w-full accent-accent"
            />
          </div>
          <div className="flex gap-2">
            <ModeButton active={brushMode === 'paint'} onClick={() => setBrushMode('paint')}>
              Paint
            </ModeButton>
            <ModeButton active={brushMode === 'erase'} onClick={() => setBrushMode('erase')}>
              Erase
            </ModeButton>
            <button
              type="button"
              onClick={() => brushApi?.clear()}
              className="ml-auto rounded-md px-2.5 py-1 text-xs text-ink-300 ring-1 ring-ink-700 hover:bg-ink-800 transition"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleRun}
        disabled={state.running || !currentImage || !copy.supported}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {state.running ? 'Working…' : copy.supported ? copy.cta : 'Coming soon'}
      </button>

      {state.running && (
        <button
          type="button"
          onClick={cancelAll}
          className="w-full rounded-md px-4 py-2 text-xs text-ink-300 ring-1 ring-ink-700 hover:bg-ink-800 transition"
        >
          Cancel
        </button>
      )}

      {(state.running || state.progress > 0) && (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${Math.round(state.progress * 100)}%` }}
            />
          </div>
          {state.message && <p className="mt-2 text-xs text-ink-400">{state.message}</p>}
        </div>
      )}

      {/* Ad slot shown only while a job is running, so it never disrupts the
          empty/idle UI. Falls back to a placeholder when AdSense isn't
          configured. */}
      {state.running && (
        <div className="pt-2">
          <AdSlot label="Ad while we work" />
        </div>
      )}

      {(localError || state.error) && (
        <p className="text-xs text-red-400">{localError ?? state.error}</p>
      )}
    </div>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
        active ? 'bg-accent text-white' : 'text-ink-300 ring-1 ring-ink-700 hover:bg-ink-800'
      }`}
    >
      {children}
    </button>
  );
}
