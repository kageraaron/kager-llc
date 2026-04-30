/**
 * Off-main-thread inference worker.
 *
 * Receives ImageData from the main thread, runs the requested AI feature,
 * streams progress events back, and returns the final ImageData.
 *
 * Why a worker: ONNX inference on a 12MP image can lock the main thread for
 * seconds; doing it here keeps the editor UI responsive (scroll, undo,
 * cancel button, etc.).
 */

/// <reference lib="webworker" />

import { Upscaler } from '@/lib/ai/upscaler';
import { Colorizer } from '@/lib/ai/colorizer';
import { Inpainter } from '@/lib/ai/inpainter';
import type { AIFeature } from '@/lib/ai/types';

export type WorkerInbound =
  | { type: 'run'; jobId: string; tool: 'upscale' | 'colorize' | 'inpaint'; imageData: ImageData }
  | { type: 'cancel'; jobId: string };

export type WorkerOutbound =
  | { type: 'progress'; jobId: string; progress: number; message?: string }
  | { type: 'done'; jobId: string; result: ImageData }
  | { type: 'error'; jobId: string; error: string };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

// Keep one feature instance per tool to avoid re-loading models per run.
const cache: Partial<Record<'upscale' | 'colorize' | 'inpaint', AIFeature>> = {};

function getFeature(tool: 'upscale' | 'colorize' | 'inpaint'): AIFeature {
  if (cache[tool]) return cache[tool]!;
  const feat: AIFeature =
    tool === 'upscale' ? new Upscaler() : tool === 'colorize' ? new Colorizer() : new Inpainter();
  cache[tool] = feat;
  return feat;
}

const cancelled = new Set<string>();

ctx.addEventListener('message', async (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;
  if (msg.type === 'cancel') {
    cancelled.add(msg.jobId);
    return;
  }
  if (msg.type !== 'run') return;

  const { jobId, tool, imageData } = msg;
  const feature = getFeature(tool);
  const post = (m: WorkerOutbound, transfer: Transferable[] = []) =>
    ctx.postMessage(m, transfer);

  try {
    await feature.init((p, message) =>
      post({ type: 'progress', jobId, progress: p * 0.3, message: message ?? 'Loading model' }),
    );
    if (cancelled.has(jobId)) return;

    const result = await feature.run(imageData, (p, message) => {
      if (cancelled.has(jobId)) return;
      // Map inference progress into the remaining 70%.
      post({ type: 'progress', jobId, progress: 0.3 + p * 0.7, message });
    });
    if (cancelled.has(jobId)) return;

    // Transfer the result buffer to avoid a copy.
    post({ type: 'done', jobId, result }, [result.data.buffer]);
  } catch (err) {
    post({
      type: 'error',
      jobId,
      error: err instanceof Error ? err.message : 'Inference failed',
    });
  } finally {
    cancelled.delete(jobId);
  }
});

export {};
