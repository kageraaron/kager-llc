import { SimpleNN } from './neuralNet';

export const NUM_PLAYERS = 4;
export const PLAYER_NAMES = ['You', 'AI-Alpha', 'AI-Beta', 'AI-Gamma'];
export const CARD_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const CARD_COUNTS: Record<number, number> = {
  1: 11, 2: 11, 3: 11, 4: 11, 5: 11,
  6: 7, 7: 7, 8: 7, 9: 7, 10: 7
};

export type Player = {
  id: number;
  name: string;
  scorePile: number[];
  display: number[];
};

export type PendingSteal = {
  card: number;
  fromPlayers: { playerId: number; count: number }[];
};

export type GameState = {
  deck: number[];
  players: Player[];
  discardPile: number[];
  activePlayerIndex: number;
  turnStarted: boolean;
  pendingSteal: PendingSteal | null;
  lastDrawn: number | null;
  message: string;
  isGameOver: boolean;
};

export const createDeck = () => {
  const deck: number[] = [];
  CARD_VALUES.forEach(val => {
    for (let i = 0; i < CARD_COUNTS[val]; i++) {
      deck.push(val);
    }
  });
  return shuffleArray(deck);
};

export const calculateTotalScore = (scorePile: number[]) => scorePile.reduce((a, b) => a + b, 0);

export const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export type AIParameters = {
  theftPenalty: number;
  riskBuffer: number;
  stealValueMult: number;
  opponentMinimizeMult: number;
};

export const DEFAULT_AI_PARAMS: AIParameters = {
  theftPenalty: 0.35,
  riskBuffer: 1.5,
  stealValueMult: 1.3,
  opponentMinimizeMult: 1.15
};

export type EVResult = {
  action: 'HIT' | 'STAND' | 'STEAL' | 'SKIP_STEAL' | 'START_TURN';
  standEV: number;
  hitEV: number;
  probabilities: Record<number, number>;
  expectedStealVal: number;
  bustProb: number;
  stealEV: number;
  expSafeGain: number;
  expBustLoss: number;
  utilityIfSteal?: number;
  utilityIfDecline?: number;
};

export const getAIPersonality = (base: AIParameters, seed: number): AIParameters => {
  const perturb = (val: number, range: number) => val + (Math.random() - 0.5) * range;
  return {
    theftPenalty: Math.max(0, Math.min(1, perturb(base.theftPenalty, 0.2))),
    riskBuffer: Math.max(0, perturb(base.riskBuffer, 0.4)),
    stealValueMult: Math.max(0, perturb(base.stealValueMult, 0.5)),
    opponentMinimizeMult: Math.max(0, perturb(base.opponentMinimizeMult, 0.4)),
  };
};

// --- Neural AI ---

export const NEURAL_CONFIG = {
  inputSize: 69,
  hiddenSize: 40,
  outputSize: 5 // START, HIT, STAND, STEAL, SKIP
};

export class NeuralAI {
  static extractFeatures(state: GameState): number[] {
    const pIdx = state.activePlayerIndex;
    const player = state.players[pIdx];
    
    // Helper to normalize counts (0-11 -> 0.0-1.0 approx)
    const norm = (val: number) => val / 11.0;
    
    // 1. My Display (10)
    const myDisplay = new Array(10).fill(0);
    player.display.forEach(c => myDisplay[c-1]++);
    
    // 2. Deck Distribution (10) - Perfect Knowledge
    const deckDist = new Array(10).fill(0);
    // We can calculate this from total - (discard + all displays + all score piles)
    // Or just iterate the actual deck if we have access (we do in GameState)
    state.deck.forEach(c => deckDist[c-1]++);
    
    // 3. Opponents (Relative Position: Next, +2, +3)
    const oppDisplays: number[] = [];
    const oppScores: number[] = [];
    
    for (let offset = 1; offset < NUM_PLAYERS; offset++) {
      const oppIdx = (pIdx + offset) % NUM_PLAYERS;
      const opp = state.players[oppIdx];
      
      const d = new Array(10).fill(0);
      opp.display.forEach(c => d[c-1]++);
      oppDisplays.push(...d.map(norm)); // Normalized display counts
      
      oppScores.push(calculateTotalScore(opp.scorePile) / 100.0); // Rough normalization
    }
    
    // 4. Pending Steal Info
    let isPending = 0;
    const stealCardOneHot = new Array(10).fill(0);
    const stealCounts = [0, 0, 0]; // Relative opponents
    
    if (state.pendingSteal) {
      isPending = 1;
      stealCardOneHot[state.pendingSteal.card - 1] = 1;
      
      state.pendingSteal.fromPlayers.forEach(fp => {
        // Find relative offset
        let offset = (fp.playerId - pIdx + NUM_PLAYERS) % NUM_PLAYERS;
        if (offset > 0 && offset <= 3) {
          stealCounts[offset - 1] = fp.count / 3.0; // Normalize
        }
      });
    }

    // 5. Global / Self Stats
    const deckSize = state.deck.length / 50.0;
    const myScore = calculateTotalScore(player.scorePile) / 100.0;

    return [
      ...myDisplay.map(norm),        // 10
      ...deckDist.map(norm),         // 10
      ...oppDisplays,                // 30
      isPending,                     // 1
      ...stealCardOneHot,            // 10
      ...stealCounts,                // 3
      deckSize,                      // 1
      myScore,                       // 1
      ...oppScores                   // 3
      // Total: 10+10+30+1+10+3+1+1+3 = 69
    ];
  }

