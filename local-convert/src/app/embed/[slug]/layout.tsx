import { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="embed-layout" style={{ minHeight: '100vh', background: 'transparent' }}>
      {children}
    </div>
  );
}
