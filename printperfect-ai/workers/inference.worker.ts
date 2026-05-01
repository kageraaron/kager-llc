/**
 * Off-main-thread inference worker.
 *
 * Receives ImageData from the main thread, runs the requested AI feature,
 * streams progress events back, and returns the final ImageData.
 *
 * One feature instance per tool is cached so model downloads don't repeat
 * across runs.
 */

/// <reference lib="webworker" />

import { Upscaler } from '@/lib/ai/upscaler';
import { Colorizer } from '@/lib/ai/colorizer';
import { Inpainter } from '@/lib/ai/inpainter';
import { FaceRestorer } from '@/lib/ai/face-restorer';
import { BackgroundRemover } from '@/lib/ai/bg-remover';
import type { AIFeature } from '@/lib/ai/types';

export type WorkerTool = 'upscale' | 'colorize' | 'inpaint' | 'restore' | 'remove-bg';

export type WorkerInbound =
  | { type: 'run'; jobId: string; tool: WorkerTool; imageData: ImageData }
  | { type: 'cancel'; jobId: string };

export type WorkerOutbound =
  | { type: 'progress'; jobId: string; progress: number; message?: string }
  | { type: 'done'; jobId: string; result: ImageData }
  | { type: 'error'; jobId: string; error: string };

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const cache: Partial<Record<WorkerTool, AIFeature>> = {};

function getFeature(tool: WorkerTool): AIFeature {
  if (cache[tool]) return cache[tool]!;
  let feat: AIFeature;
  switch (tool) {
    case 'upscale':
      feat = new Upscaler();
      break;
    case 'colorize':
      feat = new Colorizer();
      break;
    case 'inpaint':
      feat = new Inpainter();
      break;
    case 'restore':
      feat = new FaceRestorer();
      break;
    case 'remove-bg':
      feat = new BackgroundRemover();
      break;
  }
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
      post({ type: 'progress', jobId, progress: 0.3 + p * 0.7, message });
    });
    if (cancelled.has(jobId)) return;

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
