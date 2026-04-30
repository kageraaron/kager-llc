import React, { useState, useCallback, useEffect, useMemo } from 'react';
import './App.css';
import cardColorsRaw from './src/img/colors.json';
import { cardImages } from './src/img';
import { 
  AdvancedAI, 
  NeuralAI,
  GameState, 
  NUM_PLAYERS, 
  PLAYER_NAMES, 
  createDeck, 
  calculateTotalScore,
  getAIPersonality,
  DEFAULT_AI_PARAMS,
  shuffleArray,
  AIParameters,
  CARD_COUNTS,
  CARD_VALUES
} from './gameEngine';
import { TRAINED_WEIGHTS } from './trainedModel_';

const cardColors: Record<string, string> = cardColorsRaw;

// --- Component ---
export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => ({
    deck: createDeck(),
    players: Array.from({ length: NUM_PLAYERS }, (_, i) => ({
      id: i,
      name: i === 0 ? PLAYER_NAMES[0] : (TRAINED_WEIGHTS.length > 0 ? `Neural-${i}` : PLAYER_NAMES[i]),
      scorePile: [],
      display: [],
    })),
    activePlayerIndex: 0,
    turnStarted: false,
    pendingSteal: null,
    lastDrawn: null,
    message: "Game Start! Your turn.",
    discardPile: [],
    isGameOver: false,
  }));

  const [scoreAnimation, setScoreAnimation] = useState<{ playerId: number, amount: number } | null>(null);
  const [bustAnimation, setBustAnimation] = useState<{ playerId: number } | null>(null);

  const [aiPersonalities] = useState<AIParameters[]>(() => [
    DEFAULT_AI_PARAMS, // Human (for hints)
    getAIPersonality(DEFAULT_AI_PARAMS, 1),
    getAIPersonality(DEFAULT_AI_PARAMS, 2),
    getAIPersonality(DEFAULT_AI_PARAMS, 3),
  ]);

  const [showHints, setShowHints] = useState(false);

  // --- Game Actions ---

  const resetGame = useCallback(() => {
    setGameState({
      deck: createDeck(),
      players: Array.from({ length: NUM_PLAYERS }, (_, i) => ({
        id: i,
        name: i === 0 ? PLAYER_NAMES[0] : (TRAINED_WEIGHTS.length > 0 ? `Neural-${i}` : PLAYER_NAMES[i]),
        scorePile: [],
        display: [],
      })),
      activePlayerIndex: 0,
      turnStarted: false,
      pendingSteal: null,
      lastDrawn: null,
      message: "Game Start! Your turn.",
      discardPile: [],
      isGameOver: false,
    });
  }, []);

  const endTurn = useCallback(() => {
    setGameState(prev => {
      if (prev.isGameOver) return prev;
      const nextPlayerIndex = (prev.activePlayerIndex + 1) % NUM_PLAYERS;
      return {
        ...prev,
        activePlayerIndex: nextPlayerIndex,
        turnStarted: false,
        pendingSteal: null,
        lastDrawn: null,
        message: `${PLAYER_NAMES[nextPlayerIndex]}'s turn.`,
      };
    });
  }, []);
  
  const startTurn = useCallback(() => {
    setGameState(prev => {
      if (prev.turnStarted) return prev;

      const activePlayer = prev.players[prev.activePlayerIndex];
      let message = `${activePlayer.name}'s turn.`;
      
      // Score the player's display from the previous round
      if (activePlayer.display.length > 0) {
        const scoreGained = calculateTotalScore(activePlayer.display);
        
        // Trigger Score Animation
        setScoreAnimation({ playerId: activePlayer.id, amount: scoreGained });
        setTimeout(() => setScoreAnimation(null), 2000);

        message = activePlayer.name === 'You'
          ? `You scored ${scoreGained} points from your hand!`
          : `${activePlayer.name} scored ${scoreGained} points from their hand!`;
        
        const nextPlayers = prev.players.map((p, index) => {
          if (index === prev.activePlayerIndex) {
            return {
              ...p,
              scorePile: [...p.scorePile, ...p.display],
              display: [],
            };
          }
          return p;
        });

        return {
          ...prev,
          players: nextPlayers,
          turnStarted: true,
          message,
          lastDrawn: null,
        };
      }
      
      return { ...prev, turnStarted: true, message, lastDrawn: null };
    });
  }, []);

  const drawCard = useCallback(() => {
    setGameState(prev => {
      if (prev.deck.length === 0 || prev.isGameOver) return prev;

      const newDeck = [...prev.deck];
      const card = newDeck.pop()!;
      const activePlayer = prev.players[prev.activePlayerIndex];
      
      let message = `${activePlayer.name} drew a ${card}.`;

      // 1. Check for Bust FIRST
      // Rule: "Once they have at least 3 cards in their hand, the next time they draw a card of a value they already have, they bust."
      const isBust = activePlayer.display.length >= 3 && activePlayer.display.includes(card);
      
      if (isBust) {
        const bustDisplay = [...activePlayer.display, card];
        const nextPlayers = prev.players.map((p, index) => {
          if (index === prev.activePlayerIndex) return { ...p, display: [] };
          return p;
        });
        
        const nextIndex = (prev.activePlayerIndex + 1) % NUM_PLAYERS;
        
        setBustAnimation({ playerId: activePlayer.id });
        setTimeout(() => setBustAnimation(null), 1500);

        return {
          ...prev,
          deck: newDeck,
          players: nextPlayers,
          activePlayerIndex: nextIndex,
          turnStarted: false,
          pendingSteal: null,
          lastDrawn: null,
          discardPile: [...prev.discardPile, ...bustDisplay],
          message: `${activePlayer.name} busted with a ${card}! ${PLAYER_NAMES[nextIndex]}'s turn.`,
        };
      }

      // 2. Check for Steal opportunities (Only if NO bust)
      const stealablePlayers = prev.players.filter((p, i) => i !== prev.activePlayerIndex && p.display.some(c => c === card));

      if (stealablePlayers.length > 0) {
        return {
          ...prev,
          deck: newDeck,
          lastDrawn: card,
          pendingSteal: {
            card,
            fromPlayers: stealablePlayers.map(p => ({
              playerId: p.id,
              count: p.display.filter(c => c === card).length
            }))
          },
          message: `${activePlayer.name}, do you want to steal ${card}s?`
        };
      }

      // 3. Normal draw
      const nextPlayers = prev.players.map((p, index) => {
        if (index === prev.activePlayerIndex) return { ...p, display: [...p.display, card] };
        return p;
      });

      // Check for game end
      if (newDeck.length === 0) {
        const finalPlayers = nextPlayers.map(p => ({
          ...p,
          scorePile: [...p.scorePile, ...p.display],
          display: [],
        }));
        return {
          ...prev,
          deck: newDeck,
          players: finalPlayers,
          lastDrawn: card,
          isGameOver: true,
          message: message + " Deck exhausted! Game Over.",
        };
      }

      return {
        ...prev,
        deck: newDeck,
        players: nextPlayers,
        lastDrawn: card,
        message,
      };
    });
  }, []);

  const confirmSteal = useCallback(() => {
    setGameState(prev => {
      if (!prev.pendingSteal) return prev;
      const { card, fromPlayers } = prev.pendingSteal;
      
      let stolenCount = 0;
      let activePlayerNewDisplay: number[] = [...prev.players[prev.activePlayerIndex].display, card];

      const nextPlayers = prev.players.map((p, index) => {
        const isVictim = fromPlayers.find(fp => fp.playerId === p.id);
        if (isVictim) {
          const cardsToSteal = p.display.filter(c => c === card);
          stolenCount += cardsToSteal.length;
          activePlayerNewDisplay.push(...cardsToSteal);
          return { ...p, display: p.display.filter(c => c !== card) };
        }
        return p;
      });

      // Update active player's display
      const finalPlayers = nextPlayers.map((p, index) => {
        if (index === prev.activePlayerIndex) {
          return { ...p, display: activePlayerNewDisplay };
        }
        return p;
      });

      // Check for game end if deck is empty
      if (prev.deck.length === 0) {
        const gameEndPlayers = finalPlayers.map(p => ({
          ...p,
          scorePile: [...p.scorePile, ...p.display],
          display: [],
        }));
        return {
          ...prev,
          players: gameEndPlayers,
          pendingSteal: null,
          isGameOver: true,
          message: `${prev.players[prev.activePlayerIndex].name} stole ${stolenCount} card(s)! Deck exhausted! Game Over.`
        };
      }

      return {
        ...prev,
        players: finalPlayers,
        pendingSteal: null,
        message: `${prev.players[prev.activePlayerIndex].name} stole ${stolenCount} card(s)!`
      };
    });
  }, []);

  const declineSteal = useCallback(() => {
    setGameState(prev => {
      if (!prev.pendingSteal) return prev;
      const { card } = prev.pendingSteal;

      const nextPlayers = prev.players.map((p, index) => {
        if (index === prev.activePlayerIndex) {
          return { ...p, display: [...p.display, card] };
        }
        return p;
      });
      
      // Check for game end if deck is empty
      if (prev.deck.length === 0) {
        const gameEndPlayers = nextPlayers.map(p => ({
          ...p,
          scorePile: [...p.scorePile, ...p.display],
          display: [],
        }));
        return {
          ...prev,
          players: gameEndPlayers,
          pendingSteal: null,
          isGameOver: true,
          message: `${prev.players[prev.activePlayerIndex].name} declined to steal. Deck exhausted! Game Over.`
        };
      }

      return {
        ...prev,
        players: nextPlayers,
        pendingSteal: null,
        message: `${prev.players[prev.activePlayerIndex].name} declined to steal.`
      };
    });
  }, []);


  // --- AI Player Logic ---
  useEffect(() => {
    if (gameState.isGameOver || gameState.activePlayerIndex === 0) return;

    // Use a specific AI personality for the current CPU player
    const personality = aiPersonalities[gameState.activePlayerIndex];

    if (gameState.activePlayerIndex !== 0) {
      const timer = setTimeout(() => {
         let action: string;
         // Use Neural AI for players 1, 2, 3 if weights are loaded
         if (TRAINED_WEIGHTS.length > 0) {
            action = NeuralAI.getAction(gameState, TRAINED_WEIGHTS);
         } else {
            // Fallback to advanced heuristic AI
            action = AdvancedAI.getAction(gameState, aiPersonalities[gameState.activePlayerIndex]);
         }

         switch (action) {
           case 'START_TURN': startTurn(); break;
           case 'STEAL': confirmSteal(); break;
           case 'SKIP_STEAL': declineSteal(); break;
           case 'HIT': drawCard(); break;
           case 'STAND': endTurn(); break;
         }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [gameState.activePlayerIndex, gameState.turnStarted, gameState.pendingSteal, gameState.isGameOver, startTurn, confirmSteal, declineSteal, drawCard, endTurn, gameState, aiPersonalities]);

  const deckDistribution = useMemo(() => {
    const dist: Record<number, number> = { ...CARD_COUNTS };
    gameState.players.forEach(p => {
      p.scorePile.forEach(c => dist[c]--);
      p.display.forEach(c => dist[c]--);
    });
    gameState.discardPile.forEach(c => dist[c]--);
    return dist;
  }, [gameState.players, gameState.discardPile]);

  const currentEV = useMemo(() => {
    if (gameState.isGameOver) return null;
    return AdvancedAI.getEVDetails(gameState, aiPersonalities[gameState.activePlayerIndex]);
  }, [gameState, aiPersonalities]);

  const winner = useMemo(() => {
    if (!gameState.isGameOver) return null;
    return [...gameState.players].sort((a, b) => calculateTotalScore(b.scorePile) - calculateTotalScore(a.scorePile))[0];
  }, [gameState.isGameOver, gameState.players]);

  // --- Render ---

  return (
    <div className="game-container">
      <header>
        <div className="header-left">
          <h1>Fruit Fight</h1>
          <button className="btn-hint-toggle" onClick={() => setShowHints(!showHints)}>
            {showHints ? 'Hide Hints' : 'Show Hints'}
          </button>
        </div>
        <div className="deck-info">Cards in Deck: {gameState.deck.length}</div>
      </header>

      {showHints && (
        <div className="hints-panel" style={{ gridTemplateColumns: '1fr' }}>
          <div className="deck-dist">
            <h4>Deck Distribution</h4>
            <div className="dist-histogram">
              {CARD_VALUES.map(v => (
                <div key={v} className="histo-column">
                  <div className="histo-count">{deckDistribution[v]}</div>
                  <div className="histo-bar-wrapper">
                    <div
                      className="histo-bar"
                      style={{
                        height: `${(deckDistribution[v] / 11) * 100}%`,
                        backgroundColor: cardColors[v.toString()] || '#ccc'
                      }}
                    ></div>
                  </div>
                  <div className="histo-val">#{v}</div>
                </div>
              ))}
            </div>
            {currentEV && (
              <div className="bust-prob-info" style={{ marginTop: '15px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8em', color: '#7f8c8d', textTransform: 'uppercase' }}>Bust Probability</span>
                <div style={{ fontSize: '1.8em', fontWeight: 'bold', color: '#e74c3c' }}>
                  {(currentEV.bustProb * 100).toFixed(1)}%
                </div>
                <div style={{ marginTop: '10px' }}>
                  <span style={{ fontSize: '0.8em', color: '#7f8c8d', textTransform: 'uppercase' }}>AI Recommendation</span>
                  <div style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#2ecc71' }}>
                    {NeuralAI.getAction(gameState, TRAINED_WEIGHTS)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="action-zone">
          <div className="game-message">{gameState.message}</div>
          
          <div className="drawn-card-display">
            {gameState.pendingSteal ? (
              <div className="pending-steal-view">
                <div className="card-group">
                  <div className="card-label">Drawn:</div>
                  <div className="card" style={{ borderColor: cardColors[gameState.pendingSteal.card.toString()] || '#ddd' }}>
                    <img src={cardImages[gameState.pendingSteal.card]} alt="Drawn card" />
                  </div>
                </div>
                <div className="steal-arrow">→</div>
                <div className="card-group">
                  <div className="card-label">Stealing:</div>
                  <div className="stolen-cards-preview">
                    {Array.from({ length: gameState.pendingSteal.fromPlayers.reduce((acc, p) => acc + p.count, 0) }).map((_, i) => (
                      <div key={i} className="card mini" style={{ borderColor: cardColors[gameState.pendingSteal?.card.toString() || ''] || '#ddd' }}>
                        <img src={cardImages[gameState.pendingSteal?.card!]} alt="Stolen card" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : gameState.lastDrawn && gameState.turnStarted && (
              <div className="last-drawn-view">
                <div className="card-label">Drawn:</div>
                <div className="card" style={{ borderColor: cardColors[gameState.lastDrawn.toString()] || '#ddd' }}>
                  <img src={cardImages[gameState.lastDrawn]} alt="Last drawn card" />
                </div>
              </div>
            )}
          </div>
          
          {!gameState.isGameOver && (
            <div className="play-controls">
               {gameState.activePlayerIndex === 0 ? (
                  <>
                    {gameState.pendingSteal ? (
                        <div className='main-btns'>
                            <button onClick={confirmSteal}>Steal</button>
                            <button onClick={declineSteal} className='btn-decline'>Decline</button>
                        </div>
                    ) : (
                        <div className='main-btns'>
                           <button onClick={drawCard} disabled={!gameState.turnStarted}>Hit</button>
                           <button onClick={endTurn} disabled={!gameState.turnStarted}>Stand</button>
                        </div>
                    )}
                    {!gameState.turnStarted && <button onClick={startTurn}>Start Turn</button>}
                  </>
               ) : (
                  <div style={{ fontStyle: 'italic', color: '#ccc' }}>Waiting for AI...</div>
               )}
            </div>
          )}
          
          {gameState.isGameOver && (
            <div className="game-over">
              <h2>Winner: {winner?.name}!</h2>
              <button onClick={resetGame}>New Game</button>
            </div>
          )}
      </div>

      <div className="player-grid">
        {gameState.players.map((p, idx) => (
            <div key={p.id} className={`player-card ${idx === gameState.activePlayerIndex ? 'active' : ''}`}>
            <div className='player-header'>
                <h3>{p.name}</h3>
                <div className="score-container">
                    <span className="score">Score: {calculateTotalScore(p.scorePile)}</span>
                    {scoreAnimation?.playerId === p.id && (
                        <div className="score-popup">+{scoreAnimation.amount}</div>
                    )}
                    {bustAnimation?.playerId === p.id && (
                        <div className="bust-popup">BUST!</div>
                    )}
                </div>
            </div>
            <div className="display-area">
                {p.display.length === 0 && <div className="empty-display">Empty hand</div>}
                {p.display.map((c, i) => {
                    const isBeingStolen = gameState.pendingSteal && 
                                          gameState.pendingSteal.card === c && 
                                          idx !== gameState.activePlayerIndex;
                    
                    // Logic: If there is a pending steal, only the cards being stolen get their special color.
                    // Otherwise (normal play), all cards get their special color.
                    let borderColor = cardColors[c.toString()] || '#ddd';
                    if (gameState.pendingSteal) {
                      if (!isBeingStolen && !(gameState.pendingSteal.card === c && idx === gameState.activePlayerIndex)) {
                        borderColor = '#ddd'; // Fade out other cards
                      }
                    }

                    return (
                        <div key={i} className={`card ${isBeingStolen ? 'being-stolen' : ''}`} style={{ borderColor }}>
                            <img src={cardImages[c]} alt={`Card value ${c}`} />
                        </div>
                    );
                })}
            </div>
            </div>
        ))}
      </div>

      {showHints && (
        <div className="glossary-section">
            <h3>Strategy Glossary</h3>
            <div className="glossary-grid">
                <div className="glossary-item">
                    <h4>Deck Distribution</h4>
                    <p>The number of cards remaining for each card value in the deck.</p>
                </div>
                <div className="glossary-item">
                    <h4>Bust Probability</h4>
                    <p>The chance of drawing a card you already have in your display (when you have 3 or more cards), which would cause you to lose all cards in your display.</p>
                </div>
                
                <div className="glossary-item">
                    <h4>AI Recommendation</h4>
                    <p>The recommended action based on the AI's analysis of the current game state. The AI is a neural network, trained over thousands of games against rules-based opponents and checkpoints of itself. It's input is the entire game state, including deck distribution (card counting), player hands, and other relevant information.</p>
                </div>

            </div>
        </div>
      )}

    </div>
  );
}
console.log("cardColorsRaw after import:", cardColorsRaw);
console.log("cardColors after assignment:", cardColors);