/**
 * Server-side Printify REST client. Must only be imported from API routes —
 * never include in client bundles (the API token must stay private).
 */

import type {
  PrintifyBlueprint,
  PrintifyImageUploadResponse,
  PrintifyOrderRequest,
  PrintifyPrintProvider,
  PrintifyVariant,
} from './types';

const API_BASE = process.env.PRINTIFY_API_BASE ?? 'https://api.printify.com/v1';

function authHeaders(): HeadersInit {
  const token = process.env.PRINTIFY_API_TOKEN;
  if (!token) throw new Error('PRINTIFY_API_TOKEN is not configured');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'PrintPerfect.ai/0.1',
  };
}

function shopId(): string {
  const id = process.env.PRINTIFY_SHOP_ID;
  if (!id) throw new Error('PRINTIFY_SHOP_ID is not configured');
  return id;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Printify ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Catalog: list all blueprints (canvas, framed, posters, etc.). */
export async function listBlueprints(): Promise<PrintifyBlueprint[]> {
  return await call('/catalog/blueprints.json');
}

/** Catalog: detailed blueprint info. */
export async function getBlueprint(id: number): Promise<PrintifyBlueprint> {
  return await call(`/catalog/blueprints/${id}.json`);
}

/** Catalog: print providers that can produce a given blueprint. */
export async function listPrintProviders(blueprintId: number): Promise<PrintifyPrintProvider[]> {
  return await call(`/catalog/blueprints/${blueprintId}/print_providers.json`);
}

/** Catalog: variants (sizes/colors) a provider offers for a blueprint. */
export async function listVariants(
  blueprintId: number,
  providerId: number,
): Promise<{ variants: PrintifyVariant[] }> {
  return await call(
    `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/variants.json`,
  );
}

/** Catalog: shipping methods + per-variant costs for a provider. */
export async function getShipping(
  blueprintId: number,
  providerId: number,
): Promise<unknown> {
  return await call(
    `/catalog/blueprints/${blueprintId}/print_providers/${providerId}/shipping.json`,
  );
}

/**
 * Upload a base64 image to Printify and get back an image id we can attach
 * to an order. The image is streamed through this server but never persisted.
 */
export async function uploadImage(
  fileName: string,
  base64Contents: string,
): Promise<PrintifyImageUploadResponse> {
  return await call<PrintifyImageUploadResponse>('/uploads/images.json', {
    method: 'POST',
    body: JSON.stringify({ file_name: fileName, contents: base64Contents }),
  });
}

/** Submit an order to the connected shop. */
export async function createOrder(payload: PrintifyOrderRequest) {
  return await call(`/shops/${shopId()}/orders.json`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
