import Script from 'next/script';

/**
 * Loads the global AdSense script once. Placed in the root layout. AdSlot
 * components elsewhere expect this to have run.
 *
 * Renders nothing if NEXT_PUBLIC_ADSENSE_CLIENT isn't set.
 */
export function AdSenseScript() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  if (!client) return null;
  return (
    <Script
      async
      strategy="afterInteractive"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
      crossOrigin="anonymous"
    />
  );
}
