#!/usr/bin/env node
/**
 * generate-slides.js
 *
 * Reads a blog post, calls Claude to generate carousel slide content,
 * renders slides to HTML, and exports PNGs via puppeteer.
 *
 * Usage:
 *   node social/scripts/generate-slides.js [path/to/post.md]
 *   (if no path given, uses the most recent blog post by mtime)
 *
 * Output:
 *   social/output/slides.json         — structured slide + caption data
 *   social/output/slides.html         — rendered HTML (for debugging)
 *   social/output/slides/slide-01.png — one PNG per slide
 */

import Anthropic from '@anthropic-ai/sdk';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.join(ROOT, 'social', 'output');
const SLIDES_DIR = path.join(OUTPUT_DIR, 'slides');

// ── 1. Resolve blog post ──────────────────────────────────────────────────────

function findMostRecentPost() {
  const blogDir = path.join(ROOT, 'src', 'content', 'blog');
  const files = fs.readdirSync(blogDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ name: f, path: path.join(blogDir, f), mtime: fs.statSync(path.join(blogDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) throw new Error('No blog posts found in src/content/blog/');
  return files[0].path;
}

const postPath = process.argv[2] ? path.resolve(process.argv[2]) : findMostRecentPost();
if (!fs.existsSync(postPath)) { console.error(`Not found: ${postPath}`); process.exit(1); }

const postContent = fs.readFileSync(postPath, 'utf-8');
console.log(`Blog post: ${path.basename(postPath)}\n`);

// ── 2. Generate slide content with Claude ─────────────────────────────────────

const client = new Anthropic();

const systemPrompt = `You are a social media content creator for Rave Wellness (ravewellness.org), a harm reduction website.
Given a blog post, generate Instagram carousel slide content.

Return ONLY valid JSON — no markdown fences, no explanation. Schema:
{
  "post_title": string,
  "caption": string (3-5 punchy sentences, 1-2 relevant emojis, ends with "Save this 🔖" or "Follow for more", NO hashtags),
  "hashtags": string[] (12-15 relevant tags WITHOUT the # symbol),
  "slides": [
    {
      "num": number (1-7),
      "type": "cover" | "content" | "stat" | "quote" | "cta",
      "eyebrow": string (short label, e.g. "Harm Reduction", "The Science", "Key Risk"),
      "headline": string (punchy, 4-10 words max),
      "body": string | null (1-2 sentences for type=content when no bullets),
      "bullets": string[] | null (3-4 items, each under 10 words, for type=content),
      "stat_number": string | null (e.g. "45%", "3x", "Zero" — for type=stat),
      "stat_label": string | null (what the stat means — for type=stat),
      "narration": string (2-4 natural spoken sentences, no lists, no markdown)
    }
  ]
}

Rules:
- Exactly 7 slides: slide 1 = cover, slides 2-6 = content/stat/quote, slide 7 = cta
- cover: compelling question or statement as the headline
- content: one focused point with either body text or 3-4 bullets
- stat: one striking number that makes someone stop scrolling
- quote: a memorable pull-quote from the post (use the headline field)
- cta: eyebrow="Rave Wellness", headline about following for more harm reduction content
- Narration sounds natural read aloud — no bullet points, no markdown characters
- Stay accurate to the blog post — do not invent facts or statistics`;

console.log('Calling Claude to generate slide content...');
const msg = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 2000,
  system: systemPrompt,
  messages: [{ role: 'user', content: `Generate carousel slides for this blog post:\n\n${postContent}` }],
});

let slidesData;
try {
  slidesData = JSON.parse(msg.content[0].text);
} catch {
  console.error('Claude response was not valid JSON:\n', msg.content[0].text.slice(0, 500));
  process.exit(1);
}

fs.mkdirSync(SLIDES_DIR, { recursive: true });
const jsonPath = path.join(OUTPUT_DIR, 'slides.json');
fs.writeFileSync(jsonPath, JSON.stringify(slidesData, null, 2));
console.log(`Saved slides.json (${slidesData.slides.length} slides)`);

// ── 3. Build HTML ─────────────────────────────────────────────────────────────

