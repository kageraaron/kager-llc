#!/usr/bin/env python3
"""
discover_centers.py — auto-extract CENTERS entries via community detection
==========================================================================

Inputs (already produced by `utils/build_graph.py`):
  - semantic_graph_expanded.json   word → {neighbour: weight}  (ConceptNet)
  - utils/google-10k.txt           common-English filter
  - utils/nounlist.txt             noun-only filter (optional)

Pipeline:
  1.  Score every candidate word by a "polysemy hub" metric:
        log(1 + degree) · (1 - density_of_ego_subgraph)
      Hubs whose neighbours form ONE tight clique are bad centres
      (they're just synonym blobs).  Hubs whose neighbours fall into
      SEVERAL loosely-connected groups are good — that's exactly what
      a polysemous puzzle centre looks like ("anchor" → nautical /
      stability / media / constraint).
  2.  For each top-K hub, run Louvain community detection on its ego
      network (the subgraph induced by its neighbours, with edges
      pulled from the global semantic graph).  Each community becomes
      a sub-theme; we label it by the neighbour with the strongest
      direct edge to the centre.
  3.  Emit `centers_auto.json` in the exact shape the generator
      consumes:
        {center: {subtheme_label: [[word, strength], ...]}}
      Strength buckets weight: ≥4 → 3 (iconic), ≥2.5 → 2 (solid), <2.5 → 1.
  4.  Optionally print a Python literal block ready to paste into
      src/word_nexus_generator.py  (use --as-python).

Why community detection beats relation-type bucketing:
  ConceptNet's IsA / PartOf / UsedFor / RelatedTo relations don't
  separate SENSES of a polysemous word.  All of anchor's senses end up
  mixed in RelatedTo.  But the senses *do* surface as graph communities
  because words within a sense link to each other much more strongly
  than they link across senses.  No external sense-inventory needed.

Usage:
  python utils/discover_centers.py                       # 50 best new centers
  python utils/discover_centers.py --top 200             # try 200 candidates
  python utils/discover_centers.py --as-python > add.py  # ready-to-paste
  python utils/discover_centers.py --include anchor crown --top 0   # debug a hub
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Iterable, Optional

import networkx as nx

try:
    from networkx.algorithms import community as nx_community
    _HAS_COMMUNITY = True
except ImportError:
    _HAS_COMMUNITY = False


# ── Paths ─────────────────────────────────────────────────────────────

REPO_ROOT       = Path(__file__).resolve().parent.parent
GRAPH_PATH      = REPO_ROOT / "semantic_graph_expanded.json"
GRAPH_FALLBACK  = REPO_ROOT / "semantic_graph.json"
GOOGLE_10K_PATH = REPO_ROOT / "utils" / "google-10k.txt"
NOUNLIST_PATH   = REPO_ROOT / "utils" / "nounlist.txt"
GENERATOR_PATH  = REPO_ROOT / "src" / "word_nexus_generator.py"
DEFAULT_OUTPUT  = REPO_ROOT / "utils" / "centers_auto.json"


# ── I/O helpers ───────────────────────────────────────────────────────

def load_graph(path: Path) -> dict[str, dict[str, float]]:
    if not path.exists():
        sys.exit(f"✗  Graph not found: {path}\n   Run utils/build_graph.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


def load_wordlist(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {
        ln.strip().lower()
        for ln in path.read_text(encoding="utf-8").splitlines()
        if ln.strip() and not ln.startswith("#")
    }


def load_existing_centers() -> set[str]:
    """
    Parse the canonical CENTERS dict so the auto-discovery skips centres
    that already exist (we don't want to overwrite hand-curated entries).
    """
    if not GENERATOR_PATH.exists():
        return set()
    src = GENERATOR_PATH.read_text(encoding="utf-8")
    # Lines that open a center, e.g.   "anchor": {
    return set(re.findall(r'^\s{4}"(\w+)"\s*:\s*\{', src, re.MULTILINE))


# ── Strength bucketing ───────────────────────────────────────────────

def bucket(weight: float) -> int:
    """Map ConceptNet weight → puzzle strength (3 = iconic, 1 = lateral)."""
    if weight >= 4.0:
        return 3
    if weight >= 2.5:
        return 2
    return 1


# ── Polysemy hub score ───────────────────────────────────────────────

def ego_density(graph: dict, word: str, nbrs: dict[str, float]) -> float:
    """Edge density of the neighbour-induced subgraph."""
    nb_set = set(nbrs)
    if len(nb_set) < 2:
        return 0.0
    edges = 0
    for a in nb_set:
        adj = graph.get(a, {})
        for b in nb_set:
            if b > a and b in adj:
                edges += 1
    n = len(nb_set)
    return edges / (n * (n - 1) / 2)


def polysemy_score(graph: dict, word: str, min_degree: int = 8) -> float:
    """
    Higher = better puzzle centre.  Hubs with many neighbours AND a
    sparse neighbour-subgraph (clusters far apart) score highest.
    """
    nbrs = graph.get(word, {})
    if len(nbrs) < min_degree:
        return 0.0
    d = ego_density(graph, word, nbrs)
    return math.log1p(len(nbrs)) * (1.0 - d)


# ── Sub-theme discovery ──────────────────────────────────────────────

def _louvain_or_greedy(G: nx.Graph) -> list[set[str]]:
    """
    Prefer Louvain (sharper communities); fall back to greedy modularity
    for older NetworkX versions.
    """
    if _HAS_COMMUNITY and hasattr(nx_community, "louvain_communities"):
        try:
            return list(nx_community.louvain_communities(G, weight="weight", seed=42))
        except Exception:
            pass
    if _HAS_COMMUNITY and hasattr(nx_community, "greedy_modularity_communities"):
        return [set(c) for c in nx_community.greedy_modularity_communities(G, weight="weight")]
    # Final fallback: connected components (rough but never crashes)
    return [set(c) for c in nx.connected_components(G)]


def discover_subthemes(
    graph: dict,
    center: str,
    min_cluster: int = 3,
    max_subthemes: int = 6,
    edge_floor: float = 1.5,
) -> Optional[dict[str, list[tuple[str, int]]]]:
    """
    Run community detection on `center`'s ego network and convert each
    surviving community into a sub-theme entry.
    """
    nbrs = graph.get(center, {})
    if len(nbrs) < min_cluster * 2:
        return None

    nb_set = set(nbrs)
    G = nx.Graph()
    G.add_nodes_from(nb_set)
    for a in nb_set:
        adj = graph.get(a, {})
        for b in nb_set:
            if b > a and b in adj and adj[b] >= edge_floor:
                G.add_edge(a, b, weight=adj[b])

    if G.number_of_edges() < min_cluster:
        return None

    communities = _louvain_or_greedy(G)
    # Sort by size descending; keep ones big enough to feel like a sub-theme
    communities = sorted([list(c) for c in communities], key=len, reverse=True)
    communities = [c for c in communities if len(c) >= min_cluster][:max_subthemes]

    if len(communities) < 3:
        return None

    # Label each community by the neighbour with the STRONGEST direct
    # edge to `center`.  That's almost always the canonical word for
    # that sense (e.g. "ship" labels the nautical cluster of "anchor").
    out: dict[str, list[tuple[str, int]]] = {}
    used_labels: set[str] = set()
    for cluster in communities:
        cluster.sort(key=lambda w: -nbrs.get(w, 0.0))
        label = next((w for w in cluster if w not in used_labels), cluster[0])
        used_labels.add(label)
        out[label] = [(w, bucket(nbrs.get(w, 0.0))) for w in cluster]

    return out


# ── Quality filter ───────────────────────────────────────────────────

def passes_playability(
    subthemes: dict[str, list[tuple[str, int]]],
    min_subthemes: int = 3,
    min_words_per_theme: int = 3,
    require_iconic: bool = True,
) -> bool:
    if len(subthemes) < min_subthemes:
        return False
    healthy = 0
    for words in subthemes.values():
        if len(words) >= min_words_per_theme:
            if not require_iconic or any(s == 3 for _, s in words):
                healthy += 1
    return healthy >= min_subthemes


# ── Pipeline ─────────────────────────────────────────────────────────

def discover(
    graph: dict,
    candidates: Iterable[str],
    skip: set[str],
    top_k: int,
    min_subthemes: int,
    max_subthemes: int,
    min_words_per_theme: int,
    verbose: bool = True,
) -> dict[str, dict[str, list[tuple[str, int]]]]:

    # Score every candidate, keep top_k by polysemy_score
    scored: list[tuple[float, str]] = []
    for w in candidates:
        if w in skip:
            continue
        if w not in graph:
            continue
        s = polysemy_score(graph, w)
        if s > 0:
            scored.append((s, w))

    scored.sort(reverse=True)
    if verbose:
        print(f"   {len(scored):,} candidates ranked", file=sys.stderr)

    accepted: dict[str, dict[str, list[tuple[str, int]]]] = {}
    for rank, (score, word) in enumerate(scored):
        if len(accepted) >= top_k:
            break
        sub = discover_subthemes(
            graph, word,
            min_cluster=min_words_per_theme,
            max_subthemes=max_subthemes,
        )
        if not sub:
            continue
        if not passes_playability(sub, min_subthemes, min_words_per_theme):
            continue
        accepted[word] = sub
        if verbose:
            theme_str = ", ".join(f"{lbl}({len(ws)})" for lbl, ws in sub.items())
            print(f"   ✓  {word:<14}  score={score:.2f}  themes: {theme_str}",
                  file=sys.stderr)

    return accepted


# ── Output formatters ────────────────────────────────────────────────

def to_python_literal(centers: dict, indent: str = "    ") -> str:
    """Emit a chunk that can be pasted into src/word_nexus_generator.py."""
    lines: list[str] = []
    for name, themes in centers.items():
        # 5-space gutter so labels align with the curated entries
        max_label = max(len(lbl) for lbl in themes)
        lines.append(f'{indent}"{name}": {{')
        lines.append(f"{indent}    # auto-discovered from semantic_graph_expanded.json")
        for label, words in themes.items():
            words_repr = ", ".join(f'("{w}", {s})' for w, s in words)
            pad = " " * (max_label - len(label))
            lines.append(f'{indent}    "{label}":{pad} [{words_repr}],')
        lines.append(f"{indent}}},")
        lines.append("")
    return "\n".join(lines)


# ── CLI ──────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Auto-discover puzzle CENTERS via community detection "
                    "on a ConceptNet-derived semantic graph.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("--graph", type=Path, default=GRAPH_PATH,
                    help=f"Semantic graph JSON (default: {GRAPH_PATH.name})")
    ap.add_argument("--google-10k", type=Path, default=GOOGLE_10K_PATH,
                    help="Common-English filter list.")
    ap.add_argument("--nouns", type=Path, default=NOUNLIST_PATH,
                    help="Optional noun allowlist (centres are usually nouns).")
    ap.add_argument("--output", type=Path, default=DEFAULT_OUTPUT,
                    help=f"Output JSON path (default: {DEFAULT_OUTPUT.name}).")
    ap.add_argument("--top", type=int, default=50,
                    help="How many new centres to keep (default: 50).")
    ap.add_argument("--min-subthemes", type=int, default=3,
                    help="Minimum sub-themes a centre must produce (default: 3).")
    ap.add_argument("--max-subthemes", type=int, default=5,
                    help="Maximum sub-themes per centre (default: 5).")
    ap.add_argument("--min-words", type=int, default=3,
                    help="Minimum words per sub-theme (default: 3).")
    ap.add_argument("--no-skip-existing", action="store_true",
                    help="Don't skip centres already in the canonical generator.")
    ap.add_argument("--include", nargs="+", default=None,
                    help="Force-evaluate these specific words (debug; bypasses ranking).")
    ap.add_argument("--as-python", action="store_true",
                    help="Print a paste-ready Python literal instead of JSON.")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    graph_path = args.graph if args.graph.exists() else GRAPH_FALLBACK
    if not args.quiet:
        print(f"▶  Loading graph: {graph_path.name}", file=sys.stderr)
    graph = load_graph(graph_path)
    if not args.quiet:
        print(f"   {len(graph):,} words in graph", file=sys.stderr)

    google = load_wordlist(args.google_10k)
    nouns  = load_wordlist(args.nouns)
    if not args.quiet:
        print(f"   common-english: {len(google):,}  |  nouns: {len(nouns):,}",
              file=sys.stderr)

    skip = set() if args.no_skip_existing else load_existing_centers()
    if not args.quiet and skip:
        print(f"   skipping {len(skip)} centres already in generator", file=sys.stderr)

    # Candidate pool: prefer common nouns; fall back to Google-10k; then graph keys
    if args.include:
        candidates = [w.lower() for w in args.include]
        skip = set()  # debug mode, evaluate even existing
    elif nouns and google:
        candidates = sorted(nouns & google)
    elif nouns:
        candidates = sorted(nouns)
    elif google:
        candidates = sorted(google)
    else:
        candidates = sorted(graph.keys())

    if not args.quiet:
        print(f"   candidate pool: {len(candidates):,}", file=sys.stderr)

    accepted = discover(
        graph,
        candidates=candidates,
        skip=skip,
        top_k=args.top if not args.include else len(candidates),
        min_subthemes=args.min_subthemes,
        max_subthemes=args.max_subthemes,
        min_words_per_theme=args.min_words,
        verbose=not args.quiet,
    )

    if not accepted:
        print("   ✗  no centres survived quality filter", file=sys.stderr)
        sys.exit(1)

    if args.as_python:
        print(to_python_literal(accepted))
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(accepted, indent=2))
        if not args.quiet:
            print(f"\n✓  wrote {args.output}  ({len(accepted)} centres)",
                  file=sys.stderr)
            print(f"   preview a paste-ready chunk with:  --as-python",
                  file=sys.stderr)


if __name__ == "__main__":
    main()
