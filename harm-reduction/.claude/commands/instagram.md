Generate an Instagram Reel from a recent blog post and post it to @ravewellness.

**Usage:**
- `/instagram` — use the most recent blog post
- `/instagram <filename>` — use a specific post (e.g. `/instagram psilocybin-safety.md`)

---

## Pipeline

Run the following steps in order. The argument (`$ARGUMENTS`) is the optional blog post filename.

### Step 1 — Resolve blog post

```bash
cd /Users/aaronkager/Documents/kager-llc/harm-reduction
```

If `$ARGUMENTS` is empty, find the most recent post:
```bash
ls -t src/content/blog/*.md | head -1
```

Otherwise use: `src/content/blog/$ARGUMENTS`

### Step 2 — Install dependencies (if needed)

```bash
npm install
pip install edge-tts instagrapi
```

### Step 3 — Generate slides

```bash
node social/scripts/generate-slides.js <post-path>
```

This calls Claude (uses `ANTHROPIC_API_KEY` from your environment), generates `social/output/slides.json` and `social/output/slides/slide-01.png` through `slide-07.png`.

### Step 4 — Generate narration audio

```bash
python3 social/scripts/generate-audio.py
```

Uses Microsoft edge-tts (free, no API key) to generate per-slide MP3 narration, then concatenates into `social/output/narration.mp3`.

### Step 5 — Create reel and post

```bash
python3 social/scripts/create-reel.py
```

Combines slides + audio into `social/output/reel.mp4` via ffmpeg, then posts to Instagram as a Reel.

Reads credentials from:
- `RAVEWELLNESS_INSTAGRAM_EMAIL`
- `RAVEWELLNESS_INSTAGRAM_PASSWORD`

If credentials are not set in the environment, the reel is saved locally but not posted.

---

## GitHub Actions alternative

To post via GitHub Actions instead of locally, go to:
**Actions → Post Instagram Reel → Run workflow**

You can specify a blog post filename or leave it blank for the most recent post.

Required secrets (already configured):
- `ANTHROPIC_API_KEY`
- `RAVEWELLNESS_INSTAGRAM_EMAIL`
- `RAVEWELLNESS_INSTAGRAM_PASSWORD`

---

## Output files

| File | Description |
|------|-------------|
| `social/output/slides.json` | Structured slide content + caption + hashtags |
| `social/output/slides.html` | Rendered HTML preview (open in browser to inspect) |
| `social/output/slides/slide-01.png` … | Individual slide PNGs at 2160×2160 (2× for retina) |
| `social/output/narration.mp3` | Full voiceover audio |
| `social/output/reel.mp4` | Final video ready for Instagram |

All output is gitignored — nothing in `social/output/` is committed.
