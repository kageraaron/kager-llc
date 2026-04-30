/**
 * Thin wrapper around onnxruntime-web that handles:
 *  - WebGPU detection with WASM fallback
 *  - Model caching via the Cache API
 *  - Progress reporting during model download
 *
 * NOTE: This module must only be imported from client code (or workers).
 */

import type { ProgressCallback, ModelManifest } from './types';

const MODEL_CACHE = 'pp-models-v1';

let wasmConfigured = false;

async function configureRuntime() {
  if (wasmConfigured) return;
  const ort = await import('onnxruntime-web');
  // Serve the .wasm files from the same origin so the COEP/COOP headers apply.
  // Default behavior fetches from the package CDN which can break under cross-origin isolation.
  ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency ?? 4, 4);
  ort.env.wasm.simd = true;
  wasmConfigured = true;
}

export async function detectBackend(): Promise<'webgpu' | 'wasm'> {
  if (typeof navigator === 'undefined') return 'wasm';
  if ('gpu' in navigator) {
    try {
      const adapter = await (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter();
      if (adapter) return 'webgpu';
    } catch {
      /* fall through */
    }
  }
  return 'wasm';
}

async function fetchWithProgress(
  url: string,
  onProgress?: ProgressCallback,
): Promise<ArrayBuffer> {
  const cache = await caches.open(MODEL_CACHE);
  const cached = await cache.match(url);
  if (cached) {
    onProgress?.(1, 'Loaded from cache');
    return await cached.arrayBuffer();
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to fetch model: ${res.status}`);

  const total = Number(res.headers.get('content-length') ?? 0);
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = res.body.getReader();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (total) onProgress?.(received / total, 'Downloading model');
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  // Cache for next time. Re-create the response so the body isn't consumed.
  await cache.put(url, new Response(merged.slice().buffer));
  return merged.buffer;
}

/**
 * Load an ONNX model and create an inference session bound to the best
 * available backend.
 */
export async function loadSession(
  manifest: ModelManifest,
  onProgress?: ProgressCallback,
) {
  await configureRuntime();
  const ort = await import('onnxruntime-web');
  const buffer = await fetchWithProgress(manifest.url, onProgress);
  const backend = await detectBackend();
  return ort.InferenceSession.create(buffer, {
    executionProviders: backend === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'],
    graphOptimizationLevel: 'all',
  });
}
