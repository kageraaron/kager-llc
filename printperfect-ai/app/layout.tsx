import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/src/lib/i18n';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export const metadata: Metadata = {
  title: {
    default: 'PrintPerfect.ai — Free AI Photo Upscaler, Colorizer & Print Shop',
    template: '%s | PrintPerfect.ai',
  },
  description:
    'Upscale, colorize, and restore your photos with AI — entirely in your browser. Then turn the result into a wall-ready canvas, framed, or metal print, shipped worldwide.',
  metadataBase: new URL('https://printperfect.ai'),
  openGraph: {
    title: 'PrintPerfect.ai — Free AI Photo Enhancement & Prints',
    description:
      'Browser-based AI photo editing. Your images never leave your device. Print the result on canvas, framed, or metal.',
    url: 'https://printperfect.ai',
    siteName: 'PrintPerfect.ai',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PrintPerfect.ai',
    description: 'Free in-browser AI photo enhancement + print-on-demand.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ink-950 text-ink-50 antialiased">
        <I18nProvider>
          <header className="w-full border-b border-ink-800 bg-ink-900/40">
            <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-center">
              <LanguageSwitcher />
            </div>
          </header>
          <main className="pt-4">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
