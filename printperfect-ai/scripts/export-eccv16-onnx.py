"""
One-time setup: download Zhang ECCV16 weights and export them to ONNX so the
in-browser colorizer can load them.

The `colorizers` Python package isn't on PyPI — it's a module inside the
github.com/richzhang/colorization repo. Rather than asking you to clone that
repo, this script defines the architecture inline (~100 lines, taken
verbatim from the paper) and just downloads the trained weights.

Run:
    pip install torch onnx
    python scripts/export-eccv16-onnx.py

Output:
    public/models/eccv16.onnx  (~129 MB)

The browser app reads this file via the relative URL `/models/eccv16.onnx`
configured in `lib/ai/manifest.ts`. After running this once, `next dev` (or
`next build`) will serve it from the same origin — no CORS, no flaky CDN.
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

import torch
import torch.nn as nn

# Trained weights, hosted by the original authors. ~129 MB.
WEIGHTS_URL = (
    "https://colorizers.s3.us-east-2.amazonaws.com/colorization_release_v2-9b330a0b.pth"
)

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "models"
WEIGHTS_PATH = OUT_DIR / "eccv16.pth"
OUT_PATH = OUT_DIR / "eccv16.onnx"

INPUT_SIZE = 256  # Zhang's training resolution


# ---------------------------------------------------------------------------
# Architecture, copied straight from richzhang/colorization (ECCV 2016).
# ---------------------------------------------------------------------------


class BaseColor(nn.Module):
    """Shared L/ab normalization constants."""

    def __init__(self) -> None:
        super().__init__()
        self.l_cent = 50.0
        self.l_norm = 100.0
        self.ab_norm = 110.0

    def normalize_l(self, in_l: torch.Tensor) -> torch.Tensor:
        return (in_l - self.l_cent) / self.l_norm

    def unnormalize_ab(self, in_ab: torch.Tensor) -> torch.Tensor:
        return in_ab * self.ab_norm


class ECCVGenerator(BaseColor):
    def __init__(self, norm_layer: type[nn.Module] = nn.BatchNorm2d) -> None:
        super().__init__()

        # block 1
        model1 = [nn.Conv2d(1, 64, 3, 1, 1, bias=True), nn.ReLU(True)]
        model1 += [nn.Conv2d(64, 64, 3, 2, 1, bias=True), nn.ReLU(True), norm_layer(64)]

        # block 2
        model2 = [nn.Conv2d(64, 128, 3, 1, 1, bias=True), nn.ReLU(True)]
        model2 += [nn.Conv2d(128, 128, 3, 2, 1, bias=True), nn.ReLU(True), norm_layer(128)]

        # block 3
        model3 = [nn.Conv2d(128, 256, 3, 1, 1, bias=True), nn.ReLU(True)]
        model3 += [nn.Conv2d(256, 256, 3, 1, 1, bias=True), nn.ReLU(True)]
        model3 += [nn.Conv2d(256, 256, 3, 2, 1, bias=True), nn.ReLU(True), norm_layer(256)]

        # block 4
        model4 = [nn.Conv2d(256, 512, 3, 1, 1, bias=True), nn.ReLU(True)]
        model4 += [nn.Conv2d(512, 512, 3, 1, 1, bias=True), nn.ReLU(True)]
        model4 += [nn.Conv2d(512, 512, 3, 1, 1, bias=True), nn.ReLU(True), norm_layer(512)]

        # block 5 (dilation 2)
        model5 = [
            nn.Conv2d(512, 512, 3, 1, padding=2, dilation=2, bias=True), nn.ReLU(True),
            nn.Conv2d(512, 512, 3, 1, padding=2, dilation=2, bias=True), nn.ReLU(True),
            nn.Conv2d(512, 512, 3, 1, padding=2, dilation=2, bias=True), nn.ReLU(True),
            norm_layer(512),
        ]

        # block 6 (dilation 2)
        model6 = [
            nn.Conv2d(512, 512, 3, 1, padding=2, dilation=2, bias=True), nn.ReLU(True),
            nn.Conv2d(512, 512, 3, 1, padding=2, dilation=2, bias=True), nn.ReLU(True),
            nn.Conv2d(512, 512, 3, 1, padding=2, dilation=2, bias=True), nn.ReLU(True),
            norm_layer(512),
        ]

        # block 7
        model7 = [
            nn.Conv2d(512, 512, 3, 1, 1, bias=True), nn.ReLU(True),
            nn.Conv2d(512, 512, 3, 1, 1, bias=True), nn.ReLU(True),
            nn.Conv2d(512, 512, 3, 1, 1, bias=True), nn.ReLU(True),
            norm_layer(512),
        ]

        # block 8 (upsample + classifier head)
        model8 = [
            nn.ConvTranspose2d(512, 256, 4, 2, 1, bias=True), nn.ReLU(True),
            nn.Conv2d(256, 256, 3, 1, 1, bias=True), nn.ReLU(True),
            nn.Conv2d(256, 256, 3, 1, 1, bias=True), nn.ReLU(True),
            nn.Conv2d(256, 313, 1, 1, 0, bias=True),
        ]

        self.model1 = nn.Sequential(*model1)
        self.model2 = nn.Sequential(*model2)
        self.model3 = nn.Sequential(*model3)
        self.model4 = nn.Sequential(*model4)
        self.model5 = nn.Sequential(*model5)
        self.model6 = nn.Sequential(*model6)
        self.model7 = nn.Sequential(*model7)
        self.model8 = nn.Sequential(*model8)

        self.softmax = nn.Softmax(dim=1)
        self.model_out = nn.Conv2d(313, 2, 1, 1, 0, dilation=1, bias=False)
        self.upsample4 = nn.Upsample(scale_factor=4, mode="bilinear", align_corners=False)

    def forward(self, input_l: torch.Tensor) -> torch.Tensor:
        # NOTE: we deliberately skip self.normalize_l / self.unnormalize_ab in the
        # exported graph so the JS side controls those constants explicitly. The
        # browser pipeline does (L − 50) / 100 before, and × 110 after.
        c12 = self.model1(input_l)
        c22 = self.model2(c12)
        c33 = self.model3(c22)
        c43 = self.model4(c33)
        c53 = self.model5(c43)
        c63 = self.model6(c53)
        c73 = self.model7(c63)
        c83 = self.model8(c73)
        out_reg = self.model_out(self.softmax(c83))
        return self.upsample4(out_reg)


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------


def download(url: str, dest: Path) -> None:
    if dest.exists():
        print(f"[skip] weights already at {dest} ({dest.stat().st_size / 1e6:.1f} MB)")
        return
    print(f"Downloading {url} → {dest} ...")
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as resp, open(dest, "wb") as out:
        total = int(resp.headers.get("Content-Length") or 0)
        chunk = 1 << 20
        read = 0
        while True:
            buf = resp.read(chunk)
            if not buf:
                break
            out.write(buf)
            read += len(buf)
            if total:
                pct = read * 100 / total
                sys.stdout.write(f"\r  {read / 1e6:6.1f} / {total / 1e6:6.1f} MB ({pct:5.1f}%)")
                sys.stdout.flush()
    print()


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUT_PATH.exists():
        print(f"[skip] {OUT_PATH} already exists ({OUT_PATH.stat().st_size / 1e6:.1f} MB)")
        return

    download(WEIGHTS_URL, WEIGHTS_PATH)

    print("Loading weights into model...")
    model = ECCVGenerator().eval()
    state = torch.load(WEIGHTS_PATH, map_location="cpu")
    model.load_state_dict(state, strict=True)

    dummy = torch.zeros(1, 1, INPUT_SIZE, INPUT_SIZE)

    print(f"Exporting → {OUT_PATH} (input shape [1, 1, {INPUT_SIZE}, {INPUT_SIZE}]) ...")
    torch.onnx.export(
        model,
        dummy,
        OUT_PATH.as_posix(),
        input_names=["input"],
        output_names=["ab"],
        opset_version=17,
        dynamic_axes=None,  # fixed shape; matches manifest's `inputSize: 256`
    )
    print(f"Done. {OUT_PATH.stat().st_size / 1e6:.1f} MB written.")
    print(f"Tip: you can delete {WEIGHTS_PATH.name} now — only the .onnx is needed at runtime.")


if __name__ == "__main__":
    main()