  static getAction(state: GameState, weights: number[]): 'HIT' | 'STAND' | 'STEAL' | 'SKIP_STEAL' | 'START_TURN' {
    if (!state.turnStarted) return 'START_TURN';

    const player = state.players[state.activePlayerIndex];
    const nn = new SimpleNN(NEURAL_CONFIG.inputSize, NEURAL_CONFIG.hiddenSize, NEURAL_CONFIG.outputSize);
    if (weights.length > 0) nn.loadWeights(weights);
    
    const inputs = this.extractFeatures(state);
    const outputs = nn.forward(inputs);
    
    // Output Mapping: 0: START(unused), 1: HIT, 2: STAND, 3: STEAL, 4: SKIP
    // We mask invalid actions
    
    // If pending steal, only 3 or 4 allowed
    if (state.pendingSteal) {
      return outputs[3] > outputs[4] ? 'STEAL' : 'SKIP_STEAL';
    }
    
    // Safety Constraint: Never STAND with < 3 cards (unless deck is empty, handled by engine)
    if (player.display.length < 3) return 'HIT';

    // Else, only 1 or 2 allowed
    return outputs[1] > outputs[2] ? 'HIT' : 'STAND';
  }

  static getActivations(state: GameState, weights: number[]): { inputs: number[], hidden: number[], outputs: number[] } {
    const nn = new SimpleNN(NEURAL_CONFIG.inputSize, NEURAL_CONFIG.hiddenSize, NEURAL_CONFIG.outputSize);
    if (weights.length > 0) nn.loadWeights(weights);
    
    const inputs = this.extractFeatures(state);
    return nn.forwardWithActivations(inputs);
  }
}

// --- Heuristic Bots ---

export class HeuristicBots {
  static getConservativeAction(state: GameState): string {
    if (!state.turnStarted) return 'START_TURN';
    const player = state.players[state.activePlayerIndex];
    if (state.pendingSteal) return 'STEAL'; // Usually always steal
    if (player.display.length < 3) return 'HIT';
    return 'STAND';
  }

  static getAggressiveAction(state: GameState): string {
    if (!state.turnStarted) return 'START_TURN';
    const player = state.players[state.activePlayerIndex];
    if (state.pendingSteal) return 'STEAL';
    if (player.display.length < 5) return 'HIT';
    return 'STAND';
  }

  static getMathBotAction(state: GameState, threshold: number = 0.25): string {
    if (!state.turnStarted) return 'START_TURN';
    const player = state.players[state.activePlayerIndex];
    
    // 1. Bust Risk Check (Precedence)
    const deckSize = state.deck.length;
    if (deckSize === 0) return 'STAND';

    const remaining: Record<number, number> = { ...CARD_COUNTS };
    state.discardPile.forEach(c => remaining[c]--);
    state.players.forEach(p => {
      p.scorePile.forEach(c => remaining[c]--);
      p.display.forEach(c => remaining[c]--);
    });

    let bustProb = 0;
    // Rule: Bust if already in hand AND hand size >= 3
    if (player.display.length >= 3) {
      let bustCount = 0;
      for (const val of player.display) {
          bustCount += remaining[val];
      }
      bustProb = bustCount / deckSize;
    }

    // Force stand if high bust risk
    if (bustProb > 0.5) return 'STAND'; 

    // 2. Steal Check (Only if no bust possible or intended)
    if (state.pendingSteal) return 'STEAL';
    
    // 3. Normal Play
    return bustProb <= threshold ? 'HIT' : 'STAND';
  }
}

