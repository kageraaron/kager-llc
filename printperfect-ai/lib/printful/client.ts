/**
 * Server-side Printful REST client. Must only be imported from API routes —
 * never include in client bundles (the API token must stay private).
 */

import type {
  PrintfulFileUploadResponse,
  PrintfulOrderRequest,
  PrintfulProduct,
  PrintfulProductDetail,
} from './types';

const API_BASE = process.env.PRINTFUL_API_BASE ?? 'https://api.printful.com';

function authHeaders(): HeadersInit {
  const token = process.env.PRINTFUL_API_TOKEN;
  if (!token) throw new Error('PRINTFUL_API_TOKEN is not configured');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'PrintPerfect.ai/0.1',
  };
  // Multi-store accounts require X-PF-Store-Id; single-store accounts can omit.
  const storeId = process.env.PRINTFUL_STORE_ID;
  if (storeId) headers['X-PF-Store-Id'] = storeId;
  return headers;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Printful ${res.status}: ${body || res.statusText}`);
  }
  // Printful wraps every successful response as { code, result, ... }
  const json = (await res.json()) as { result: T };
  return json.result;
}

/** Catalog: list all sync-able products. */
export async function listProducts(): Promise<PrintfulProduct[]> {
  return await call<PrintfulProduct[]>('/products');
}

/** Catalog: variants + product details for a given product id. */
export async function getProduct(id: number): Promise<PrintfulProductDetail> {
  return await call<PrintfulProductDetail>(`/products/${id}`);
}

/**
 * Upload an image file. Printful supports two paths: by URL or by base64
 * `contents`. We use base64 so we never have to host the image ourselves.
 */
export async function uploadFile(
  fileName: string,
  base64Contents: string,
): Promise<PrintfulFileUploadResponse> {
  return await call<PrintfulFileUploadResponse>('/files', {
    method: 'POST',
    body: JSON.stringify({ type: 'default', filename: fileName, contents: base64Contents }),
  });
}

/**
 * Create an order. WARNING: this charges the configured Printful account
 * immediately if `confirm: true` is passed. Default is draft.
 */
export async function createOrder(payload: PrintfulOrderRequest, confirm = false) {
  const url = confirm ? '/orders?confirm=true' : '/orders';
  return await call(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
