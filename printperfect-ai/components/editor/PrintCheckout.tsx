'use client';

import { useEffect, useMemo, useState } from 'react';
import { useActiveItem } from '@/lib/store';
import { bitmapToBlob } from '@/lib/image/canvas';
import type { PrintifyAddress } from '@/lib/printify/types';

type Supplier = 'printify' | 'printful';

type Product = {
  id: number;
  title: string;
  brand?: string | null;
  image: string | null;
};

type Provider = { id: number; title: string };

type Variant = {
  id: number;
  title: string;
  options?: Record<string, string | number>;
  /** Display price in *cents*. We normalize across suppliers. */
  price: number;
  /** Optional thumbnail (Printful provides per-variant images). */
  image?: string;
};

type Step = 'supplier' | 'product' | 'variant' | 'address' | 'review' | 'submitting' | 'done';

const EMPTY_ADDRESS: PrintifyAddress = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  country: 'US',
  region: '',
  address1: '',
  address2: '',
  city: '',
  zip: '',
};

export function PrintCheckout({ onClose }: { onClose: () => void }) {
  const item = useActiveItem();
  const currentImage = item?.currentImage ?? null;

  const [supplier, setSupplier] = useState<Supplier>('printify');
  const [step, setStep] = useState<Step>('supplier');
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);

  // Printify-only: providers (Printful skips this step).
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [variant, setVariant] = useState<Variant | null>(null);
  const [variantsLoading, setVariantsLoading] = useState(false);

  const [address, setAddress] = useState<PrintifyAddress>(EMPTY_ADDRESS);
  const [imageId, setImageId] = useState<string | number | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  // Whenever supplier changes, reset downstream state.
  useEffect(() => {
    setProduct(null);
    setProviders([]);
    setProvider(null);
    setVariants([]);
    setVariant(null);
    setImageId(null);
  }, [supplier]);

  // Load product catalog for the chosen supplier on demand.
  useEffect(() => {
    if (step !== 'product') return;
    let cancelled = false;
    setProductsLoading(true);
    setError(null);
    (async () => {
      try {
        const url = supplier === 'printify' ? '/api/printify/products' : '/api/printful/products';
        const res = await fetch(url);
        const json = (await res.json()) as { products?: Product[]; error?: string };
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setProducts(json.products ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, supplier]);

  // When a product is picked, load variants (and providers, for Printify).
  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    setVariantsLoading(true);
    setError(null);
    (async () => {
      try {
        if (supplier === 'printify') {
          const detailRes = await fetch(`/api/printify/blueprints/${product.id}`);
          const detail = (await detailRes.json()) as {
            providers?: Provider[];
            error?: string;
          };
          if (cancelled) return;
          if (detail.error || !detail.providers?.length) {
            setError(detail.error ?? 'No print providers available');
            return;
          }
          setProviders(detail.providers);
          const firstProvider = detail.providers[0];
          setProvider(firstProvider);
          await loadPrintifyVariants(product.id, firstProvider.id, cancelled);
        } else {
          // Printful: variants come straight from the product detail endpoint.
          const res = await fetch(`/api/printful/products/${product.id}`);
          const json = (await res.json()) as {
            variants?: Array<{
              id: number;
              name: string;
              size?: string;
              color?: string;
              image?: string;
              price: number;
            }>;
            error?: string;
          };
          if (cancelled) return;
          if (json.error) {
            setError(json.error);
            return;
          }
          const vs: Variant[] = (json.variants ?? []).map((v) => ({
            id: v.id,
            title: [v.name, v.size, v.color].filter(Boolean).join(' · '),
            // Printful prices come in dollars; convert to cents for display.
            price: Math.round(v.price * 100),
            image: v.image,
          }));
          setVariants(vs);
          setVariant(vs[0] ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load variants');
      } finally {
        if (!cancelled) setVariantsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, supplier]);

  async function loadPrintifyVariants(blueprintId: number, providerId: number, cancelled: boolean) {
    const varRes = await fetch(`/api/printify/variants/${blueprintId}/${providerId}`);
    const vars = (await varRes.json()) as {
      variants?: Array<{
        id: number;
        title: string;
        options?: Record<string, string | number>;
        price: number;
      }>;
    };
    if (cancelled) return;
    const vs: Variant[] = (vars.variants ?? []).map((v) => ({
      id: v.id,
      title: v.title,
      options: v.options,
      price: v.price, // already cents
    }));
    setVariants(vs);
    setVariant(vs[0] ?? null);
  }

  const total = useMemo(() => (variant ? formatPrice(variant.price) : '—'), [variant]);

  async function ensureUploaded(): Promise<string | number> {
    if (imageId !== null) return imageId;
    if (!currentImage) throw new Error('No image to upload');
    const blob = await bitmapToBlob(currentImage, 'image/png');
    const base64 = await blobToBase64(blob);
    const url = supplier === 'printify' ? '/api/printify/upload' : '/api/printful/upload';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'printperfect.png', base64 }),
    });
    const json = (await res.json()) as { id?: string | number; error?: string };
    if (json.error || json.id === undefined) throw new Error(json.error ?? 'Upload failed');
    setImageId(json.id);
    return json.id;
  }

  async function submitOrder() {
    if (!product || !variant) return;
    setStep('submitting');
    setError(null);
    try {
      const id = await ensureUploaded();
      if (supplier === 'printify') {
        if (!provider) throw new Error('No provider selected');
        const body = {
          external_id: `pp_${Date.now()}`,
          label: `PrintPerfect order ${new Date().toISOString()}`,
          line_items: [
            {
              print_provider_id: provider.id,
              blueprint_id: product.id,
              variant_id: variant.id,
              print_areas: { front: id as string },
              quantity: 1,
            },
          ],
          shipping_method: 1,
          send_shipping_notification: true,
          address_to: address,
        };
        const res = await fetch('/api/printify/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          order?: { id?: string | number };
          error?: string;
        };
        if (!res.ok || json.error) throw new Error(json.error ?? 'Order failed');
        setOrderId(String(json.order?.id ?? 'unknown'));
        setStep('done');
        return;
      }

      // Printful path: hand off to Stripe Checkout. The webhook will submit
      // the actual Printful order once payment succeeds, so the user is
      // never charged the wholesale price directly.
      const recipient = {
        name: `${address.first_name} ${address.last_name}`.trim(),
        address1: address.address1,
        address2: address.address2 || undefined,
        city: address.city,
        state_code: address.region || undefined,
        country_code: address.country,
        zip: address.zip,
        email: address.email,
        phone: address.phone || undefined,
      };
      const stripeRes = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: product.title,
          variantTitle: variant.title,
          amountCents: variant.price,
          printfulVariantId: variant.id,
          printfulFileId: id,
          recipient,
        }),
      });
      const stripeJson = (await stripeRes.json()) as { url?: string; error?: string };
      if (!stripeRes.ok || !stripeJson.url) {
        throw new Error(stripeJson.error ?? 'Could not start checkout');
      }
      // Redirect — Stripe Checkout takes over from here.
      window.location.href = stripeJson.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed');
      setStep('review');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-ink-900 ring-1 ring-ink-800 shadow-2xl">
        <header className="flex items-center justify-between border-b border-ink-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Order as print</h2>
            <StepIndicator step={step} supplier={supplier} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-300 hover:bg-ink-800 hover:text-ink-50 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-md ring-1 ring-red-700/40 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {step === 'supplier' && (
            <SupplierStep value={supplier} onChange={setSupplier} />
          )}

          {step === 'product' && (
            <ProductStep
              loading={productsLoading}
              products={products}
              selected={product}
              onSelect={setProduct}
            />
          )}

          {step === 'variant' && product && (
            <VariantStep
              product={product}
              supplier={supplier}
              providers={providers}
              provider={provider}
              variants={variants}
              variant={variant}
              loading={variantsLoading}
              onProviderChange={async (p) => {
                setProvider(p);
                setVariantsLoading(true);
                try {
                  await loadPrintifyVariants(product.id, p.id, false);
                } finally {
                  setVariantsLoading(false);
                }
              }}
              onVariantChange={setVariant}
            />
          )}

          {step === 'address' && (
            <AddressStep address={address} onChange={setAddress} />
          )}

          {(step === 'review' || step === 'submitting') && product && variant && (
            <ReviewStep
              product={product}
              provider={provider}
              variant={variant}
              address={address}
              total={total}
              supplier={supplier}
              submitting={step === 'submitting'}
            />
          )}

          {step === 'done' && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">✓</div>
              <h3 className="text-xl font-semibold">Order placed</h3>
              <p className="mt-2 text-sm text-ink-400">
                Order id <code className="text-ink-200">{orderId}</code>. Tracking will be emailed
                to <span className="text-ink-200">{address.email}</span>.
              </p>
              {supplier === 'printful' && (
                <p className="mt-4 text-xs text-ink-500">
                  Payment captured via Stripe; order forwarded to Printful for production.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-ink-800 px-6 py-4">
          <div className="text-sm text-ink-400">
            {variant && step !== 'done' && step !== 'product' && step !== 'supplier'
              ? `Total: ${total}${supplier === 'printful' ? ' (incl. markup)' : ''}`
              : ''}
          </div>
          <div className="flex items-center gap-2">
            {step !== 'supplier' && step !== 'done' && step !== 'submitting' && (
              <button
                type="button"
                onClick={() => setStep(prev(step))}
                className="rounded-md px-3 py-1.5 text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-50 transition"
              >
                Back
              </button>
            )}
            {step === 'done' ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover transition"
              >
                Close
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  !canAdvance(step, { product, variant, address, supplier }) ||
                  step === 'submitting'
                }
                onClick={() => {
                  if (step === 'review') void submitOrder();
                  else setStep(next(step));
                }}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {step === 'submitting'
                  ? 'Submitting…'
                  : step === 'review'
                  ? supplier === 'printful'
                    ? 'Pay & order'
                    : 'Place order'
                  : 'Continue'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

const STEP_ORDER: Step[] = ['supplier', 'product', 'variant', 'address', 'review'];
function next(s: Step): Step {
  const i = STEP_ORDER.indexOf(s);
  return STEP_ORDER[Math.min(STEP_ORDER.length - 1, i + 1)];
}
function prev(s: Step): Step {
  const i = STEP_ORDER.indexOf(s);
  return STEP_ORDER[Math.max(0, i - 1)];
}

function canAdvance(
  s: Step,
  ctx: {
    product: Product | null;
    variant: Variant | null;
    address: PrintifyAddress;
    supplier: Supplier;
  },
): boolean {
  if (s === 'supplier') return true;
  if (s === 'product') return !!ctx.product;
  if (s === 'variant') return !!ctx.variant;
  if (s === 'address')
    return Boolean(
      ctx.address.first_name &&
        ctx.address.last_name &&
        ctx.address.email &&
        ctx.address.address1 &&
        ctx.address.city &&
        ctx.address.zip &&
        ctx.address.country,
    );
  if (s === 'review') return true;
  return false;
}

function StepIndicator({ step, supplier }: { step: Step; supplier: Supplier }) {
  const labels: Record<Step, string> = {
    supplier: 'Choose a print partner',
    product: 'Pick a product',
    variant: 'Choose size & finish',
    address: 'Shipping details',
    review: 'Review',
    submitting: 'Submitting',
    done: 'Done',
  };
  return (
    <p className="text-xs text-ink-400">
      {labels[step]} <span className="text-ink-600">·</span>{' '}
      <span className="capitalize">{supplier}</span>
    </p>
  );
}

function SupplierStep({
  value,
  onChange,
}: {
  value: Supplier;
  onChange: (s: Supplier) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <SupplierCard
        active={value === 'printify'}
        onClick={() => onChange('printify')}
        title="Printify"
        body="Largest catalog. Multiple print providers per product, so you can pick the cheapest or fastest."
      />
      <SupplierCard
        active={value === 'printful'}
        onClick={() => onChange('printful')}
        title="Printful"
        body="Tighter quality control, single source. Prices include our standard markup."
      />
    </div>
  );
}

function SupplierCard({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg ring-1 p-5 transition ${
        active ? 'ring-accent bg-accent/10' : 'ring-ink-800 hover:bg-ink-800/40'
      }`}
    >
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-ink-400">{body}</p>
    </button>
  );
}

function ProductStep({
  loading,
  products,
  selected,
  onSelect,
}: {
  loading: boolean;
  products: Product[];
  selected: Product | null;
  onSelect: (p: Product) => void;
}) {
  if (loading) return <p className="text-sm text-ink-400">Loading products…</p>;
  if (!products.length)
    return (
      <p className="text-sm text-ink-400">
        No products yet. Set the relevant <code className="text-ink-200">*_API_TOKEN</code> in{' '}
        <code>.env.local</code>.
      </p>
    );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {products.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p)}
          className={`text-left rounded-lg ring-1 p-3 transition ${
            selected?.id === p.id ? 'ring-accent bg-accent/10' : 'ring-ink-800 hover:bg-ink-800/40'
          }`}
        >
          {p.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.image}
              alt={p.title}
              className="aspect-square w-full rounded-md object-cover bg-ink-800"
            />
          )}
          <div className="mt-2 text-sm font-medium line-clamp-1">{p.title}</div>
          {p.brand && <div className="text-xs text-ink-400">{p.brand}</div>}
        </button>
      ))}
    </div>
  );
}

function VariantStep({
  product,
  supplier,
  providers,
  provider,
  variants,
  variant,
  loading,
  onProviderChange,
  onVariantChange,
}: {
  product: Product;
  supplier: Supplier;
  providers: Provider[];
  provider: Provider | null;
  variants: Variant[];
  variant: Variant | null;
  loading: boolean;
  onProviderChange: (p: Provider) => void;
  onVariantChange: (v: Variant) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-ink-100">Product</h3>
        <p className="text-sm text-ink-400">{product.title}</p>
      </div>

      {supplier === 'printify' && providers.length > 1 && (
        <div>
          <label htmlFor="provider" className="text-sm font-semibold text-ink-100">
            Print provider
          </label>
          <select
            id="provider"
            value={provider?.id ?? ''}
            onChange={(e) => {
              const p = providers.find((pp) => pp.id === Number(e.target.value));
              if (p) onProviderChange(p);
            }}
            className="mt-1 w-full rounded-md bg-ink-950 ring-1 ring-ink-800 px-3 py-2 text-sm"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-ink-100 mb-2">Size & finish</h3>
        {loading && <p className="text-sm text-ink-400">Loading variants…</p>}
        {!loading && (
          <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onVariantChange(v)}
                className={`text-left rounded-md ring-1 px-3 py-2 transition ${
                  variant?.id === v.id
                    ? 'ring-accent bg-accent/10'
                    : 'ring-ink-800 hover:bg-ink-800/40'
                }`}
              >
                <div className="text-sm font-medium">{v.title}</div>
                <div className="text-xs text-ink-400">{formatPrice(v.price)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddressStep({
  address,
  onChange,
}: {
  address: PrintifyAddress;
  onChange: (a: PrintifyAddress) => void;
}) {
  const set = (k: keyof PrintifyAddress) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...address, [k]: e.target.value });
  const inputCls =
    'mt-1 w-full rounded-md bg-ink-950 ring-1 ring-ink-800 px-3 py-2 text-sm placeholder:text-ink-600';
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="First name">
        <input className={inputCls} value={address.first_name} onChange={set('first_name')} />
      </Field>
      <Field label="Last name">
        <input className={inputCls} value={address.last_name} onChange={set('last_name')} />
      </Field>
      <Field label="Email" wide>
        <input
          type="email"
          className={inputCls}
          value={address.email}
          onChange={set('email')}
          placeholder="you@example.com"
        />
      </Field>
      <Field label="Phone (optional)" wide>
        <input className={inputCls} value={address.phone ?? ''} onChange={set('phone')} />
      </Field>
      <Field label="Address line 1" wide>
        <input className={inputCls} value={address.address1} onChange={set('address1')} />
      </Field>
      <Field label="Address line 2 (optional)" wide>
        <input className={inputCls} value={address.address2 ?? ''} onChange={set('address2')} />
      </Field>
      <Field label="City">
        <input className={inputCls} value={address.city} onChange={set('city')} />
      </Field>
      <Field label="State / Region">
        <input className={inputCls} value={address.region ?? ''} onChange={set('region')} />
      </Field>
      <Field label="Zip / Postal">
        <input className={inputCls} value={address.zip} onChange={set('zip')} />
      </Field>
      <Field label="Country (ISO 2)">
        <input
          className={inputCls}
          value={address.country}
          onChange={set('country')}
          placeholder="US"
          maxLength={2}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${wide ? 'col-span-2' : ''}`}>
      <span className="text-xs text-ink-300">{label}</span>
      {children}
    </label>
  );
}

function ReviewStep({
  product,
  provider,
  variant,
  address,
  total,
  supplier,
  submitting,
}: {
  product: Product;
  provider: Provider | null;
  variant: Variant;
  address: PrintifyAddress;
  total: string;
  supplier: Supplier;
  submitting: boolean;
}) {
  return (
    <div className="space-y-4">
      <Section title="Item">
        <div className="text-sm">
          <div className="font-medium">{product.title}</div>
          <div className="text-ink-400">{variant.title}</div>
          {provider && <div className="text-ink-500 text-xs">via {provider.title}</div>}
          <div className="text-ink-500 text-xs mt-1 capitalize">Fulfilled by {supplier}</div>
        </div>
      </Section>
      <Section title="Ship to">
        <div className="text-sm text-ink-300 leading-relaxed">
          {address.first_name} {address.last_name}
          <br />
          {address.address1}
          {address.address2 ? `, ${address.address2}` : ''}
          <br />
          {address.city}, {address.region} {address.zip}
          <br />
          {address.country}
          <br />
          <span className="text-ink-500">{address.email}</span>
        </div>
      </Section>
      <Section title="Total">
        <div className="text-lg font-semibold">{total}</div>
        <p className="text-xs text-ink-500 mt-1">
          {supplier === 'printful'
            ? 'Includes 20% PrintPerfect markup. Shipping calculated by Printful after submission.'
            : 'Shipping calculated by Printify after submission.'}
        </p>
      </Section>
      {submitting && (
        <p className="text-sm text-ink-400">Uploading your image and placing the order…</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg ring-1 ring-ink-800 bg-ink-950/40 p-4">
      <div className="text-xs uppercase tracking-wider text-ink-500 mb-2">{title}</div>
      {children}
    </div>
  );
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.replace(/^data:[^,]+,/, ''));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