export class AdvancedAI {
  /**
   * Calculates the utility of a specific display configuration.
   * Utility = StandEV + Max(0, HitEV)
   */
  static evaluatePosition(display: number[], state: GameState, params: AIParameters): { utility: number; standEV: number; hitEV: number; bustProb: number; expectedSteal: number; expSafeGain: number; expBustLoss: number } {
    const currentVal = display.reduce((a, b) => a + b, 0);
    const standEV = currentVal * params.theftPenalty;
    const deckSize = state.deck.length;
    if (deckSize === 0) return { utility: standEV, standEV, hitEV: -Infinity, bustProb: 0, expectedSteal: 0, expSafeGain: 0, expBustLoss: 0 };

    const remaining: Record<number, number> = { ...CARD_COUNTS };
    state.discardPile.forEach(c => remaining[c]--);
    state.players.forEach(p => {
      p.scorePile.forEach(c => remaining[c]--);
      p.display.forEach(c => remaining[c]--);
    });

    // Adjust 'remaining' counts if a steal is pending
    if (state.pendingSteal) {
      const stolenCard = state.pendingSteal.card;
      state.pendingSteal.fromPlayers.forEach(fp => {
        // Ensure we don't go below zero, though theoretically this shouldn't happen
        // if 'remaining' was calculated correctly initially.
        remaining[stolenCard] = Math.max(0, remaining[stolenCard] - fp.count);
      });
    }

    let expSafeGain = 0;
    let expBustLoss = 0;
    let expectedSteal = 0;
    let bustProb = 0;

    for (const val of CARD_VALUES) {
      const count = remaining[val]; // Now 'count' will be more accurate for pending steal
      if (count <= 0) continue;
      const prob = count / deckSize;

      const alreadyHas = display.includes(val);
      const isBust = alreadyHas && display.length >= 3;

      if (isBust) {
        bustProb += prob;
        const loss = prob * (standEV * params.riskBuffer);
        expBustLoss += loss;
      } else {
        let rawStealVal = 0;
        state.players.forEach((other, idx) => {
          if (idx !== state.activePlayerIndex) {
            const fromOther = other.display.filter(v => v === val).length * val;
            rawStealVal += fromOther;
          }
        });
        const weightedGain = prob * (val + (rawStealVal * (params.stealValueMult + params.opponentMinimizeMult))) * params.theftPenalty;
        expectedSteal += prob * rawStealVal;
        expSafeGain += weightedGain;
      }
    }

    const hitEV = expSafeGain - expBustLoss;
    const utility = standEV + Math.max(0, hitEV);
    return { utility, standEV, hitEV, bustProb, expectedSteal, expSafeGain, expBustLoss };
  }

  static getEVDetails(state: GameState, params: AIParameters = DEFAULT_AI_PARAMS): EVResult {
    const player = state.players[state.activePlayerIndex];

    if (!state.turnStarted) return { action: 'START_TURN', standEV: 0, hitEV: 0, probabilities: {}, expectedStealVal: 0, bustProb: 0, stealEV: 0, expSafeGain: 0, expBustLoss: 0 };

    if (state.pendingSteal) {
      const { card, fromPlayers } = state.pendingSteal;
      
      // Bust rule: Cannot steal if it would have been a bust.
      // Actually, if it's a steal, it means it's NOT a bust.
      // The Engine ensures this by checking bust first.
      
      const displayIfSteal = [...player.display, card];
      fromPlayers.forEach(fp => {
        for(let i=0; i<fp.count; i++) displayIfSteal.push(card);
      });
      const evalSteal = this.evaluatePosition(displayIfSteal, state, params);

      const displayIfDecline = [...player.display, card];
      const evalDecline = this.evaluatePosition(displayIfDecline, state, params);

      const stealEV = evalSteal.utility - evalDecline.utility;
      
      // If bust probability is high, even stealing might be risky (but we only reach this if bust didn't happen)
      // So here we trust the evaluation.
      const action = stealEV >= 0 ? 'STEAL' : 'SKIP_STEAL';
      
      let rawStealVal = 0;
      fromPlayers.forEach(fp => rawStealVal += fp.count * card);

      return { 
        action, 
        standEV: evalDecline.standEV, 
        hitEV: evalDecline.hitEV, 
        probabilities: {}, 
        expectedStealVal: rawStealVal, 
        bustProb: evalDecline.bustProb, 
        stealEV,
        expSafeGain: evalDecline.expSafeGain,
        expBustLoss: evalDecline.expBustLoss
      };
    }

    const evalCurrent = this.evaluatePosition(player.display, state, params);
    const action = evalCurrent.hitEV > 0 ? 'HIT' : 'STAND';

    return { 
      action, 
      standEV: evalCurrent.standEV, 
      hitEV: evalCurrent.hitEV, 
      probabilities: {}, 
      expectedStealVal: evalCurrent.expectedSteal, 
      bustProb: evalCurrent.bustProb, 
      stealEV: 0,
      expSafeGain: evalCurrent.expSafeGain,
      expBustLoss: evalCurrent.expBustLoss
    };
  }

  static getAction(state: GameState, params: AIParameters = DEFAULT_AI_PARAMS): 'HIT' | 'STAND' | 'STEAL' | 'SKIP_STEAL' | 'START_TURN' {
    return this.getEVDetails(state, params).action;
  }
}
