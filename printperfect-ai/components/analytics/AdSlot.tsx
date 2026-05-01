'use client';

import { useEffect, useRef } from 'react';

/**
 * Single AdSense ad unit.
 *
 * - Falls back to a discreet placeholder when AdSense isn't configured (dev,
 *   self-hosting without an account). Production swaps it for the real ad.
 * - Re-pushes on remount so it shows again when toggled (the AdSense
 *   `adsbygoogle.push` is idempotent per <ins> element).
 */
export function AdSlot({
  slotId,
  layout = 'auto',
  format = 'auto',
  className,
  label = 'Sponsored',
}: {
  slotId?: string;
  layout?: string;
  format?: string;
  className?: string;
  label?: string;
}) {
  const insRef = useRef<HTMLModElement>(null);
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const resolvedSlotId = slotId ?? process.env.NEXT_PUBLIC_ADSENSE_PROCESSING_SLOT ?? '';
  const enabled = Boolean(client && resolvedSlotId);

  useEffect(() => {
    if (!enabled) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle ?? [];
      w.adsbygoogle.push({});
    } catch {
      /* swallow — ad blockers commonly throw here */
    }
  }, [enabled]);

  if (!enabled) {
    return (
      <div
        className={`flex h-24 items-center justify-center rounded-md border border-dashed border-ink-700 text-xs text-ink-500 ${
          className ?? ''
        }`}
      >
        {label} placeholder
      </div>
    );
  }

  return (
    <div className={className}>
      <ins
        ref={insRef}
        className="adsbygoogle block"
        style={{ display: 'block', minHeight: 96 }}
        data-ad-client={client}
        data-ad-slot={resolvedSlotId}
        data-ad-layout={layout}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
