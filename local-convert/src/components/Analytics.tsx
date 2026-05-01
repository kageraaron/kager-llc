'use client';

import Script from 'next/script';

/**
 * Analytics — Centralized Google tracking component
 * ==================================================
 * Drop this into any Next.js layout to inject GA4, Google Ads,
 * and AdSense. Pass tracking IDs as props — omit any to skip.
 *
 * Usage:
 *   <Analytics ga4="G-XXXXXXXXXX" ads="AW-XXXXXXXXXX" adsense="ca-pub-XXXXXXXXXXXXXXXX" />
 */

interface AnalyticsProps {
  /** Google Analytics 4 measurement ID (e.g. "G-TT7HYVRZGJ") */
  ga4?: string;
  /** Google Ads conversion tracking ID (e.g. "AW-401588546") */
  ads?: string;
  /** Google AdSense publisher ID (e.g. "ca-pub-2940894836192894") */
  adsense?: string;
}

export default function Analytics({ ga4, ads, adsense }: AnalyticsProps) {
  const gtagIds = [ga4, ads].filter(Boolean) as string[];
  const primaryId = gtagIds[0];

  return (
    <>
      {/* Google Tag Manager / gtag.js — single loader for both GA4 + Ads */}
      {primaryId && (
        <>
          <Script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${primaryId}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              ${gtagIds.map((id) => `gtag('config', '${id}');`).join('\n')}
            `}
          </Script>
        </>
      )}

      {/* Google AdSense */}
      {adsense && (
        <Script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsense}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
