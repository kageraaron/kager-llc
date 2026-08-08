import { Metadata } from 'next';
import { I18nProvider } from '@/lib/i18n';
import Script from 'next/script';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Analytics from '@/components/Analytics';
import './globals.css';


const baseUrl = 'https://local-convert.com';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'Local File Converter | 100% Private & Browser-Based',
    template: '%s | Local-Convert',
  },
  description: 'Convert images, videos, audio, and PDFs locally in your browser. No uploads, total privacy, no file size limits. Powered by WASM and FFmpeg.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Local File Converter | Privacy-First & Fast',
    description: '100% private file conversion. No uploads, no servers, just browser-based speed.',
    url: baseUrl,
    siteName: 'Local-Convert',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Local File Converter | Privacy-First & Fast',
    description: 'Convert your files locally in your browser. No uploads, total privacy.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <Analytics
          ga4="G-TT7HYVRZGJ"
          ads="AW-401588546"
          adsense="ca-pub-2940894836192894"
        />
      </head>
      <body>
        <I18nProvider>
          <Navbar />
          {children}
          <Footer />
        </I18nProvider>
      </body>
    </html>
  );
}
