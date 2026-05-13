#!/usr/bin/env python3
"""
generate-audio.py

Generates per-slide TTS narration using Microsoft edge-tts (free, no API key).
Saves one mp3 per slide, then concatenates into narration.mp3.
Also writes audio_durations.json for video timing in the next step.

Usage:
  python3 social/scripts/generate-audio.py [path/to/slides.json]
  (defaults to social/output/slides.json)

Output:
  social/output/audio/slide-01.mp3 ...
  social/output/narration.mp3
  social/output/audio_durations.json

Requires:
  pip install edge-tts
  ffmpeg in PATH
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_DIR = ROOT / "social" / "output"
AUDIO_DIR = OUTPUT_DIR / "audio"

# Voice options: en-US-JennyNeural | en-US-AriaNeural | en-US-GuyNeural
VOICE = "en-US-AriaNeural"

slides_json = Path(sys.argv[1]) if len(sys.argv) > 1 else OUTPUT_DIR / "slides.json"

with open(slides_json) as f:
    data = json.load(f)

AUDIO_DIR.mkdir(parents=True, exist_ok=True)


async def narrate_slide(slide: dict, out_path: Path) -> None:
    import edge_tts
    communicate = edge_tts.Communicate(slide["narration"], VOICE)
    await communicate.save(str(out_path))


async def main() -> None:
    import edge_tts  # noqa: confirm installed

    slides = data["slides"]
    audio_paths = []

    for slide in slides:
        num = str(slide["num"]).zfill(2)
        out = AUDIO_DIR / f"slide-{num}.mp3"
        print(f"  Generating slide-{num}.mp3 ...")
        await narrate_slide(slide, out)
        audio_paths.append(out)

    # Concatenate into single narration.mp3
    concat_list = OUTPUT_DIR / "audio_concat.txt"
    with open(concat_list, "w") as f:
        for p in audio_paths:
            f.write(f"file '{p}'\n")

    narration_path = OUTPUT_DIR / "narration.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
         "-i", str(concat_list), "-c", "copy", str(narration_path)],
        check=True, capture_output=True,
    )
    print(f"\nSaved narration.mp3")

    # Get per-slide audio durations (needed for video timing)
    durations = []
    for p in audio_paths:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(p)],
            capture_output=True, text=True, check=True,
        )
        durations.append(round(float(result.stdout.strip()), 3))

    with open(OUTPUT_DIR / "audio_durations.json", "w") as f:
        json.dump(durations, f)

    total = sum(durations)
    print(f"Slide durations: {[f'{d}s' for d in durations]}")
    print(f"Total audio: {total:.1f}s  ({total/60:.1f} min)")


asyncio.run(main())
