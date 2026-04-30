# Fruit Fight: Advanced AI & Interactive Card Game

**Fruit Fight** (also known as *HIT!* or *No Mercy*) is a strategic press-your-luck card game for 4 players. This project implements the game as a React application featuring an advanced, evolved AI that uses Expectation Maximization (EV) and card counting to maximize its score while aggressively minimizing yours.

---

## 🎮 How to Play

### Rule Summary
- **The Deck:** 90 cards (11 each of 1-5, 7 each of 6-10).
- **Your Turn:** 
  1. **Score:** Any cards in front of you from the previous round are added to your score pile.
  2. **Hit:** Flip a card from the deck.
  3. **Steal:** If the card matches any in other players' displays, you may **steal** them. If you have $\ge 3$ cards at the time of draw, it behooves any player to steal if possible.
  4. **Bust:** If you draw a card you already have AND you have $\ge 3$ cards on the table, you lose everything in your display and your turn ends.
  5. **Choice:** After a safe draw, you can **Stay** (leaving cards vulnerable to theft) or **Draw Again**.
- **Winning:** The player with the highest sum of cards in their score pile when the deck is empty wins.

---

## 🚀 Running the Project

### 1. Install Dependencies
Ensure you have [Node.js](https://nodejs.org/) installed, then run:
```bash
npm install
```

### 2. Start the Interactive UI
Run the development server to play against three evolved AI opponents:
```bash
npm run dev
```
Open the provided URL (usually `http://localhost:5173`) in your browser.

### 3. Run the AI Trainer
The AI's strategy was evolved using a Genetic Algorithm. You can re-run the training to find new "Global Optimum" parameters:
```bash
# Compiles and runs the genetic trainer (300 generations)
npx tsc trainer.ts --esModuleInterop --skipLibCheck --target ESNext --moduleResolution node --module ESNext && node trainer.js
```

### 4. Run a Batch Simulation
To see how the AI performs over a large number of games without the UI:
```bash
# Runs 1000 simulated games and outputs average scores/win rates
npx tsc simulate.ts --esModuleInterop --skipLibCheck --target ESNext --moduleResolution node --module ESNext && node simulate.js
```

---

## 🧠 AI Logic & Evolution

The AI in this project is not just a random "rules-based" CPU. It uses a **Heuristic Expectation Value (EV)** calculation for every decision:

- **Card Counting:** The AI tracks every card flipped to know the exact probability of drawing any specific number.
- **Steal Weighting:** It values stealing cards from you at ~1.3x their face value.
- **Vindictiveness:** It values reducing your score almost as much as increasing its own.
- **Risk Management:** It calculates the mathematical risk of busting vs. the potential reward of a successful draw.

### Evolved Parameters
The `DEFAULT_AI_PARAMS` in `gameEngine.ts` were found after 300 generations of a genetic algorithm with randomized turn order:
- `theftPenalty`: 0.35 (Conservative estimate of card safety)
- `riskBuffer`: 1.52 (High caution against busting)
- `stealValueMult`: 1.30 (Opportunistic stealing)
- `opponentMinimizeMult`: 1.16 (Prioritizes harming others' scores)

---

## 📂 Project Structure
- `App.tsx`: The main React interactive UI.
- `gameEngine.ts`: The core "brain" and game rules shared by the UI and the simulator.
- `trainer.ts`: The Genetic Algorithm script used to evolve AI parameters.
- `simulate.ts`: A headless simulation script for batch testing.
- `App.css`: Styles for the "Fruit" themed game board.
