type Feature = {
  title: string;
  description: string;
  keyword: string;
};

const features: Feature[] = [
  {
    title: 'AI Image Upscaler',
    keyword: '4x upscale',
    description:
      'Real-ESRGAN runs on your GPU to enlarge photos up to 4× with crisp detail — perfect for prints.',
  },
  {
    title: 'Photo Colorizer',
    keyword: 'colorize B&W',
    description:
      'Turn black-and-white photos into rich color in seconds with a state-of-the-art DDColor model.',
  },
  {
    title: 'Object Remover',
    keyword: 'inpainting',
    description:
      'Brush over photobombers, wires, or blemishes. LaMa-style inpainting fills the gap seamlessly.',
  },
  {
    title: 'Face Restoration',
    keyword: 'restore old photos',
    description:
      'Bring back detail in old or low-quality portraits with GFPGAN — without the uncanny-valley look.',
  },
  {
    title: 'Background Remover',
    keyword: 'transparent PNG',
    description:
      'One-click subject isolation with a clean alpha channel. Great for product shots and portraits.',
  },
  {
    title: 'Print Anywhere',
    keyword: 'canvas prints',
    description:
      'Send your finished image straight to canvas, framed, metal, or poster prints — shipped to 100+ countries.',
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Everything you need to make a photo print-ready
        </h2>
        <p className="mt-4 text-ink-400 max-w-2xl mx-auto">
          Six AI tools built for one job: making your photos look incredible on a wall.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f) => (
          <article
            key={f.title}
            className="rounded-xl ring-1 ring-ink-800 bg-ink-900/40 p-6 hover:bg-ink-900 transition"
          >
            <div className="text-xs uppercase tracking-wider text-accent font-medium">
              {f.keyword}
            </div>
            <h3 className="mt-2 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-ink-400 leading-relaxed">{f.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
