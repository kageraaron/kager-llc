import { createDeck, AdvancedAI, NeuralAI, NEURAL_CONFIG, NUM_PLAYERS, calculateTotalScore, DEFAULT_AI_PARAMS, HeuristicBots } from './gameEngine';
import { SimpleNN } from './neuralNet';
import * as fs from 'fs';
// --- Configuration ---
const POPULATION_SIZE = 50;
const PHASE1_GENERATIONS = 50;
const PHASE2_GENERATIONS = 200;
const GAMES_PER_EVAL = 50;
const ELITISM_COUNT = 5;
const MUTATION_RATE = 0.05;
const MUTATION_STRENGTH = 0.15;
const TOTAL_POSSIBLE_POINTS = 445; // Sum of all cards in deck
// --- Simulator ---
class NeuralSimulator {
    pastSelfPool = [];
    // Opponent types: 0: Conservative, 1: Aggressive, 2: MathBot, 3: AdvancedAI, 4: PastSelf
    runGame(neuralWeights, phase) {
        const neuralIdx = Math.floor(Math.random() * NUM_PLAYERS);
        // Select opponent types based on phase
        const opponentTypes = [];
        for (let i = 0; i < NUM_PLAYERS - 1; i++) {
            if (phase === 1) {
                // Phase 1: Mix of Heuristics
                opponentTypes.push(Math.floor(Math.random() * 3)); // 0, 1, or 2
            }
            else {
                // Phase 2: Mix of Heuristics (20%), AdvancedAI (30%), PastSelf (50%)
                const r = Math.random();
                if (r < 0.2)
                    opponentTypes.push(Math.floor(Math.random() * 3));
                else if (r < 0.5)
                    opponentTypes.push(3);
                else if (this.pastSelfPool.length > 0)
                    opponentTypes.push(4);
                else
                    opponentTypes.push(3);
            }
        }
        let state = {
            deck: createDeck(),
            players: Array.from({ length: NUM_PLAYERS }, (_, i) => ({
                id: i,
                name: i === neuralIdx ? 'Neural' : `Opponent-${i}`,
                scorePile: [],
                display: [],
            })),
            discardPile: [],
            activePlayerIndex: 0,
            turnStarted: false,
            pendingSteal: null,
            lastDrawn: null,
            message: "",
            isGameOver: false,
        };
        let turns = 0;
        while (!state.isGameOver && turns < 1000) {
            turns++;
            const activeP = state.players[state.activePlayerIndex];
            let action;
            if (state.activePlayerIndex === neuralIdx) {
                action = NeuralAI.getAction(state, neuralWeights);
            }
            else {
                // Find opponent type
                let oppSlot = state.activePlayerIndex;
                if (oppSlot > neuralIdx)
                    oppSlot--; // Shift back to get opponentTypes index
                const type = opponentTypes[oppSlot];
                switch (type) {
                    case 0:
                        action = HeuristicBots.getConservativeAction(state);
                        break;
                    case 1:
                        action = HeuristicBots.getAggressiveAction(state);
                        break;
                    case 2:
                        action = HeuristicBots.getMathBotAction(state);
                        break;
                    case 3:
                        action = AdvancedAI.getAction(state, DEFAULT_AI_PARAMS);
                        break;
                    case 4:
                        const randomPastWeights = this.pastSelfPool[Math.floor(Math.random() * this.pastSelfPool.length)];
                        action = NeuralAI.getAction(state, randomPastWeights);
                        break;
                    default: action = HeuristicBots.getMathBotAction(state);
                }
            }
            state = this.applyAction(state, action);
        }
        if (!state.isGameOver) {
            state.players.forEach(p => { p.scorePile.push(...p.display); p.display = []; });
        }
        const myScore = calculateTotalScore(state.players[neuralIdx].scorePile);
        let maxOppScore = 0;
        state.players.forEach((p, i) => {
            if (i !== neuralIdx) {
                const s = calculateTotalScore(p.scorePile);
                if (s > maxOppScore)
                    maxOppScore = s;
            }
        });
        const won = myScore > maxOppScore;
        // REWARD FUNCTION: +1/-1 + Margin Bonus
        let reward = won ? 1.0 : -1.0;
        const margin = (myScore - maxOppScore) / TOTAL_POSSIBLE_POINTS;
        reward += margin;
        return { reward, won };
    }
    applyAction(state, action) {
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
            const { card, fromPlayers } = state.pendingSteal;
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
            if (state.deck.length === 0)
                return this.endGame(state);
            return state;
        }
        if (action === 'SKIP_STEAL') {
            player.display.push(state.pendingSteal.card);
            state.pendingSteal = null;
            if (state.deck.length === 0)
                return this.endGame(state);
            return state;
        }
        if (action === 'DRAW') {
            const card = state.deck.pop();
            if (player.display.includes(card) && player.display.length >= 3) {
                state.discardPile.push(...player.display, card);
                player.display = [];
                state.activePlayerIndex = (state.activePlayerIndex + 1) % NUM_PLAYERS;
                state.turnStarted = false;
                if (state.deck.length === 0)
                    return this.endGame(state);
                return state;
            }
            const fromPlayers = [];
            for (let idx = 0; idx < NUM_PLAYERS; idx++) {
                if (idx === state.activePlayerIndex)
                    continue;
                const count = state.players[idx].display.filter(v => v === card).length;
                if (count > 0)
                    fromPlayers.push({ playerId: idx, count });
            }
            if (fromPlayers.length > 0) {
                state.pendingSteal = { card, fromPlayers };
                return state;
            }
            player.display.push(card);
            if (state.deck.length === 0)
                return this.endGame(state);
            return state;
        }
        if (action === 'STAY') {
            state.activePlayerIndex = (state.activePlayerIndex + 1) % NUM_PLAYERS;
            state.turnStarted = false;
            return state;
        }
        return state;
    }
    endGame(state) {
        state.players.forEach(p => { p.scorePile.push(...p.display); p.display = []; });
        state.isGameOver = true;
        return state;
    }
}
// --- GA Operations ---
function createGenome() {
    const nn = new SimpleNN(NEURAL_CONFIG.inputSize, NEURAL_CONFIG.hiddenSize, NEURAL_CONFIG.outputSize);
    return { weights: nn.getFlatWeights(), fitness: 0 };
}
function crossover(g1, g2) {
    const childWeights = [];
    for (let i = 0; i < g1.weights.length; i++) {
        childWeights.push(Math.random() > 0.5 ? g1.weights[i] : g2.weights[i]);
    }
    return { weights: childWeights, fitness: 0 };
}
function mutate(g) {
    const newWeights = [...g.weights];
    for (let i = 0; i < newWeights.length; i++) {
        if (Math.random() < MUTATION_RATE) {
            newWeights[i] += (Math.random() * 2 - 1) * MUTATION_STRENGTH;
        }
    }
    return { weights: newWeights, fitness: 0 };
}
// --- Main Training Loop ---
const sim = new NeuralSimulator();
let population = [];
if (fs.existsSync('best_weights.json')) {
    console.log('Loading best_weights.json for initialization...');
    const bestWeights = JSON.parse(fs.readFileSync('best_weights.json', 'utf8'));
    // Initialize population with best weights and mutations of them
    population.push({ weights: [...bestWeights], fitness: 0 });
    while (population.length < POPULATION_SIZE) {
        population.push(mutate({ weights: [...bestWeights], fitness: 0 }));
    }
}
else {
    population = Array.from({ length: POPULATION_SIZE }, createGenome);
}
async function train() {
    console.log(`Starting Curriculum Training...`);
    for (let phase = 1; phase <= 2; phase++) {
        const gens = phase === 1 ? PHASE1_GENERATIONS : PHASE2_GENERATIONS;
        console.log(`\n--- Starting Phase ${phase}: ${phase === 1 ? 'Heuristic Bootcamp' : 'Self-Play Mastery'} ---`);
        for (let g = 0; g < gens; g++) {
            let genAvgFit = 0;
            let genWins = 0;
            population.forEach(genome => {
                let totalReward = 0;
                let wins = 0;
                for (let i = 0; i < GAMES_PER_EVAL; i++) {
                    const res = sim.runGame(genome.weights, phase);
                    totalReward += res.reward;
                    if (res.won)
                        wins++;
                }
                genome.fitness = totalReward / GAMES_PER_EVAL;
                genAvgFit += genome.fitness;
                genWins += wins;
            });
            population.sort((a, b) => b.fitness - a.fitness);
            if (g % 5 === 0 || g === gens - 1) {
                const winRate = (genWins / (POPULATION_SIZE * GAMES_PER_EVAL)) * 100;
                console.log(`Phase ${phase} Gen ${g}: Best Fit ${population[0].fitness.toFixed(3)} | Avg Fit ${(genAvgFit / POPULATION_SIZE).toFixed(3)} | Win Rate ${winRate.toFixed(1)}%`);
                console.log(`WEIGHTS:${JSON.stringify(population[0].weights)}`);
                // Save to file for persistence
                fs.writeFileSync('best_weights.json', JSON.stringify(population[0].weights));
                // Save checkpoint to past self pool every 10 gens in Phase 2
                if (phase === 2 && g % 10 === 0) {
                    sim.pastSelfPool.push([...population[0].weights]);
                    if (sim.pastSelfPool.length > 20)
                        sim.pastSelfPool.shift(); // Keep last 20
                }
            }
            // Evolution
            const nextPop = [];
            for (let i = 0; i < ELITISM_COUNT; i++)
                nextPop.push({ weights: [...population[i].weights], fitness: 0 });
            while (nextPop.length < POPULATION_SIZE) {
                const t1 = population[Math.floor(Math.random() * (POPULATION_SIZE / 2))];
                const t2 = population[Math.floor(Math.random() * (POPULATION_SIZE / 2))];
                nextPop.push(mutate(crossover(t1, t2)));
            }
            population = nextPop;
        }
    }
    console.log("\nTraining Complete.");
    console.log(`WEIGHTS:${JSON.stringify(population[0].weights)}`);
}
train();
