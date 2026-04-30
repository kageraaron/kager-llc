# ─────────────────────────────────────────────────────────────────────
#  Semantic Sudoku — developer entry points
#  Usage:  make <target>      (run `make help` for a listing)
# ─────────────────────────────────────────────────────────────────────

PY        ?= python3
SRC       := src
GENERATOR := $(SRC)/word_nexus_generator.py
PLAYER    := $(SRC)/daily_game.html
BOARDS    := puzzles.json
BUILDER   := utils/build_centers.py
CONCEPTNET:= utils/conceptnet-assertions-5.7.0.csv.gz
N         ?= 12          # number of boards to generate
SEED      ?=             # optional --seed word
MIN       ?= 1.8         # minimum overall score

.DEFAULT_GOAL := help

# ─── help ───────────────────────────────────────────────────────────
help: ## show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

# ─── setup ──────────────────────────────────────────────────────────
install: ## create venv & install deps (numpy, scipy)
	$(PY) -m venv .venv
	. .venv/bin/activate && pip install -U pip && pip install -r requirements.txt

# ─── generate puzzles ───────────────────────────────────────────────
boards: ## generate N=$(N) boards into $(BOARDS) (overwrites)
	$(PY) $(GENERATOR) --boards $(N) --min-score $(MIN) \
	  $(if $(SEED),--seed $(SEED),) --output $(BOARDS)

append: ## generate N=$(N) more boards and append to $(BOARDS)
	$(PY) $(GENERATOR) --boards $(N) --min-score $(MIN) \
	  $(if $(SEED),--seed $(SEED),) --output $(BOARDS) --append

centers: ## list all available semantic centers in the curated graph
	$(PY) $(GENERATOR) --list-centers

qa: ## generate a small batch and print every board for human review
	$(PY) $(GENERATOR) --boards 5 --min-score $(MIN) --output /tmp/qa_boards.json

# ─── ConceptNet → CENTERS (programmatic graph) ──────────────────────
graph: ## build a programmatic CENTERS graph from ConceptNet (requires $(CONCEPTNET))
	@test -f $(CONCEPTNET) || { echo "missing $(CONCEPTNET) — see utils/README.md"; exit 1; }
	$(PY) $(BUILDER) --conceptnet $(CONCEPTNET) --output utils/centers_auto.json

discover: ## auto-discover new CENTERS via community-detection on semantic_graph_expanded.json
	@test -f semantic_graph_expanded.json || { echo "missing semantic_graph_expanded.json — run utils/build_graph.py first"; exit 1; }
	$(PY) utils/discover_centers.py --top $(N) --output utils/centers_auto.json

discover-py: ## same as discover but print a paste-ready Python chunk
	@test -f semantic_graph_expanded.json || { echo "missing semantic_graph_expanded.json — run utils/build_graph.py first"; exit 1; }
	$(PY) utils/discover_centers.py --top $(N) --as-python

# ─── play ───────────────────────────────────────────────────────────
play: ## open the daily player in the default browser (loads $(BOARDS) via drag-drop)
	@open $(PLAYER) 2>/dev/null || xdg-open $(PLAYER) 2>/dev/null || \
	  echo "Open $(PLAYER) manually."

serve: ## serve src/ over localhost:8000 so the player can fetch boards.json directly
	cd $(SRC) && $(PY) -m http.server 8000

# ─── housekeeping ───────────────────────────────────────────────────
clean: ## remove generated puzzle JSONs and pycache
	rm -f $(BOARDS) word_nexus_boards.json /tmp/qa_boards.json
	find . -type d -name __pycache__ -prune -exec rm -rf {} +

.PHONY: help install boards append centers qa graph discover discover-py play serve clean
