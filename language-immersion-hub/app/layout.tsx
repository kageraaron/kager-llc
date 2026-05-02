import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/lib/i18n';
import TranslationToolbar from '@/components/TranslationToolbar';
import HeaderNav from '@/components/HeaderNav';

export const metadata: Metadata = {
  title: {
    default: 'Language Immersion Hub — Best Movies & Books by CEFR Level',
    template: '%s | Language Immersion Hub',
  },
  description:
    'Master any language with 50+ curated movies and books mapped to CEFR levels (A1-C2). The scientific way to fluency through native content.',
  keywords: [
    'language immersion',
    'learn spanish with movies',
    'learn french with books',
    'CEFR levels',
    'Lingopie',
    'Italki',
    'language learning resources',
    'graded readers',
    'immersion database',
    'best movies for language learners',
  ],
  metadataBase: new URL('https://languageimmersionhub.com'),
  openGraph: {
    title: 'Language Immersion Hub — Master Languages with Native Media',
    description:
      'Curated database of 50+ foreign language movies and books mapped to CEFR levels for effective immersion.',
    url: 'https://languageimmersionhub.com',
    siteName: 'Language Immersion Hub',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Language Immersion Hub',
    description: 'Stop studying. Start immersion. 50+ resources mapped to CEFR levels.',
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
  alternates: {
    canonical: 'https://languageimmersionhub.com',
    languages: {
      'en-US': 'https://languageimmersionhub.com/en',
      'es-ES': 'https://languageimmersionhub.com/es',
      'fr-FR': 'https://languageimmersionhub.com/fr',
      'de-DE': 'https://languageimmersionhub.com/de',
      'ja-JP': 'https://languageimmersionhub.com/ja',
      'it-IT': 'https://languageimmersionhub.com/it',
      'pt-PT': 'https://languageimmersionhub.com/pt',
      'zh-CN': 'https://languageimmersionhub.com/zh',
      'ru-RU': 'https://languageimmersionhub.com/ru',
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
        <link rel="icon" href="/favicon.ico" />
        {/* Advanced Schema.org for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "EducationalOccupationalCredential",
              "name": "CEFR Proficiency",
              "description": "Common European Framework of Reference for Languages",
              "credentialCategory": "Language Proficiency",
              "educationalLevel": ["A1", "A2", "B1", "B2", "C1", "C2"]
            })
          }}
        />
      </head>
      <body className="antialiased">
        <I18nProvider>
          <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
              <div className="text-xl font-extrabold tracking-tighter text-blue-600">
                LINGO NEXUS
              </div>
              <HeaderNav />
              <TranslationToolbar />
            </div>
          </header>
          <div className="pt-16">{children}</div>
          <footer className="bg-gray-50 border-t border-gray-200 py-12">
            <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
              <p>&copy; 2026 Lingo Nexus — All rights reserved.</p>
              <p className="mt-2 text-xs">Affiliate disclosure: Links on this page may earn a commission.</p>
            </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
