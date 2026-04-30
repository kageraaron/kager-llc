import { SimpleNN } from './neuralNet';
export const NUM_PLAYERS = 4;
export const PLAYER_NAMES = ['You', 'AI-Alpha', 'AI-Beta', 'AI-Gamma'];
export const CARD_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const CARD_COUNTS = {
    1: 11, 2: 11, 3: 11, 4: 11, 5: 11,
    6: 7, 7: 7, 8: 7, 9: 7, 10: 7
};
export const createDeck = () => {
    const deck = [];
    CARD_VALUES.forEach(val => {
        for (let i = 0; i < CARD_COUNTS[val]; i++) {
            deck.push(val);
        }
    });
    return shuffleArray(deck);
};
export const calculateTotalScore = (scorePile) => scorePile.reduce((a, b) => a + b, 0);
export const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};
export const DEFAULT_AI_PARAMS = {
    theftPenalty: 0.35,
    riskBuffer: 1.5,
    stealValueMult: 1.3,
    opponentMinimizeMult: 1.15
};
export const getAIPersonality = (base, seed) => {
    const perturb = (val, range) => val + (Math.random() - 0.5) * range;
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
    outputSize: 5 // START, DRAW, STAY, STEAL, SKIP
};
export class NeuralAI {
    static extractFeatures(state) {
        const pIdx = state.activePlayerIndex;
        const player = state.players[pIdx];
        // Helper to normalize counts (0-11 -> 0.0-1.0 approx)
        const norm = (val) => val / 11.0;
        // 1. My Display (10)
        const myDisplay = new Array(10).fill(0);
        player.display.forEach(c => myDisplay[c - 1]++);
        // 2. Deck Distribution (10) - Perfect Knowledge
        const deckDist = new Array(10).fill(0);
        // We can calculate this from total - (discard + all displays + all score piles)
        // Or just iterate the actual deck if we have access (we do in GameState)
        state.deck.forEach(c => deckDist[c - 1]++);
        // 3. Opponents (Relative Position: Next, +2, +3)
        const oppDisplays = [];
        const oppScores = [];
        for (let offset = 1; offset < NUM_PLAYERS; offset++) {
            const oppIdx = (pIdx + offset) % NUM_PLAYERS;
            const opp = state.players[oppIdx];
            const d = new Array(10).fill(0);
            opp.display.forEach(c => d[c - 1]++);
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
            ...myDisplay.map(norm), // 10
            ...deckDist.map(norm), // 10
            ...oppDisplays, // 30
            isPending, // 1
            ...stealCardOneHot, // 10
            ...stealCounts, // 3
            deckSize, // 1
            myScore, // 1
            ...oppScores // 3
            // Total: 10+10+30+1+10+3+1+1+3 = 69
        ];
    }
    static getAction(state, weights) {
        if (!state.turnStarted)
            return 'START_TURN';
        const player = state.players[state.activePlayerIndex];
        const nn = new SimpleNN(NEURAL_CONFIG.inputSize, NEURAL_CONFIG.hiddenSize, NEURAL_CONFIG.outputSize);
        if (weights.length > 0)
            nn.loadWeights(weights);
        const inputs = this.extractFeatures(state);
        const outputs = nn.forward(inputs);
        // Output Mapping: 0: START(unused), 1: HIT, 2: STAND, 3: STEAL, 4: SKIP
        // We mask invalid actions
        // If pending steal, only 3 or 4 allowed
        if (state.pendingSteal) {
            return outputs[3] > outputs[4] ? 'STEAL' : 'SKIP_STEAL';
        }
        // Safety Constraint: Never STAND with < 3 cards (unless deck is empty, handled by engine)
        if (player.display.length < 3)
            return 'HIT';
        // Else, only 1 or 2 allowed
        return outputs[1] > outputs[2] ? 'HIT' : 'STAND';
    }
    static getActivations(state, weights) {
        const nn = new SimpleNN(NEURAL_CONFIG.inputSize, NEURAL_CONFIG.hiddenSize, NEURAL_CONFIG.outputSize);
        if (weights.length > 0)
            nn.loadWeights(weights);
        const inputs = this.extractFeatures(state);
        return nn.forwardWithActivations(inputs);
    }
}
// --- Heuristic Bots ---
export class HeuristicBots {
    static getConservativeAction(state) {
        if (!state.turnStarted)
            return 'START_TURN';
        const player = state.players[state.activePlayerIndex];
        if (state.pendingSteal)
            return 'STEAL'; // Usually always steal
        if (player.display.length < 3)
            return 'HIT';
        return 'STAND';
    }
    static getAggressiveAction(state) {
        if (!state.turnStarted)
            return 'START_TURN';
        const player = state.players[state.activePlayerIndex];
        if (state.pendingSteal)
            return 'STEAL';
        if (player.display.length < 5)
            return 'HIT';
        return 'STAND';
    }
    static getMathBotAction(state, threshold = 0.25) {
        if (!state.turnStarted)
            return 'START_TURN';
        const player = state.players[state.activePlayerIndex];
        if (state.pendingSteal)
            return 'STEAL';
        // Calculate exact bust probability
        const deckSize = state.deck.length;
        if (deckSize === 0)
            return 'STAND';
        const remaining = { ...CARD_COUNTS };
        state.discardPile.forEach(c => remaining[c]--);
        state.players.forEach(p => {
            p.scorePile.forEach(c => remaining[c]--);
            p.display.forEach(c => remaining[c]--);
        });
        let bustCount = 0;
        for (const val of CARD_VALUES) {
            const count = remaining[val];
            const isBust = player.display.includes(val) && player.display.length >= 3;
            if (isBust)
                bustCount += count;
        }
        const bustProb = bustCount / deckSize;
        return bustProb <= threshold ? 'HIT' : 'STAND';
    }
}
export class AdvancedAI {
    /**
     * Calculates the utility of a specific display configuration.
     * Utility = StandEV + Max(0, HitEV)
     */
    static evaluatePosition(display, state, params) {
        const currentVal = display.reduce((a, b) => a + b, 0);
        const standEV = currentVal * params.theftPenalty;
        const deckSize = state.deck.length;
        if (deckSize === 0)
            return { utility: standEV, standEV, hitEV: -Infinity, bustProb: 0, expectedSteal: 0, expSafeGain: 0, expBustLoss: 0 };
        const remaining = { ...CARD_COUNTS };
        state.discardPile.forEach(c => remaining[c]--);
        state.players.forEach(p => {
            p.scorePile.forEach(c => remaining[c]--);
            p.display.forEach(c => remaining[c]--);
        });
        let expSafeGain = 0;
        let expBustLoss = 0;
        let expectedSteal = 0;
        let bustProb = 0;
        for (const val of CARD_VALUES) {
            const count = remaining[val];
            if (count <= 0)
                continue;
            const prob = count / deckSize;
            const alreadyHas = display.includes(val);
            const isBust = alreadyHas && display.length >= 3;
            if (isBust) {
                bustProb += prob;
                const loss = prob * (standEV * params.riskBuffer);
                expBustLoss += loss;
            }
            else {
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
    static getEVDetails(state, params = DEFAULT_AI_PARAMS) {
        const player = state.players[state.activePlayerIndex];
        if (!state.turnStarted)
            return { action: 'START_TURN', standEV: 0, hitEV: 0, probabilities: {}, expectedStealVal: 0, bustProb: 0, stealEV: 0, expSafeGain: 0, expBustLoss: 0 };
        if (state.pendingSteal) {
            const { card, fromPlayers } = state.pendingSteal;
            const displayIfSteal = [...player.display, card];
            fromPlayers.forEach(fp => {
                for (let i = 0; i < fp.count; i++)
                    displayIfSteal.push(card);
            });
            const evalSteal = this.evaluatePosition(displayIfSteal, state, params);
            const displayIfDecline = [...player.display, card];
            const evalDecline = this.evaluatePosition(displayIfDecline, state, params);
            const stealEV = evalSteal.utility - evalDecline.utility;
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
    static getAction(state, params = DEFAULT_AI_PARAMS) {
        return this.getEVDetails(state, params).action;
    }
}
