"""
Generate PWA icon set for Semantic Sudoku.

Usage:
    pip install Pillow
    python generate_icons.py

Outputs into ./icons/:
    icon-192.png            (Android home screen)
    icon-512.png            (PWA install, splash)
    icon-512-maskable.png   (Android adaptive icon — extra safe-zone padding)
    apple-touch-icon.png    (iOS home screen, 180x180)
    favicon-32.png          (browser tab)
    favicon-16.png          (browser tab, small)

Re-run any time you tweak the palette or layout below.
"""

from pathlib import Path
from PIL import Image, ImageDraw

PAPER = (245, 240, 232, 255)
INK = (26, 23, 20, 255)
GOLD = (201, 168, 76, 255)

OUT = Path(__file__).parent / "icons"
OUT.mkdir(exist_ok=True)


def draw_grid(draw, size, margin_pct):
    margin = int(size * margin_pct)
    inner = size - 2 * margin
    gap = max(2, size // 40)
    cell = (inner - 2 * gap) // 3
    radius = max(2, cell // 6)
    stroke = max(1, size // 80)

    for r in range(3):
        for c in range(3):
            x1 = margin + c * (cell + gap)
            y1 = margin + r * (cell + gap)
            x2 = x1 + cell
            y2 = y1 + cell
            if r == 1 and c == 1:
                draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=GOLD)
            elif (r, c) in {(0, 0), (0, 2), (2, 0), (2, 2)}:
                draw.rounded_rectangle([x1, y1, x2, y2], radius=radius, fill=INK)
            else:
                draw.rounded_rectangle(
                    [x1, y1, x2, y2], radius=radius, outline=INK, width=stroke
                )


def make_icon(size, name, margin_pct=0.16):
    img = Image.new("RGBA", (size, size), PAPER)
    draw_grid(ImageDraw.Draw(img), size, margin_pct)
    img.save(OUT / name, "PNG")
    print(f"  wrote icons/{name}  ({size}x{size})")


print("Generating Semantic Sudoku icons...")
make_icon(192, "icon-192.png")
make_icon(512, "icon-512.png")
make_icon(512, "icon-512-maskable.png", margin_pct=0.22)  # tighter safe zone
make_icon(180, "apple-touch-icon.png")
make_icon(32, "favicon-32.png")
make_icon(16, "favicon-16.png")
print("Done.")
