'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * AdSlot
 * ------
 * A real Google AdSense `<ins class="adsbygoogle">` unit that:
 *   1. Only renders when ads are enabled via NEXT_PUBLIC_ADSENSE_ENABLED.
 *   2. Pushes to `adsbygoogle` to request a fill.
 *   3. Watches AdSense's `data-ad-status` attribute. If the slot reports
 *      "unfilled" (no ad available) or never fills within a short window,
 *      the component removes itself from the DOM entirely — no placeholder,
 *      no dashed box, no reserved whitespace.
 *
 * This means while we're awaiting AdSense approval (NEXT_PUBLIC_ADSENSE_ENABLED
 * unset or "false"), nothing renders here. After approval, slots that don't
 * receive a fill silently collapse instead of showing an empty box.
 *
 * Layout-shift note: we *do* reserve space (min-height) until AdSense responds,
 * to keep CLS low when an ad does fill. That reserved space is removed if the
 * slot is determined to be empty.
 */

const AD_CLIENT = 'ca-pub-2940894836192894';
const FILL_TIMEOUT_MS = 4000;

export type AdFormat = 'banner' | 'rectangle' | 'auto';

interface AdSlotProps {
  /** AdSense ad unit slot ID (data-ad-slot). Required when ads are enabled. */
  slot?: string;
  /** Visual size class. */
  format?: AdFormat;
  /** Optional inline style overrides for the wrapper. */
  style?: React.CSSProperties;
  /** Optional className for the wrapper. */
  className?: string;
}

const adsEnabled = (): boolean =>
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_ADSENSE_ENABLED === 'true';

export default function AdSlot({
  slot,
  format = 'banner',
  style,
  className,
}: AdSlotProps) {
  const insRef = useRef<HTMLModElement | null>(null);
  const [hidden, setHidden] = useState<boolean>(false);

  // If ads aren't turned on, render nothing at all. No placeholder, no space.
  const enabled = adsEnabled();

  useEffect(() => {
    if (!enabled) return;
    if (!insRef.current) return;

    // Push the ad request.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      // adsbygoogle.js failed to load (blocked by extension, network, etc.).
      setHidden(true);
      return;
    }

    // Watch for fill status. AdSense sets data-ad-status="filled" or "unfilled".
    const el = insRef.current;
    const observer = new MutationObserver(() => {
      const status = el.getAttribute('data-ad-status');
      if (status === 'unfilled') {
        setHidden(true);
        observer.disconnect();
      } else if (status === 'filled') {
        observer.disconnect();
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ['data-ad-status'] });

    // Fallback: if AdSense never reports a status, collapse after a few seconds.
    const timeout = window.setTimeout(() => {
      const status = el.getAttribute('data-ad-status');
      if (status !== 'filled') setHidden(true);
      observer.disconnect();
    }, FILL_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [enabled]);

  if (!enabled || hidden) return null;

  const sizeClass =
    format === 'rectangle' ? 'ad-rectangle' : format === 'banner' ? 'ad-banner' : '';

  return (
    <div className={`ad-container ${sizeClass} ${className ?? ''}`} style={style}>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', height: '100%' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format === 'auto' ? 'auto' : undefined}
        data-full-width-responsive={format === 'auto' ? 'true' : undefined}
      />
    </div>
  );
}
