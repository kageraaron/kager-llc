/**
 * Per-feature SEO config. Each entry powers one /(feature) landing page,
 * its <title>/description metadata, JSON-LD, and the deep-link into the
 * editor with the right tool pre-selected.
 *
 * Keep `h1` and `intro` keyword-rich but human — these are the primary
 * ranking surfaces.
 */

import type { FeaturePageConfig } from '@/components/marketing/FeaturePage';

export const FEATURE_CONFIGS: Record<string, FeaturePageConfig> = {
  upscaler: {
    slug: 'upscaler',
    toolId: 'upscale',
    h1: 'Free AI image upscaler — enlarge photos 4× without losing quality',
    intro:
      'Upscale low-resolution images to 4× the size with crisp, natural detail. Powered by Real-ESRGAN, running entirely in your browser. No upload, no signup, no watermark.',
    cta: 'Upscale a photo — free',
    benefits: [
      {
        title: '4× the resolution',
        body: 'Real-ESRGAN reconstructs detail beyond what bilinear or bicubic resizing can achieve. Perfect for prepping images for canvas prints.',
      },
      {
        title: 'Private by default',
        body: 'Your image never leaves your browser. The model runs on your device using WebGPU or WebAssembly.',
      },
      {
        title: 'Free, no caps',
        body: 'No subscriptions, no resolution limits, no daily quotas. Process as many images as you like.',
      },
    ],
    steps: [
      { title: 'Drop your image', body: 'PNG, JPG, or WebP — anything your browser can decode.' },
      { title: 'Hit Upscale 4×', body: 'The model tiles your image and processes it on your GPU.' },
      { title: 'Download or print', body: 'Save the result, or order it as a canvas, framed, or metal print.' },
    ],
    faq: [
      {
        q: 'How does AI upscaling differ from regular image resizing?',
        a: 'Bilinear or bicubic resizing just smooths out pixels. AI upscalers like Real-ESRGAN have learned what real high-resolution detail looks like for textures, edges, and faces, so they can recreate that detail rather than just stretching what was there.',
      },
      {
        q: 'How big can the input image be?',
        a: 'Practically, you can process most consumer photos (up to ~24MP). The image is tiled and upscaled in chunks so it fits in GPU memory.',
      },
      {
        q: 'Is my image uploaded anywhere?',
        a: 'No. The entire pipeline — model loading, inference, and the upscaled result — happens in your browser. Open Network DevTools and watch for yourself.',
      },
      {
        q: 'What does it cost?',
        a: 'The upscaler is free to use, forever. We earn revenue only when you choose to print the result through our integrated print partner.',
      },
    ],
  },

  colorize: {
    slug: 'colorize',
    toolId: 'colorize',
    h1: 'AI photo colorizer — bring black-and-white photos to life',
    intro:
      'Colorize black-and-white or sepia photos with realistic, natural tones. Built on the DDColor model, running 100% in your browser — perfect for restoring old family memories.',
    cta: 'Colorize a photo — free',
    benefits: [
      {
        title: 'Natural color',
        body: 'DDColor predicts plausible colors for skin, foliage, sky, and clothing — not the cartoonish tones older colorizers produced.',
      },
      {
        title: 'Detail preserved',
        body: 'We re-combine predicted color with the original full-resolution luminance, so sharpness and texture are unchanged.',
      },
      {
        title: 'Photos stay private',
        body: 'No upload. Your great-grandparents\' wedding photo stays on your device.',
      },
    ],
    steps: [
      { title: 'Drop your B&W photo', body: 'Old scans and sepia images both work.' },
      { title: 'Click Colorize', body: 'The model adds chromatic information to every region of the image.' },
      { title: 'Print as a keepsake', body: 'Order it as a framed print to give as a gift.' },
    ],
    faq: [
      {
        q: 'Will the colors be historically accurate?',
        a: 'The model predicts plausible colors based on training data, not historical records. Skin tones, foliage, and skies are usually right; specific clothing or object colors are guesses. Treat it as artistic license, not historical truth.',
      },
      {
        q: 'Does it work on partially-faded color photos?',
        a: 'Yes — the model is luminance-driven, so it works on any photo where the brightness signal is intact, including faded color, sepia, and pure grayscale.',
      },
      {
        q: 'What model does it use?',
        a: 'DDColor (Alibaba, 2022), a transformer-based colorization model that operates in the CIELAB color space.',
      },
    ],
  },

  restore: {
    slug: 'restore',
    toolId: 'restore',
    h1: 'AI photo restoration — sharpen blurry portraits and old photos',
    intro:
      'Restore detail in old, blurry, or low-resolution portraits. Bring faces back into focus without the uncanny "AI face" look. Coming soon — based on GFPGAN.',
    cta: 'Try the editor',
    benefits: [
      {
        title: 'Faces, not aliens',
        body: 'GFPGAN is designed for natural-looking face restoration; it preserves identity rather than generating a new face.',
      },
      {
        title: 'Works on tiny inputs',
        body: 'Even a 200×200 portrait scanned from a passport photo can be brought back to a usable resolution.',
      },
      {
        title: 'Browser-only',
        body: 'Sensitive family photos never touch our infrastructure.',
      },
    ],
    steps: [
      { title: 'Drop the photo', body: 'A scanned portrait or low-res snapshot.' },
      { title: 'Restore', body: 'The model detects faces and runs restoration on each.' },
      { title: 'Order a print', body: 'Make a memorial portrait or family print.' },
    ],
    faq: [
      {
        q: 'When will face restoration ship?',
        a: 'It\'s on the roadmap. The infrastructure is in place; we\'re sourcing the right ONNX export of GFPGAN.',
      },
      {
        q: 'Will it work on group photos?',
        a: 'Yes — the model runs on each detected face. The rest of the image is left untouched.',
      },
    ],
  },

  inpaint: {
    slug: 'inpaint',
    toolId: 'inpaint',
    h1: 'AI inpainting — remove unwanted objects from photos',
    intro:
      'Brush over photobombers, power lines, blemishes, or anything else you want gone. The LaMa inpainting model fills the masked region using context from the rest of the image. Free and private.',
    cta: 'Try inpainting — free',
    benefits: [
      {
        title: 'Looks natural',
        body: 'LaMa is built for large-mask inpainting; it doesn\'t leave the obvious smudges that "content-aware fill" tools do.',
      },
      {
        title: 'Brush as fine or wide as you want',
        body: 'Adjustable brush size from 4px to 200px. Paint or erase to refine the selection.',
      },
      {
        title: 'No upload',
        body: 'The entire model runs locally; your photo never leaves the browser.',
      },
    ],
    steps: [
      { title: 'Drop your photo', body: 'Any common image format works.' },
      { title: 'Brush the area to remove', body: 'Painted regions show in red. Use erase to refine.' },
      { title: 'Click Remove', body: 'LaMa fills the masked region with plausible content.' },
    ],
    faq: [
      {
        q: 'Can it remove people from a crowded photo?',
        a: 'Yes — paint over each person. Larger removals work better when there\'s plenty of background to blend into.',
      },
      {
        q: 'How is this different from Photoshop\'s content-aware fill?',
        a: 'LaMa is a deep learning model trained on millions of natural images. It produces structurally consistent results (continuous lines, plausible textures) where rule-based tools often produce blurry artifacts.',
      },
      {
        q: 'Does it work on the entire image at once?',
        a: 'Yes. Unlike upscaling, the inpainter processes the full image in one pass after padding to a multiple of 8 pixels.',
      },
    ],
  },

  'watermark-remover': {
    slug: 'watermark-remover',
    toolId: 'watermark-remove',
    h1: 'Free watermark remover — erase watermarks from any image',
    intro:
      'Brush over a watermark, logo, or unwanted text and remove it cleanly using AI inpainting. Runs entirely in your browser — no upload, no signup, no watermark of our own.',
    cta: 'Remove a watermark — free',
    benefits: [
      {
        title: 'Precise control',
        body: 'A small default brush lets you trace tight around the watermark for the cleanest possible removal.',
      },
      {
        title: 'Context-aware fill',
        body: 'The same LaMa inpainting model used for object removal — designed to preserve textures and edges around the masked region.',
      },
      {
        title: 'Use only on images you own',
        body: 'Removing watermarks from copyrighted material can violate terms of service or law. Only use this on your own images, or where licensing permits.',
      },
    ],
    steps: [
      { title: 'Drop your image', body: 'PNG, JPG, or WebP.' },
      { title: 'Brush the watermark', body: 'Use a small brush and trace closely. Erase to refine.' },
      { title: 'Click Remove', body: 'The masked region is filled in using surrounding context.' },
    ],
    faq: [
      {
        q: 'Is removing watermarks legal?',
        a: 'It depends. You can remove watermarks from your own images freely. Removing watermarks from images you don\'t own typically violates copyright and the platform\'s terms of service.',
      },
      {
        q: 'Will it work on translucent watermarks?',
        a: 'Yes, but the result quality depends on how much underlying detail was occluded by the watermark. Translucent watermarks usually leave more recoverable signal.',
      },
      {
        q: 'Does it work on diagonal text watermarks across the whole image?',
        a: 'It can, but the larger the masked area, the harder it is for the model to invent plausible content. Tight, well-targeted masks always produce the best results.',
      },
    ],
  },

  'background-remover': {
    slug: 'background-remover',
    toolId: 'remove-bg',
    h1: 'AI background remover — one-click transparent PNGs',
    intro:
      'Isolate the subject from any photo with one click. Produces a clean transparent PNG ready for product shots, portraits, or design work. Coming soon — based on RMBG-1.4.',
    cta: 'Try the editor',
    benefits: [
      {
        title: 'Clean alpha edges',
        body: 'RMBG-1.4 produces sharp, clean cutouts even around hair and fur — without halos.',
      },
      {
        title: 'No subscription',
        body: 'Other tools charge per image. PrintPerfect is free.',
      },
      {
        title: 'Private',
        body: 'Browser-only — your product photos and portraits stay yours.',
      },
    ],
    steps: [
      { title: 'Drop your image', body: 'Subjects with clear edges work best.' },
      { title: 'Remove background', body: 'The model produces a clean alpha mask.' },
      { title: 'Export PNG', body: 'Download the cutout for use in design tools.' },
    ],
    faq: [
      {
        q: 'When will this ship?',
        a: 'It\'s next on the roadmap. RMBG-1.4 is permissively licensed and exports cleanly to ONNX.',
      },
      {
        q: 'Will it work on product photos?',
        a: 'Yes — RMBG-1.4 was trained extensively on product imagery.',
      },
    ],
  },
};
