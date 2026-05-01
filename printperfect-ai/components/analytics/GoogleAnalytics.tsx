import Script from 'next/script';

/**
 * GA4 page-view tracker.
 *
 * Renders nothing if NEXT_PUBLIC_GA_ID isn't set, so dev builds don't ping
 * Google. The privacy stance in CLAUDE.md prohibits screen-recording or
 * pixel-data analytics — GA4 (page views + events only) is allowed but
 * Plausible/Fathom would be a better fit for the "your photos never leave
 * the browser" promise. Swap the script src below if you migrate.
 */
export function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  if (!id) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${id}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