function slideHtml(s, total) {
  const dots = Array.from({ length: total }, (_, i) =>
    `<div class="dot${i === s.num - 1 ? ' active' : ''}"></div>`
  ).join('');

  let body = '';

  if (s.type === 'cover') {
    body = `
      <div class="slide-body cover-body">
        <div class="glow-orb"></div>
        <div class="eyebrow">${s.eyebrow}</div>
        <div class="headline">${s.headline}</div>
        ${s.body ? `<div class="subtext">${s.body}</div>` : ''}
        <div class="swipe-hint">Swipe to learn more →</div>
      </div>`;

  } else if (s.type === 'stat') {
    body = `
      <div class="slide-body">
        <div class="eyebrow">${s.eyebrow}</div>
        <div class="headline-md">${s.headline}</div>
        <div class="stat-card">
          <div class="stat-num">${s.stat_number}</div>
          <div class="stat-label">${s.stat_label}</div>
        </div>
        ${s.body ? `<div class="subtext" style="margin-top:28px">${s.body}</div>` : ''}
      </div>`;

  } else if (s.type === 'quote') {
    body = `
      <div class="slide-body" style="justify-content:center">
        <div class="eyebrow">${s.eyebrow}</div>
        <div class="quote-block">"${s.headline}"</div>
        ${s.body ? `<div class="subtext" style="margin-top:28px">${s.body}</div>` : ''}
      </div>`;

  } else if (s.type === 'cta') {
    body = `
      <div class="slide-body cta-body">
        <div class="cta-ring"></div>
        <div class="cta-inner">
          <div class="logo-large">Rave<span>Wellness</span></div>
          <div class="eyebrow" style="margin-top:24px;text-align:center">${s.eyebrow}</div>
          <div class="headline-md" style="text-align:center;font-size:46px;margin-bottom:0">${s.headline}</div>
          <div class="url-pill">🌐 ravewellness.org</div>
          <div class="subtext" style="text-align:center;margin-top:16px;font-size:18px;color:#475569">Link in bio · New posts weekly</div>
        </div>
      </div>`;

  } else {
    // content (default)
    const bulletsHtml = s.bullets
      ? `<ul class="bullets">${s.bullets.map(b => `<li><span class="bullet-pip"></span>${b}</li>`).join('')}</ul>`
      : '';
    body = `
      <div class="slide-body">
        <div class="eyebrow">${s.eyebrow}</div>
        <div class="headline-md">${s.headline}</div>
        ${s.body ? `<div class="subtext">${s.body}</div>` : ''}
        ${bulletsHtml}
      </div>`;
  }

  return `
  <div class="slide" data-num="${s.num}">
    <div class="accent-line"></div>
    <div class="bg-grid"></div>
    <div class="top-bar">
      <div class="logo">Rave<span>Wellness</span></div>
      <div class="slide-num">0${s.num} / 0${total}</div>
    </div>
    ${body}
    <div class="bottom-bar">
      <div class="hint">${s.num === total ? 'ravewellness.org' : 'swipe →'}</div>
      <div class="dots">${dots}</div>
    </div>
  </div>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#030310;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased}

    .slide{
      width:1080px;height:1080px;background:#06061a;
      position:relative;overflow:hidden;display:flex;flex-direction:column;
    }
    .slide::before{
      content:'';position:absolute;inset:0;pointer-events:none;
      background:
        radial-gradient(ellipse 720px 520px at 88% -8%, rgba(139,92,246,0.11) 0%, transparent 65%),
        radial-gradient(ellipse 560px 420px at -10% 96%, rgba(236,72,153,0.08) 0%, transparent 65%);
    }
    .bg-grid{
      position:absolute;inset:0;pointer-events:none;
      background-image:linear-gradient(rgba(255,255,255,0.018) 1px,transparent 1px),
                       linear-gradient(90deg,rgba(255,255,255,0.018) 1px,transparent 1px);
      background-size:72px 72px;
    }
    .accent-line{position:absolute;top:0;left:0;right:0;height:3px;z-index:3;
      background:linear-gradient(90deg,#8b5cf6 0%,#ec4899 50%,transparent 100%)}

    /* ── Top / bottom bars ── */
    .top-bar{position:relative;z-index:2;display:flex;align-items:center;
      justify-content:space-between;padding:36px 56px 0}
    .logo{font-size:18px;font-weight:700;color:#e2e8f0;letter-spacing:-0.01em}
    .logo span{color:#a78bfa}
    .logo-large{font-size:44px;font-weight:900;color:#e2e8f0;letter-spacing:-0.02em}
    .logo-large span{color:#a78bfa}
    .slide-num{font-size:13px;font-weight:600;color:#475569;letter-spacing:0.05em}

    .bottom-bar{position:relative;z-index:2;display:flex;align-items:center;
      justify-content:space-between;padding:0 56px 40px}
    .hint{font-size:13px;font-weight:500;color:#475569;letter-spacing:0.03em}
    .dots{display:flex;gap:6px}
    .dot{width:6px;height:6px;border-radius:50%;background:#1e293b}
    .dot.active{background:#8b5cf6;width:22px;border-radius:3px}

    /* ── Body ── */
    .slide-body{position:relative;z-index:2;flex:1;display:flex;
      flex-direction:column;justify-content:center;padding:48px 80px}
    .cover-body{justify-content:flex-end;padding-bottom:96px}
    .cta-body{align-items:center;justify-content:center}
    .cta-inner{display:flex;flex-direction:column;align-items:center}

    /* ── Typography ── */
    .eyebrow{font-size:13px;font-weight:700;letter-spacing:0.12em;
      text-transform:uppercase;color:#a78bfa;margin-bottom:18px}
    .headline{font-size:76px;font-weight:900;line-height:1.04;
      letter-spacing:-0.03em;color:#e2e8f0;margin-bottom:24px}
    .headline-md{font-size:50px;font-weight:800;line-height:1.1;
      letter-spacing:-0.025em;color:#e2e8f0;margin-bottom:28px}
    .subtext{font-size:24px;font-weight:400;color:#94a3b8;line-height:1.5}
    .subtext strong{color:#e2e8f0;font-weight:600}
    .swipe-hint{font-size:20px;font-weight:500;color:#475569;margin-top:28px}

    /* ── Bullets ── */
    .bullets{list-style:none;padding:0;display:flex;flex-direction:column;gap:18px;margin-top:8px}
    .bullets li{display:flex;align-items:flex-start;gap:16px;
      font-size:24px;color:#e2e8f0;font-weight:500;line-height:1.4}
    .bullet-pip{width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:8px;
      background:linear-gradient(135deg,#8b5cf6,#ec4899)}

    /* ── Stat ── */
    .stat-card{background:#10102e;border:1px solid rgba(139,92,246,0.25);
      border-radius:20px;padding:32px 36px;margin-top:8px}
    .stat-num{font-size:88px;font-weight:900;letter-spacing:-0.04em;line-height:1;
      background:linear-gradient(135deg,#a78bfa,#f472b6);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .stat-label{font-size:20px;color:#94a3b8;font-weight:500;margin-top:8px;line-height:1.4}

    /* ── Quote ── */
    .quote-block{font-size:34px;font-weight:700;color:#e2e8f0;line-height:1.4;
      border-left:4px solid #8b5cf6;padding-left:28px;margin:8px 0}

    /* ── CTA ── */
    .url-pill{display:inline-flex;align-items:center;gap:10px;
      background:rgba(139,92,246,0.12);border:1.5px solid rgba(139,92,246,0.35);
      border-radius:100px;padding:14px 32px;font-size:22px;font-weight:700;
      color:#a78bfa;margin-top:28px}
    .cta-ring{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      width:880px;height:880px;border-radius:50%;pointer-events:none;
      border:1px solid rgba(139,92,246,0.07)}

    /* ── Cover glow ── */
    .glow-orb{position:absolute;top:40px;right:-100px;width:720px;height:720px;
      border-radius:50%;pointer-events:none;z-index:0;
      background:radial-gradient(circle,rgba(139,92,246,0.14) 0%,transparent 70%)}
  </style>
</head>
<body>
${slidesData.slides.map(s => slideHtml(s, slidesData.slides.length)).join('\n')}
</body>
</html>`;

const htmlPath = path.join(OUTPUT_DIR, 'slides.html');
fs.writeFileSync(htmlPath, html);
console.log('Saved slides.html');

// ── 4. Export PNGs with puppeteer ─────────────────────────────────────────────

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
await page.evaluateHandle('document.fonts.ready');

const slideEls = await page.$$('.slide');
console.log(`\nExporting ${slideEls.length} slides...`);

for (let i = 0; i < slideEls.length; i++) {
  const num = String(i + 1).padStart(2, '0');
  const outPath = path.join(SLIDES_DIR, `slide-${num}.png`);
  await slideEls[i].screenshot({ path: outPath, type: 'png' });
  console.log(`  ✓ slide-${num}.png`);
}

await browser.close();
console.log(`\nDone — slides in social/output/slides/`);
