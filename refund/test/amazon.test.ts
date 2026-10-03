import { describe, expect, it } from 'vitest';
import { asinFrom } from '@/lib/asin';
import { deadlineFor, policyFor, policyForSender } from '@/lib/policies';
import { emailRole, extractPurchase } from '@/lib/ingest/extract';

describe('Amazon as a store', () => {
  it('finds the ASIN in a product link, however it is written', () => {
    expect(asinFrom('B00EXAMPLE')).toBe('B00EXAMPLE');
    expect(asinFrom('https://www.amazon.com/Some-Product-Name/dp/B00EXAMPLE/ref=sr_1_1?crid=1')).toBe('B00EXAMPLE');
    expect(asinFrom('https://www.amazon.com/gp/product/B00EXAMPLE?th=1')).toBe('B00EXAMPLE');
    expect(asinFrom('https://www.amazon.com/dp/B00EXAMPLE')).toBe('B00EXAMPLE');
    expect(asinFrom('big green machine')).toBeUndefined();
    expect(asinFrom('')).toBeUndefined();
  });

  it('watches the return window, since there is no price adjustment', () => {
    const amazon = policyFor('amazon')!;
    const bought = new Date('2026-10-01T18:00:00Z');
    expect(amazon.priceSource).toBe('serpapi_amazon');
    expect(deadlineFor(amazon, bought, {})!.toISOString().slice(0, 10)).toBe('2026-10-31');
    expect(amazon.claimSteps.join(' ')).toMatch(/does not refund the difference/);
  });

  it('reads an order confirmation, by its "Ordered:" subject', () => {
    expect(policyForSender('Amazon.com <auto-confirm@amazon.com>')?.id).toBe('amazon');
    expect(emailRole('Ordered: "Example Carpet Cleaner, XL…"')).toBe('purchase');
    expect(emailRole('Shipped: "Example Carpet Cleaner, XL…"')).toBe('update');
    expect(emailRole('Delivered: "Example Carpet Cleaner, XL…"')).toBe('update');
  });

  const order = (total: string) => ({
    from: 'Amazon.com <auto-confirm@amazon.com>',
    subject: 'Ordered: "Example Carpet Cleaner, XL…"',
    receivedAt: '2026-10-01T18:00:00Z',
    text: '',
    html: `<p>Thanks for your order, Pat!</p><p>Order #</p><p>112-1234567-7654321</p>
<a href="https://www.amazon.com/gp/product/B00EXAMPLE?ref=ppx">Example Carpet Cleaner, XL…</a>
<p>Quantity: 1</p><p>Grand Total:</p><p>${total}</p>`,
  });

  it('keeps an order worth watching, with its item and ASIN', () => {
    const p = extractPurchase(order('$466.54'), policyFor('amazon')!)!;
    expect(p).toMatchObject({ merchant: 'amazon', orderRef: '112-1234567-7654321', totalCents: 46654, confidence: 'low' });
    expect(p.items).toEqual([{ title: 'Example Carpet Cleaner, XL…', sku: 'B00EXAMPLE', quantity: 1 }]);
  });

  it('does not track a small order', () => {
    expect(extractPurchase(order('$12.99'), policyFor('amazon')!)).toBeNull();
  });
});
