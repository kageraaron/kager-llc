# GEMINI.md — Semantic Sudoku

> Working brief for any AI agent (Gemini, Claude, etc.) helping turn **Semantic Sudoku** into a sustainable side‑revenue product. Read this before touching code or strategy.

---

## 1. What this project is (one paragraph)

Semantic Sudoku is a daily word puzzle: a 3×3 grid where the eight pair‑axes (all three verticals, all three horizontals, and two diagnolas) must all semantically converge on the same center word. Think *Connections* meets *Wordle* meets a magic square — players are given the 8 outer tiles and must deduce the center, or vice versa. The "fun" comes from lateral leaps: `TREE + LIGHTNING = FIRE`. The codebase is a Python board generator plus a static HTML/JS player; there is no backend, no auth, no DB — yet.

---

## 2. Codebase map (what to touch, what to ignore)

There are two generations of code in this repo. **The `src/` folder is the canonical, current generation.** Everything in the root is the v1 prototype.

### `src/` — current generation (work here)
| File | Role |
| --- | --- |
| `semantic_sudoku_generator.py` | Offline generator. Hand‑curated `CENTERS` dict maps each center word → list of `(word, strength)` tuples (3 = iconic, 2 = solid, 1 = lateral). Uses numpy/scipy for scoring + diversity. Zero API calls. **This is the engine.** |
| `word_nexus_generator.py` | Sibling generator (alt naming). Likely an experiment — confirm vs. `semantic_sudoku_generator.py` before extending; pick one and delete the other. |
| `semantic_sudoku.html` | Polished player. Dark theme, Syne / Instrument Serif, single‑file vanilla JS. |
| `daily_game.html` | Alt player. Paper / DM Serif aesthetic, includes a drag‑and‑drop loader for `boards.json`. |
| `semantic_sudoku_boards.json` | Pre‑generated boards consumed by the players. |

### `utils/` — work here for resources, building modules / helper functions, etc.
| File | Role |
| --- | --- |
| `utils/conceptnet-assertions-5.7.0.csv.gz` | Open source concept net for the english language. Not yet utilized, but I wish for it to be used to create conceptual relations between words. (I want the algorithm to know somehow "Brain" and "Tennis" are related through "Stroke", but to do it programatically.)
| `utils/google-10k.txt` | Google 10k most searched english words
| `utils/nounlist.txt` | Popular 6k+ english nouns

### Root — v1 prototype (treat as legacy / reference only)
`build_graph.py`, `generate_boards*.py`, `boards*.json`, `index.html`, the 10GB ConceptNet dump, `nounlist.txt`, `google-10k.txt`. The hand‑curated graph in `src/` produces higher‑quality boards than the ConceptNet pipeline did, which is why v2 exists. We will be reintegrating ConceptNet in a way that emulates how the hand-curated grpah in 'src/word_nexus_generator.py' does.

### Cleanups to propose on the next pass
- Keep `word_nexus_generator.py`. Expand the semantic search to find valid game boards that feed into the game.
- Keep `daily_game.html` as the canonical player
- Move the 10GB `conceptnet-assertions-5.7.0.csv.gz` out of the repo (gitignore + external storage). It bloats clones and is unused by `src/`.
- Add a real `requirements.txt` (numpy, scipy) and a `Makefile` / `npm`‑style script entry points.
- Find a way to programatically generate CENTERS: dict[str, dict[str, list[tuple[str, int]]]] = ... (line 62 of src/word_nexus_generator.py)

---

## 3. The product, honestly assessed

**Strengths**
- Mechanic is original and shareable. "I got it in 3 guesses, what's yours?" is the Wordle hook, and the `TREE + LIGHTNING = FIRE` aha moment is genuinely satisfying.
- Generator is offline, deterministic with a seed, and cheap to run — no per‑puzzle inference cost.
- Single‑file static frontend means hosting cost is ~$0.

**Weaknesses (the things that block revenue)**
- No daily puzzle pipeline. There is no notion of "today's puzzle" — players load a JSON of boards.
- No persistence: streaks, stats, history, share cards all missing. Add this as a TODO.
- No distribution. No domain, no SEO, no email list, no app store listing.
- Quality of the curated `CENTERS` graph caps the puzzle library. A side‑revenue product needs ~365 puzzles/year minimum.
- Two competing players and two competing generators — product identity is unclear. -> The brand I have decided on is 'Daily Word Nexus' and the generator chosen is /src/word_nexus_generator.py.

Fix these in roughly this order. Revenue follows distribution, distribution follows a working daily loop.

---

## 4. Monetization strategy (ranked by effort vs. plausible revenue)

The realistic ceiling for a solo‑dev daily word game is **$500–$5,000/month** within 12 months if you nail the daily loop and one growth channel. Anything more requires a viral moment or a publisher deal. Plan accordingly.

### Tier 1 — ship these first (weeks, not months)

