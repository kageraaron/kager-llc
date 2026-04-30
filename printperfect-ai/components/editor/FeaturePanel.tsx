'use client';

import { useState } from 'react';
import { useEditorStore, type ToolId } from '@/lib/store';
import { bitmapToImageData, imageDataToBitmap } from '@/lib/image/canvas';
import { useInferenceWorker } from './useInferenceWorker';

const COPY: Record<
  ToolId,
  { title: string; cta: string; description: string; supported: boolean }
> = {
  upscale: {
    title: 'AI Upscale',
    cta: 'Upscale 4×',
    description:
      'Enlarge your photo with sharp detail using Real-ESRGAN. Great for prepping low-res images for prints.',
    supported: true,
  },
  colorize: {
    title: 'AI Colorize',
    cta: 'Colorize',
    description:
      'Bring black-and-white or sepia photos to life with realistic color (DDColor).',
    supported: true,
  },
  restore: {
    title: 'Face Restoration',
    cta: 'Restore faces',
    description:
      'Sharpen blurry portraits and restore facial detail. Coming soon — GFPGAN integration.',
    supported: false,
  },
  inpaint: {
    title: 'Inpaint / Object Removal',
    cta: 'Remove brushed areas',
    description:
      'Brush over unwanted objects and let LaMa fill them in. Brush UI coming soon — currently fills any transparent regions in the image.',
    supported: true,
  },
  'remove-bg': {
    title: 'Background Remover',
    cta: 'Remove background',
    description: 'Isolate the subject and produce a transparent PNG. Coming soon — RMBG-1.4.',
    supported: false,
  },
};

const toolMap: Partial<Record<ToolId, 'upscale' | 'colorize' | 'inpaint'>> = {
  upscale: 'upscale',
  colorize: 'colorize',
  inpaint: 'inpaint',
};

export function FeaturePanel({ tool }: { tool: ToolId }) {
  const currentImage = useEditorStore((s) => s.currentImage);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const { run, cancelAll, state } = useInferenceWorker();
  const [localError, setLocalError] = useState<string | null>(null);
  const copy = COPY[tool];
  const workerTool = toolMap[tool];

  async function handleRun() {
    if (!currentImage || !workerTool) return;
    setLocalError(null);
    try {
      // Take a fresh ImageData each run — the previous one was transferred to
      // the worker and is now detached.
      const inputData = bitmapToImageData(currentImage);
      const outputData = await run(workerTool, inputData);
      const outBitmap = await imageDataToBitmap(outputData);
      pushHistory(outBitmap);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-base font-semibold">{copy.title}</h2>
      <p className="mt-2 text-sm text-ink-400 leading-relaxed">{copy.description}</p>

      <button
        type="button"
        onClick={handleRun}
        disabled={state.running || !currentImage || !copy.supported}
        className="mt-6 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {state.running ? 'Working…' : copy.supported ? copy.cta : 'Coming soon'}
      </button>

      {state.running && (
        <button
          type="button"
          onClick={cancelAll}
          className="mt-2 w-full rounded-md px-4 py-2 text-xs text-ink-300 ring-1 ring-ink-700 hover:bg-ink-800 transition"
        >
          Cancel
        </button>
      )}

      {(state.running || state.progress > 0) && (
        <div className="mt-5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${Math.round(state.progress * 100)}%` }}
            />
          </div>
          {state.message && <p className="mt-2 text-xs text-ink-400">{state.message}</p>}
        </div>
      )}

      {(localError || state.error) && (
        <p className="mt-4 text-xs text-red-400">{localError ?? state.error}</p>
      )}
    </div>
  );
}
