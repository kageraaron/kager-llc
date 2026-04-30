import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Local-Convert | Privacy-First File Conversion',
  description: 'Learn why we built Local-Convert and how our local-first, browser-based conversion technology works.',
};

export default function AboutPage() {
  return (
    <main className="main container" style={{ maxWidth: '800px' }}>
      <section className="hero">
        <h1 className="hero__title">
          The <span style={{ color: 'var(--primary)' }}>privacy-first</span> way to convert files.
        </h1>
        <p className="hero__subtitle">
          Local-Convert was born out of a simple observation: most "online" file converters are a privacy nightmare.
        </p>
      </section>

      <article style={{ marginTop: '3rem', lineHeight: '1.7', fontSize: '1.1rem', color: 'var(--text)' }}>
        <h2 style={{ marginBottom: '1rem' }}>Our Philosophy</h2>
        <p style={{ marginBottom: '1.5rem' }}>
          When you upload a document, image, or video to a typical online converter, you're handing your data to a black box. You don't know who owns that server, how long they keep your file, or if they're using your data to train AI models.
        </p>
        <p style={{ marginBottom: '1.5rem' }}>
          <strong>Local-Convert is different.</strong> We believe your files should never leave your computer unless you explicitly want them to. By using modern web technologies like WebAssembly (WASM) and Web Workers, we've moved the "engine" of the converter from the cloud directly into your browser tab.
        </p>

        <h2 style={{ marginTop: '3rem', marginBottom: '1rem' }}>How it Works</h2>
        <p style={{ marginBottom: '1rem' }}>
          We use industry-standard libraries compiled to run in the browser:
        </p>
        <ul style={{ marginBottom: '2rem', paddingLeft: '1.5rem' }}>
          <li style={{ marginBottom: '0.5rem' }}><strong>FFmpeg.wasm:</strong> The world's most powerful video and audio tool, running locally to re-encode media.</li>
          <li style={{ marginBottom: '0.5rem' }}><strong>pdf-lib & PDF.js:</strong> Professional-grade PDF manipulation without a server.</li>
          <li style={{ marginBottom: '0.5rem' }}><strong>Canvas API:</strong> High-performance image processing using your device's hardware acceleration.</li>
        </ul>

        <h2 style={{ marginTop: '3rem', marginBottom: '1rem' }}>Why We Do This</h2>
        <p style={{ marginBottom: '1.5rem' }}>
          Our mission is to provide essential utility tools that are 100% free, require no signup, and respect user autonomy. We monetize through transparent display ads so that we can keep the lights on.
        </p>
        
        <div style={{ 
          marginTop: '4rem', 
          padding: '2rem', 
          background: 'var(--surface-2)', 
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          textAlign: 'center'
        }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Secure. Fast. Private.</h3>
          <p style={{ color: 'var(--text-muted)' }}>Thank you for choosing a more private web.</p>
        </div>
      </article>
    </main>
  );
}
