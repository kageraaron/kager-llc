import { Metadata } from 'next';
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
        <script
          async 
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2940894836192894" 
          crossOrigin="anonymous"
        />
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-TT7HYVRZGJ"></script>
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'G-TT7HYVRZGJ');
        `}} />

        <script async src="https://www.googletagmanager.com/gtag/js?id=AW-401588546"></script>
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'AW-401588546');
        `}} />
      </head>
      <body>
        <nav style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border)' }}>
          <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <a href="/" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
              Local-Convert
            </a>
            <div style={{ display: 'flex', gap: '2rem', fontSize: '0.9rem' }}>
              <a href="/">Home</a>
              <a href="/tools">Tools</a>
              <a href="/about">About</a>
            </div>
          </div>
        </nav>
        {children}
        <footer style={{ padding: '4rem 2rem', borderTop: '1px solid var(--border)', marginTop: '4rem' }}>
          <div className="container" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <p>&copy; {new Date().getFullYear()} Local-Convert. All files processed locally.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
