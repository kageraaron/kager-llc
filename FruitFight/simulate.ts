import { 
  createDeck, 
  AdvancedAI, 
  GameState, 
  NUM_PLAYERS, 
  PLAYER_NAMES, 
  AIParameters, 
  DEFAULT_AI_PARAMS,
  calculateTotalScore,
  shuffleArray 
} from './gameEngine';

class GameSimulator {
  runGame() {
    // Randomize player order
    const indices = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    
    let state: GameState = {
      deck: createDeck(),
      players: indices.map((originalIdx, i) => ({
        id: originalIdx, // Keep original ID for tracking
        name: `AI-${originalIdx}`,
        scorePile: [],
        display: [],
      })),
      activePlayerIndex: 0,
      turnStarted: false,
      pendingSteal: null,
      lastDrawn: null,
      message: "Start",
      discardPile: [],
      isGameOver: false,
    };

    while (!state.isGameOver) {
      const action = AdvancedAI.getAction(state, DEFAULT_AI_PARAMS);
      state = this.applyAction(state, action);
    }

    // Return scores mapped back to their original IDs
    const finalScores = new Array(NUM_PLAYERS).fill(0);
    state.players.forEach(p => {
      finalScores[p.id] = calculateTotalScore(p.scorePile);
    });
    return finalScores;
  }

  applyAction(state: GameState, action: string): GameState {
    const player = state.players[state.activePlayerIndex];

    if (action === 'START_TURN') {
      if (player.display.length > 0) {
        player.scorePile.push(...player.display);
        player.display.length = 0;
      }
      state.turnStarted = true;
      return state;
    }

    if (action === 'STEAL') {
      const { card, fromPlayers } = state.pendingSteal!;
      for (const fp of fromPlayers) {
        const otherDisplay = state.players[fp.playerId].display;
        let j = otherDisplay.length;
        while (j--) {
          if (otherDisplay[j] === card) {
            player.display.push(card);
            otherDisplay.splice(j, 1);
          }
        }
      }
      player.display.push(card);
      state.pendingSteal = null;
      if (state.deck.length === 0) return this.endGame(state);
      return state;
    }

    if (action === 'DRAW') {
      const card = state.deck.pop()!;
      let alreadyHas = false;
      const display = player.display;
      for (let i = 0; i < display.length; i++) {
        if (display[i] === card) {
          alreadyHas = true;
          break;
        }
      }

      if (alreadyHas && display.length >= 3) {
        const bustedCards = [...display, card];
        display.length = 0;
        state.discardPile.push(...bustedCards);
        state.activePlayerIndex = (state.activePlayerIndex + 1) % NUM_PLAYERS;
        state.turnStarted = false;
        if (state.deck.length === 0) return this.endGame(state);
        return state;
      }

      const fromPlayers: { playerId: number; count: number }[] = [];
      for (let idx = 0; idx < NUM_PLAYERS; idx++) {
        if (idx === state.activePlayerIndex) continue;
        const oDisplay = state.players[idx].display;
        let count = 0;
        for (let j = 0; j < oDisplay.length; j++) {
          if (oDisplay[j] === card) count++;
        }
        if (count > 0) fromPlayers.push({ playerId: idx, count });
      }

      if (fromPlayers.length > 0) {
        state.pendingSteal = { card, fromPlayers };
        return state;
      }

      player.display.push(card);
      if (state.deck.length === 0) return this.endGame(state);
      return state;
    }

    if (action === 'STAY') {
      state.activePlayerIndex = (state.activePlayerIndex + 1) % NUM_PLAYERS;
      state.turnStarted = false;
      return state;
    }

    return state;
  }

  endGame(state: GameState): GameState {
    state.players.forEach(p => {
      p.scorePile.push(...p.display);
      p.display = [];
    });
    state.isGameOver = true;
    return state;
  }
}

// RUN SIMULATION
const sim = new GameSimulator();
const numGames = 1000;
const results = Array(NUM_PLAYERS).fill(0);
const wins = Array(NUM_PLAYERS).fill(0);

for (let i = 0; i < numGames; i++) {
  const scores = sim.runGame();
  const maxScore = Math.max(...scores);
  scores.forEach((s, idx) => {
    results[idx] += s;
    if (s === maxScore) wins[idx]++;
  });
}

console.log(`Results for ${numGames} games (Randomized Turn Order):`);
for (let i = 0; i < NUM_PLAYERS; i++) {
  console.log(`AI-${i}: Avg Score: ${(results[i] / numGames).toFixed(2)}, Win Rate: ${((wins[i] / numGames) * 100).toFixed(2)}%`);
}
