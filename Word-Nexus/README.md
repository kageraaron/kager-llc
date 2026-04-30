# DAILY WORD NEXUS

A daily word puzzle project designed to test lateral thinking, abstraction, and the conceptual connections between words. 

Semantic Sudoku transforms standard word association into a multi-dimensional graph traversal game. It is not just about finding synonyms; it is about discovering the cultural idioms, abstract relationships, and "Aha!" moments that bridge distant concepts together.

---

## 🧠 Core Ideas & Tenets

1. **The Semantic Magic Square:** The board is a 3x3 grid. Just like a mathematical magic square where all rows and columns add up to the same number, a Word Nexus board is a "Semantic Magic Square." All opposite pairings on the outer ring must conceptually add up to the exact same center word.
2. **Lateral Leaps:** The four corners of the board act as the starting anchors. Good game design dictates that these four corners must be as conceptually distant from each other as possible. The puzzle lies in bridging these unrelated concepts.
3. **No Morphological Cheating:** All 9 words on the board must be entirely unique, and no two words can share the same morphological root (e.g., "Measure" and "Measurement" cannot exist on the same board).
4. **The Weakest Link Dictates Strength:** A connection is only as strong as its weakest conceptual link. If Word A strongly points to the Center, but Word B only loosely points to it, the pair fails. Both words must independently and strongly justify the center.

---

## 📜 Rules of the Game

To solve a Word Nexus board, the player must fill a 3x3 grid where **eight distinct paths** perfectly converge on the central tile. 

Given the 4 outer tiles given to the player, the following intersections must mathematically and semantically equal the Center Tile:

1. **Horizontal 1:** `Top Left` + `Top Right` = `Top Center`
1. **Horizontal 2:** `Center Left` + `Center Right` = `Center Center`
1. **Horizontal 3:** `Bottom Left` + `Bottom Right` = `Bottom Center`
1. **Vertical 1:** `Top Left` + `Top Right` = `Center`
1. **Vertical 2:** `Top Center` + `Center` = `Center`
2. **Vertical 3:** `Left Edge` + `Right Edge` = `Center`
3. **Diagonal 1:** `Top-Left Corner` + `Bottom-Right Corner` = `Center`
4. **Diagonal 2:** `Top-Right Corner` + `Bottom-Left Corner` = `Center`

*Example:* If the Top-Left is "TREE" and the Bottom-Right is "LIGHTNING", the Center might be "FIRE".

---

## ⚙️ The Programmatic Approach (The Engine)

Generating a flawless Semantic Sudoku board requires navigating billions of potential word combinations. To do this efficiently, the project relies on a highly optimized algorithmic pipeline using Python and Graph Theory.

### 1. The Knowledge Graph (ConceptNet)
The backbone of the engine is the **ConceptNet 5.7.0** open-source knowledge graph. To prevent the game from using obscure jargon or multi-word phrases, the 10GB dataset is aggressively filtered against "The Great Noun List" (approx. 6,775 highly frequent, everyday English nouns).

### 2. Solving the Combinatorial Explosion
Calculating the combinations for 5,000+ words yields over a quadrillion possibilities. To calculate boards in seconds rather than centuries, the engine uses:
* **Hub Hunting (Degree Centrality):** The algorithm only selects "Seed Words" from the top 500 most highly-connected nodes in the graph.
* **2-Hop Traversal:** From the seed, the engine explores 2 hops out (friends of friends) to gather a localized "neighborhood" of relevant concepts.
* **Stratified Sampling:** To ensure the corners are conceptually distant, the engine takes the top 30 core thematic words, and then randomly samples the remaining words from the "long tail" of the neighborhood. 
* **Canonical Orientation:** Mathematical constraints (`Top-Left < Top-Right`, etc.) prevent the engine from calculating and outputting the same board's rotations and reflections.

### 3. Scoring & Quality Control
* **Multiplicative Scoring:** When testing if two words equal a third, their ConceptNet connection weights are multiplied, not added. This heavily rewards balanced connections ($5 \times 5 = 25$) and punishes lopsided ones ($9 \times 1 = 9$).
* **Semantic Distance Filter:** The four corners are strictly checked against each other. If they share a direct connection weight $> 1.0$, they are rejected.
* **Bubble Popping:** Corners are checked for shared mutual friends. If two corners share too many of the exact same semantic neighbors (e.g., "Shoe" and "Sock"), the algorithm rejects them to force true lateral leaps.
* **Root Stemming:** Python's `difflib` and prefix-checkers automatically scrub boards that accidentally use the same root word twice.

---

## 🚀 Running the Project

### 1. Build the Semantic Graph
First, ensure you have the ConceptNet dataset (`conceptnet-assertions-5.7.0.csv.gz`) in the root directory. Then run:
```bash
python3 build_graph.py
```
This filters the 10GB dataset into a lightweight `semantic_graph.json` using the Great Noun List.

### 2. Generate Playable Boards
To generate a set of high-quality semantic magic squares:
```bash
python3 generate_boards.py
```
This will search the graph for valid 3x3 grids and save them to `boards.json`.

### 3. Play the Game
Open `index.html` in any modern web browser. 
*   **Decoupled Play:** The UI works immediately using a built-in starter board.
*   **Custom Boards:** Due to browser security (CORS), opening `index.html` directly from your file system may prevent it from auto-loading `boards.json`. Use the **"Import custom boards.json"** link at the bottom of the page to load your generated boards manually.
*   **Web Server (Optional):** Alternatively, run a local server to enable auto-loading: `python3 -m http.server 8000`.
