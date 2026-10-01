import 'server-only';

/**
 * Best Buy's official Products API (developer.bestbuy.com), by SKU.
 * Free key; 5 requests a second. The one store with a sanctioned way to read
 * today's price, which is why it's the one store checked automatically.
 */
export interface BestBuyPrice {
  sku: string;
  salePriceCents: number;
  url?: string;
  name?: string;
}

export async function bestBuyPrices(skus: string[]): Promise<Map<string, BestBuyPrice>> {
  const key = process.env.BESTBUY_API_KEY;
  const out = new Map<string, BestBuyPrice>();
  if (!key || skus.length === 0) return out;

  const clean = [...new Set(skus.filter((s) => /^\d{5,9}$/.test(s)))];
  for (let i = 0; i < clean.length; i += 50) {
    const list = clean.slice(i, i + 50).join(',');
    const url = `https://api.bestbuy.com/v1/products(sku%20in(${list}))?apiKey=${encodeURIComponent(key)}&format=json&show=sku,name,salePrice,url&pageSize=50`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Best Buy ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { products?: { sku: number; name?: string; salePrice?: number; url?: string }[] };
    for (const p of data.products ?? []) {
      if (typeof p.salePrice !== 'number') continue;
      out.set(String(p.sku), { sku: String(p.sku), salePriceCents: Math.round(p.salePrice * 100), url: p.url, name: p.name });
    }
  }
  return out;
}
