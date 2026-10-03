/** "https://www.amazon.com/dp/B00450U6CS?…", "/gp/product/B00450U6CS", or the ASIN itself. */
export function asinFrom(input?: string | null): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (/^[A-Z0-9]{10}$/.test(s)) return s;
  return s.match(/\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?:[/?]|$)/)?.[1] ?? s.match(/[?&]asin=([A-Z0-9]{10})/i)?.[1]?.toUpperCase();
}
