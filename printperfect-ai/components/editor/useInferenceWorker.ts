'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkerInbound, WorkerOutbound, WorkerTool } from '@/workers/inference.worker';

type ToolName = WorkerTool;

type RunState = {
  running: boolean;
  progress: number;
  message?: string;
  error?: string;
};

/**
 * React hook that owns a single shared inference worker for the lifetime of
 * the component tree. Exposes a `run(tool, imageData)` promise plus live
 * progress state.
 */
export function useInferenceWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(
    new Map<string, { resolve: (img: ImageData) => void; reject: (err: Error) => void }>(),
  );
  const [state, setState] = useState<RunState>({ running: false, progress: 0 });

  useEffect(() => {
    // Relative path is required: webpack's worker loader rewrites `new URL(..., import.meta.url)`
    // only when the first argument is a literal relative string.
    const worker = new Worker(
      new URL('../../workers/inference.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.addEventListener('message', (e: MessageEvent<WorkerOutbound>) => {
      const msg = e.data;
      const handlers = pending.current.get(msg.jobId);
      if (msg.type === 'progress') {
        setState({ running: true, progress: msg.progress, message: msg.message });
      } else if (msg.type === 'done') {
        setState({ running: false, progress: 1 });
        handlers?.resolve(msg.result);
        pending.current.delete(msg.jobId);
      } else if (msg.type === 'error') {
        setState({ running: false, progress: 0, error: msg.error });
        handlers?.reject(new Error(msg.error));
        pending.current.delete(msg.jobId);
      }
    });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const run = useCallback(async (tool: ToolName, imageData: ImageData): Promise<ImageData> => {
    const worker = workerRef.current;
    if (!worker) throw new Error('Worker not ready');
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setState({ running: true, progress: 0, message: 'Queued' });
    return new Promise((resolve, reject) => {
      pending.current.set(jobId, { resolve, reject });
      const msg: WorkerInbound = { type: 'run', jobId, tool, imageData };
      // Transfer the input buffer to avoid a copy. After this call the
      // imageData on the main thread is detached.
      worker.postMessage(msg, [imageData.data.buffer]);
    });
  }, []);

  const cancelAll = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    for (const jobId of pending.current.keys()) {
      const msg: WorkerInbound = { type: 'cancel', jobId };
      worker.postMessage(msg);
    }
    pending.current.clear();
    setState({ running: false, progress: 0 });
  }, []);

  return { run, cancelAll, state };
}
