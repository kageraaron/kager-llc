#!/usr/bin/env python3
"""
create-reel.py

Combines slide PNGs + narration.mp3 into an MP4 Reel via ffmpeg,
then posts it to Instagram using instagrapi.

Usage:
  python3 social/scripts/create-reel.py

Reads from social/output/ (produced by generate-slides.js and generate-audio.py).

Environment variables (set locally in .env or via GitHub secrets):
  RAVEWELLNESS_INSTAGRAM_EMAIL
  RAVEWELLNESS_INSTAGRAM_PASSWORD

Requires:
  pip install instagrapi
  ffmpeg in PATH
"""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_DIR = ROOT / "social" / "output"
SLIDES_DIR = OUTPUT_DIR / "slides"

# ── Load data ─────────────────────────────────────────────────────────────────

with open(OUTPUT_DIR / "slides.json") as f:
    data = json.load(f)

with open(OUTPUT_DIR / "audio_durations.json") as f:
    durations = json.load(f)

slide_files = sorted(SLIDES_DIR.glob("slide-*.png"))

if len(slide_files) != len(durations):
    print(f"ERROR: {len(slide_files)} slide PNGs but {len(durations)} audio durations — re-run previous steps.")
    sys.exit(1)

# ── 1. Build video with ffmpeg ────────────────────────────────────────────────
# Each slide is displayed for its narration duration + 0.3 s breathing room.
# ffmpeg concat demuxer lets us specify per-image display durations.

concat_path = OUTPUT_DIR / "video_concat.txt"
with open(concat_path, "w") as f:
    for img, dur in zip(slide_files, durations):
        f.write(f"file '{img.resolve()}'\nduration {dur + 0.3:.3f}\n")
    # ffmpeg requires repeating the last file without a duration to flush it
    f.write(f"file '{slide_files[-1].resolve()}'\n")

reel_path = OUTPUT_DIR / "reel.mp4"
narration_path = OUTPUT_DIR / "narration.mp3"

ffmpeg_cmd = [
    "ffmpeg", "-y",
    "-f", "concat", "-safe", "0", "-i", str(concat_path),
    "-i", str(narration_path),
    # Scale to 1080x1080 (square Reel), 30 fps, yuv420p for IG compatibility
    "-vf", "scale=1080:1080:flags=lanczos,fps=30",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-shortest",
    str(reel_path),
]

print("Building reel.mp4 ...")
result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
if result.returncode != 0:
    print("ffmpeg error:\n", result.stderr[-3000:])
    sys.exit(1)

size_mb = reel_path.stat().st_size / 1_000_000
print(f"Saved reel.mp4 ({size_mb:.1f} MB)\n")

# ── 2. Build caption ──────────────────────────────────────────────────────────

hashtags = " ".join(f"#{tag}" for tag in data.get("hashtags", []))
caption = f"{data['caption']}\n\n{hashtags}"

print("Caption preview:")
print(caption[:300] + "..." if len(caption) > 300 else caption)
print()

# ── 3. Post to Instagram ──────────────────────────────────────────────────────

email = os.environ.get("RAVEWELLNESS_INSTAGRAM_EMAIL")
password = os.environ.get("RAVEWELLNESS_INSTAGRAM_PASSWORD")

if not email or not password:
    print("No Instagram credentials found in environment.")
    print("Set RAVEWELLNESS_INSTAGRAM_EMAIL and RAVEWELLNESS_INSTAGRAM_PASSWORD to post.")
    print(f"\nReel is ready at: {reel_path}")
    sys.exit(0)

from instagrapi import Client
from instagrapi.exceptions import ChallengeRequired, TwoFactorRequired

session_path = OUTPUT_DIR / "instagram_session.json"

cl = Client()
cl.delay_range = [2, 5]  # human-like request pacing

# Try reusing a cached session to reduce login challenges
logged_in = False
if session_path.exists():
    try:
        cl.load_settings(session_path)
        cl.login(email, password)
        cl.get_timeline_feed()  # verify the session is still valid
        logged_in = True
        print("Logged in via cached session.")
    except Exception:
        session_path.unlink(missing_ok=True)

if not logged_in:
    try:
        print("Logging in to Instagram ...")
        cl.login(email, password)
        cl.dump_settings(session_path)
        print("Logged in.")
    except ChallengeRequired:
        print("Instagram requires a challenge (suspicious login).")
        print("Log in manually once from this IP, then retry.")
        sys.exit(1)
    except TwoFactorRequired:
        print("Two-factor authentication is enabled on this account.")
        print("Disable 2FA or use an app password and retry.")
        sys.exit(1)
    except Exception as e:
        print(f"Login failed: {e}")
        sys.exit(1)

print("Uploading reel ...")
try:
    media = cl.clip_upload(path=reel_path, caption=caption)
    print(f"\n✓ Posted successfully!")
    print(f"  Media ID : {media.id}")
    print(f"  URL      : https://www.instagram.com/p/{media.code}/")
except Exception as e:
    print(f"Upload failed: {e}")
    sys.exit(1)
