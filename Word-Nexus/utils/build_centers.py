#!/usr/bin/env python3
"""
build_centers.py — programmatic CENTERS-graph builder
======================================================

Goal: emit a CENTERS dict in the same shape that
`src/word_nexus_generator.py` consumes:

    CENTERS: dict[str, dict[str, list[tuple[str, int]]]]
    #              center  →  sub_theme  →  [(word, strength), ...]

…but built automatically from ConceptNet 5.7 instead of hand-curated.

Pipeline:
  ConceptNet CSV (10 GB gz)
    → filter to English-only, single-word, noun edges
    → group by start-node, bucket neighbours by relation type
    → keep top-K hub words as candidate centres
    → write `centers_auto.json`

Why this works for the puzzle:
  ConceptNet's relation types (RelatedTo / IsA / UsedFor / AtLocation /
  HasA / PartOf / CapableOf / Causes / SimilarTo) are a natural proxy
  for the hand-authored sub-themes ("nautical", "media", "constraint")
  in the curated CENTERS dict. A word is a *hub* — and therefore a
  good puzzle centre — exactly when ConceptNet shows it has many
  neighbours spread across different relation types. That's the same
  intuition behind "Brain + Tennis → Stroke": STROKE is a polysemous
  hub linking the medical and sports clusters.

Usage:
  # 1. download ConceptNet 5.7 once (≈10 GB) and drop it here:
  #    utils/conceptnet-assertions-5.7.0.csv.gz   (gitignored)
  # 2. run:
  python utils/build_centers.py \\
      --conceptnet utils/conceptnet-assertions-5.7.0.csv.gz \\
      --nouns      utils/nounlist.txt \\
      --output     utils/centers_auto.json \\
      --top-centers 200  --neighbours-per-theme 10

  # 3. inspect, then optionally merge into the canonical CENTERS dict:
  python utils/build_centers.py --merge utils/centers_auto.json \\
      --target src/word_nexus_generator.py

Status: SCAFFOLD. The streaming + filtering + bucketing is implemented.
The merge-into-Python-source step is intentionally a stub — review the
auto graph by eye first; ConceptNet is noisy and a bad centre poisons
every board it generates.
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

# ── Constants ────────────────────────────────────────────────────────

# ConceptNet relation types we keep, in priority order.  The first
# group becomes the dominant "iconic" sub-theme; the rest become
# secondary lateral angles.
KEEP_RELATIONS: dict[str, str] = {
    "/r/IsA":           "isa",
    "/r/PartOf":        "part_of",
    "/r/HasA":          "has_a",
    "/r/UsedFor":       "used_for",
    "/r/AtLocation":    "location",
    "/r/CapableOf":     "capable_of",
    "/r/Causes":        "causes",
    "/r/HasProperty":   "property",
    "/r/MadeOf":        "made_of",
    "/r/SimilarTo":     "similar",
    "/r/Synonym":       "synonym",
    "/r/RelatedTo":     "related",
    "/r/MannerOf":      "manner",
    "/r/HasContext":    "context",
    "/r/DerivedFrom":   "derived",
}

# A word is single-token in ConceptNet's URI scheme if it has no underscore.
SINGLE_WORD_RE = re.compile(r"^[a-z][a-z\-]*$")

# Strength bucketing — ConceptNet weights cluster around 1–10; everything
# above 4 we call "iconic" (3), 2–4 is "solid" (2), <2 is "lateral" (1).
def bucket_strength(weight: float) -> int:
    if weight >= 4.0:
        return 3
    if weight >= 2.0:
        return 2
    return 1


# ── Step 1: Stream ConceptNet → in-memory adjacency ──────────────────

def parse_uri(uri: str) -> str | None:
    """`/c/en/foo/n` → `foo`  (returns None for non-English or multiword)."""
    parts = uri.split("/")
    if len(parts) < 4 or parts[1] != "c" or parts[2] != "en":
        return None
    surface = parts[3]
    if not SINGLE_WORD_RE.fullmatch(surface):
        return None
    return surface


def stream_edges(path: Path):
    """Yield (start_word, end_word, relation, weight) for every kept edge."""
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as f:
        for ln, line in enumerate(f, 1):
            if ln % 1_000_000 == 0:
                print(f"  …scanned {ln:>11,} edges", file=sys.stderr, flush=True)
            cols = line.rstrip("\n").split("\t")
            if len(cols) < 5:
                continue
            _uri, rel, start, end, meta = cols[:5]
            if rel not in KEEP_RELATIONS:
                continue
            a = parse_uri(start)
            b = parse_uri(end)
            if not a or not b or a == b:
                continue
            try:
                weight = json.loads(meta).get("weight", 1.0)
            except Exception:
                weight = 1.0
            yield a, b, rel, float(weight)


# ── Step 2: Build CENTERS-shape from the stream ──────────────────────

def build_centers(
    conceptnet_path: Path,
    noun_allowlist: set[str] | None,
    top_centers: int,
    neighbours_per_theme: int,
) -> dict[str, dict[str, list[tuple[str, int]]]]:

    print(f"▶  Streaming {conceptnet_path} …", file=sys.stderr)

    # word → relation_label → list of (neighbour, weight)
    nbrs: dict[str, dict[str, list[tuple[str, float]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    degree: Counter[str] = Counter()

    for a, b, rel, w in stream_edges(conceptnet_path):
        if noun_allowlist is not None:
            # We require the *centre candidate* (a) to be in the noun list.
            # The neighbour can be any single-word English token.
            if a not in noun_allowlist:
                continue
        label = KEEP_RELATIONS[rel]
        nbrs[a][label].append((b, w))
        degree[a] += 1

    print(f"   collected {len(nbrs):,} candidate centres", file=sys.stderr)

    # Pick the top-K hubs by degree
    hubs = [w for w, _ in degree.most_common(top_centers)]
    print(f"   keeping top {len(hubs)} hubs as centres", file=sys.stderr)

    centers_out: dict[str, dict[str, list[tuple[str, int]]]] = {}
    for hub in hubs:
        themes_out: dict[str, list[tuple[str, int]]] = {}
        for theme, edges in nbrs[hub].items():
            # Best-of duplicates, then top-N by weight
            best: dict[str, float] = {}
            for nb, w in edges:
                best[nb] = max(best.get(nb, 0.0), w)
            ranked = sorted(best.items(), key=lambda x: -x[1])[:neighbours_per_theme]
            if not ranked:
                continue
            themes_out[theme] = [(nb, bucket_strength(w)) for nb, w in ranked]
        # Drop centres that ended up with too few sub-themes to be playable.
        if len(themes_out) >= 3:
            centers_out[hub] = themes_out

    print(f"   final: {len(centers_out)} centres survived sub-theme filter",
          file=sys.stderr)
    return centers_out


# ── Step 3: Output ───────────────────────────────────────────────────

def write_json(centers: dict, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(centers, indent=2, sort_keys=True))
    print(f"✓  wrote {output_path}  ({len(centers)} centres)", file=sys.stderr)


def load_noun_allowlist(path: Path | None) -> set[str] | None:
    if path is None:
        return None
    words = {
        ln.strip().lower()
        for ln in path.read_text(encoding="utf-8").splitlines()
        if ln.strip() and not ln.startswith("#")
    }
    print(f"   noun allowlist: {len(words):,} words from {path}", file=sys.stderr)
    return words


# ── CLI ─────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="Build a CENTERS-shaped graph from ConceptNet 5.7.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--conceptnet",
        type=Path,
        default=Path("utils/conceptnet-assertions-5.7.0.csv.gz"),
        help="Path to the ConceptNet 5.7 CSV (.csv or .csv.gz).",
    )
    p.add_argument(
        "--nouns",
        type=Path,
        default=Path("utils/nounlist.txt"),
        help="Allowlist of single-word nouns (one per line) used to "
             "restrict centre candidates. Pass an empty path to disable.",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=Path("utils/centers_auto.json"),
        help="Where to write the centres JSON.",
    )
    p.add_argument("--top-centers",       type=int, default=200,
                   help="Keep the top-N hub words as centres (default 200).")
    p.add_argument("--neighbours-per-theme", type=int, default=10,
                   help="Trim each sub-theme to its top-N strongest neighbours.")

    args = p.parse_args()

    if not args.conceptnet.exists():
        sys.exit(
            f"✗  Cannot find {args.conceptnet}.\n"
            f"   Download ConceptNet 5.7 from https://github.com/commonsense/conceptnet5/wiki/Downloads\n"
            f"   and save the CSV to {args.conceptnet}.  It is gitignored."
        )

    nouns = load_noun_allowlist(args.nouns) if args.nouns and args.nouns.exists() else None

    centers = build_centers(
        conceptnet_path=args.conceptnet,
        noun_allowlist=nouns,
        top_centers=args.top_centers,
        neighbours_per_theme=args.neighbours_per_theme,
    )
    write_json(centers, args.output)

    # Final hint — never auto-merge into the canonical generator.
    print(
        "\nNext step: eyeball utils/centers_auto.json. ConceptNet is noisy.\n"
        "Promote individual centres into src/word_nexus_generator.py only after\n"
        "a human glance — a single bad centre poisons every board it generates.\n",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