1. **Daily puzzle + share card.** One puzzle per day, deterministic by date. After solving, generate a spoiler‑free emoji grid (Wordle's exact playbook) the user can copy‑paste. This is the single highest‑leverage feature; it is the entire growth engine.
2. **Local‑storage stats** — current streak, best streak, win distribution, average guesses. Costs nothing, dramatically increases retention.
3. **Domain + simple landing page.** `semanticsudoku.com` or similar. Static deploy on Cloudflare Pages / Netlify (free). Open Graph tags so the share card previews nicely on iMessage, Twitter, Discord.

### Tier 2 — first revenue (1–3 months)

4. **Display ads** — a single, tasteful ad slot below the grid. Ezoic or Mediavine once you hit traffic thresholds; Google AdSense before that. At ~10k DAU a single slot realistically yields $300–$1,000/month. Do not stuff ads; this is a calm puzzle, not Cracked.com.
5. **"Buy me a coffee" / Ko‑fi link** in the footer. Small revenue, but converts from people who *love* the puzzle and tells you whether anyone does.
6. **Puzzle pack PDFs ($3–$5)** — sell 50‑puzzle printable PDFs on Gumroad. Generation is already automated; the only work is laying them out (use the `pdf` skill). Great gift for the crossword‑and‑coffee crowd.

### Tier 3 — recurring revenue (3–9 months)

7. **Premium tier ($2.99/mo or $19/yr)** — archive access (play any past puzzle), unlimited custom seed boards, hint system, no ads, themed puzzle packs (movies, science, mythology). Use Stripe Checkout — no backend code needed, just a webhook to flip a flag. Realistic conversion: 1–3% of DAU.
8. **iOS / Android wrapper apps.** Capacitor or a thin SwiftUI/Compose shell around the web view. App Store discoverability is real, and in‑app purchase for premium has higher conversion than web checkout.
9. **Email list ("Today's puzzle in your inbox")** — Buttondown or Beehiiv. Costs ~$10/mo, becomes the single most valuable distribution asset you own. Sponsor slot at the bottom is sellable once list > 5k.

### Tier 4 — only if Tiers 1–3 work (9+ months)

10. **Branded / sponsored puzzles** ("This week's Semantic Sudoku is brought to you by Roam Research, where the answers all converge on KNOWLEDGE"). Real money but requires audience.
11. **Education licensing.** ESL teachers, vocab classes, gifted programs. Sell a $99/yr classroom license with a teacher dashboard. Niche but sticky.
12. **API / white‑label.** License the generator to other puzzle publishers. Low likelihood, but high margin if it lands.

### Things to *not* do
- **NFTs, tokens, daily‑login crypto rewards.** No.
- **Energy / lives system on the daily.** Fastest way to kill goodwill in this genre.
- **AI‑generated puzzles served live.** Latency and cost ruin the model. Pre‑generate, curate, ship.
- **Pivoting the mechanic.** The mechanic is the product. Resist the urge to add modes before the core daily loop has 1k regulars.

---

## 5. Concrete next‑sprint roadmap (what to ask the agent to do, in order)

1. **Pick the canonical player.** Diff `semantic_sudoku.html` vs. `daily_game.html`, choose one, port the best of the other into it as a theme toggle. I have decided on daily_game.html.
2. **Add daily‑puzzle indexing.** `puzzleNumber = floor((today - epoch) / 1 day)`. Use it to deterministically pick from `semantic_sudoku_boards.json`. Show "Puzzle #142 — April 28, 2026" in the header.
3. **Build the share card.** After a win/loss: a 3×3 emoji grid encoding guess history (e.g. `⬛🟨🟩` per attempt) + `Semantic Sudoku #142 3/6 — semanticsudoku.com`. Copy‑to‑clipboard button.
4. **Wire localStorage stats.** Streak, last‑played date, win distribution, share count. Render a stats modal on win.
5. **Generate 365 boards** with the offline generator and commit the JSON. Manually QA the first 30 — bad puzzles in week one will kill word‑of‑mouth.
6. **Ship a landing page** with OG tags, favicon, "Play today's puzzle" CTA, and a buttondown email signup.
7. **Add a single AdSense slot** under the grid (only after the share card and stats are live — never before).
8. **Stripe Checkout for premium archive access.** Single product, single price, no subscription portal in v1.

For each task: small PR, screenshot before/after, test on iOS Safari (this game lives or dies on phones).

---

## 6. Operating principles for the AI agent

- **Match the existing aesthetic.** Both players use serif + mono pairings, generous whitespace, muted palettes. Do not introduce Tailwind defaults, neon gradients, or rounded‑full buttons.
- **Stay vanilla.** No React, no build step, no npm install for the player. The frontend is one HTML file by design — that is a feature (deployability, longevity, hackability). Keep it that way until there is a measurable reason not to.
- **Generator changes are higher‑stakes than UI changes.** A bad puzzle reaches every player. Always run a generated set past a human (the user) before replacing `semantic_sudoku_boards.json`.
- **Prefer offline, deterministic, free.** No paid APIs in the hot path. No live LLM calls per puzzle. If a feature needs a backend, justify it in writing first.
- **Telemetry must be respectful.** Plausible or simple Cloudflare Web Analytics — not GA4, not Hotjar, not session replay. Word‑puzzle players are an audience that punishes creepiness.
- **Don't add documentation files unsolicited.** The user maintains `README.md`, `CLAUDE.md`, and this `GEMINI.md`. Edit them when asked; do not spawn new `.md` files.

---

## 7. Success metrics to track (once analytics is in)

| Stage | Metric | Healthy target |
| --- | --- | --- |
| Daily loop works | D1 retention | > 35% |
| Share card works | Share rate (shares / wins) | > 10% |
| Distribution works | DAU growth | +5% week‑over‑week |
| Monetization works | ARPDAU (ads) | $0.02–$0.08 |
| Monetization works | Premium conversion | 1–3% of DAU |

If D1 retention is below 20% after the daily loop ships, the puzzle is too hard or the win moment is unsatisfying — fix that before doing anything else on this list.

---

*Last updated: 2026‑04‑28. Owner: aa (kageraa@udel.edu).*