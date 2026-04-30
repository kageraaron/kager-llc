export function PrivacyCallout() {
  return (
    <section className="max-w-4xl mx-auto px-6 py-12">
      <div className="rounded-2xl ring-1 ring-ink-800 bg-ink-900/50 p-8 grid sm:grid-cols-3 gap-8">
        <div>
          <div className="text-2xl font-semibold">0 bytes</div>
          <div className="mt-1 text-sm text-ink-400">Image data sent to our servers</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">~3s</div>
          <div className="mt-1 text-sm text-ink-400">Typical 12MP upscale on modern laptops</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">$0</div>
          <div className="mt-1 text-sm text-ink-400">To use every editing feature, forever</div>
        </div>
      </div>
    </section>
  );
}
