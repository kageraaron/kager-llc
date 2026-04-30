import React, { useState, useCallback, useEffect, useMemo } from 'react';
import './App.css';
import cardColorsRaw from './src/img/colors.json';
import { cardImages } from './src/img';
import { 
  AdvancedAI, 
  NeuralAI,
  GameState, 
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

// --- Sub-components ---

function GameSetup({ onStart }: { onStart: (numHumans: number, numAIs: number, names: string[]) => void }) {
  const [numHumans, setNumHumans] = useState(1);
  const [numAIs, setNumAIs] = useState(3);
  const [names, setNames] = useState<string[]>(['You']);

  const handleNumHumansChange = (val: number) => {
    setNumHumans(val);
    const newNames = [...names];
    if (val > names.length) {
      for (let i = names.length; i < val; i++) {
        newNames.push(`Player ${i + 1}`);
      }
    } else {
      newNames.splice(val);
    }
    setNames(newNames);
    
    // Adjust AIs to keep total <= 5
    if (val + numAIs > 5) {
      setNumAIs(5 - val);
    }
  };

  const handleNameChange = (idx: number, name: string) => {
    const newNames = [...names];
    newNames[idx] = name;
    setNames(newNames);
  };

  return (
    <div className="setup-container">
      <h2>Game Setup</h2>
      <div className="setup-field">
        <label>Human Players (1-5):</label>
        <select value={numHumans} onChange={(e) => handleNumHumansChange(parseInt(e.target.value))}>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      
      <div className="setup-names">
        {names.map((name, i) => (
          <div key={i} className="setup-field">
            <label>Human {i + 1} Name:</label>
            <input type="text" value={name} onChange={(e) => handleNameChange(i, e.target.value)} />
          </div>
        ))}
      </div>

      <div className="setup-field">
        <label>AI Players (0-{5 - numHumans}):</label>
        <select value={numAIs} onChange={(e) => setNumAIs(parseInt(e.target.value))}>
          {Array.from({ length: 6 - numHumans }, (_, i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </div>

      <button className="btn-start" onClick={() => onStart(numHumans, numAIs, names)} disabled={numHumans + numAIs < 2}>
        Start Fruit Fight
      </button>
      {numHumans + numAIs < 2 && <p className="error-text">Need at least 2 players total.</p>}
    </div>
  );
}

// --- Main Component ---
export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => ({
    stage: 'setup',
    deck: [],
    players: [],
    activePlayerIndex: 0,
    turnStarted: false,
    pendingSteal: null,
    lastDrawn: null,
    message: "Welcome to Fruit Fight!",
    discardPile: [],
    isGameOver: false,
  }));

  const [scoreAnimation, setScoreAnimation] = useState<{ playerId: number, amount: number } | null>(null);
  const [bustAnimation, setBustAnimation] = useState<{ playerId: number } | null>(null);
  const [aiPersonalities, setAiPersonalities] = useState<AIParameters[]>([]);
  const [showHints, setShowHints] = useState(false);

  const startGame = useCallback((numHumans: number, numAIs: number, humanNames: string[]) => {
    const players = [];
    // Add Humans
    for (let i = 0; i < numHumans; i++) {
      players.push({
        id: i,
        name: humanNames[i],
        scorePile: [],
        display: [],
        isAI: false,
      });
    }
    // Add AIs
    for (let i = 0; i < numAIs; i++) {
      players.push({
        id: numHumans + i,
        name: `AI-${i + 1}`,
        scorePile: [],
        display: [],
        isAI: true,
      });
    }

    const personalities = players.map((p, i) => 
      p.isAI ? getAIPersonality(DEFAULT_AI_PARAMS, i) : DEFAULT_AI_PARAMS
    );
    setAiPersonalities(personalities);

    setGameState({
      stage: 'playing',
      deck: createDeck(),
      players,
      activePlayerIndex: 0,
      turnStarted: false,
      pendingSteal: null,
      lastDrawn: null,
      message: `Game Start! ${players[0].name}'s turn.`,
      discardPile: [],
      isGameOver: false,
    });
  }, []);

  const resetGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      stage: 'setup',
      isGameOver: false,
    }));
  }, []);

  const endTurn = useCallback(() => {
    setGameState(prev => {
      if (prev.isGameOver) return prev;
      const nextPlayerIndex = (prev.activePlayerIndex + 1) % prev.players.length;
      return {
        ...prev,
        activePlayerIndex: nextPlayerIndex,
        turnStarted: false,
        pendingSteal: null,
        lastDrawn: null,
        message: `${prev.players[nextPlayerIndex].name}'s turn.`,
      };
    });
  }, []);
  
  const startTurn = useCallback(() => {
    setGameState(prev => {
      if (prev.turnStarted) return prev;

      const activePlayer = prev.players[prev.activePlayerIndex];
      let message = `${activePlayer.name}'s turn.`;
      
      if (activePlayer.display.length > 0) {
        const scoreGained = calculateTotalScore(activePlayer.display);
        
        setScoreAnimation({ playerId: activePlayer.id, amount: scoreGained });
        setTimeout(() => setScoreAnimation(null), 2000);

        message = `${activePlayer.name} scored ${scoreGained} points from their hand!`;
        
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

      const isBust = activePlayer.display.length >= 3 && activePlayer.display.includes(card);
      
      if (isBust) {
        const bustDisplay = [...activePlayer.display, card];
        const nextPlayers = prev.players.map((p, index) => {
          if (index === prev.activePlayerIndex) return { ...p, display: [] };
          return p;
        });
        
        const nextIndex = (prev.activePlayerIndex + 1) % prev.players.length;
        
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
          message: `${activePlayer.name} busted with a ${card}! ${prev.players[nextIndex].name}'s turn.`,
        };
      }

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

      const nextPlayers = prev.players.map((p, index) => {
        if (index === prev.activePlayerIndex) return { ...p, display: [...p.display, card] };
        return p;
      });

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

      const finalPlayers = nextPlayers.map((p, index) => {
        if (index === prev.activePlayerIndex) {
          return { ...p, display: activePlayerNewDisplay };
        }
        return p;
      });

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

  // AI logic
  useEffect(() => {
    if (gameState.stage !== 'playing' || gameState.isGameOver) return;
    
    const activePlayer = gameState.players[gameState.activePlayerIndex];
    if (!activePlayer || !(activePlayer as any).isAI) return;

    const timer = setTimeout(() => {
       let action: string;
       if (TRAINED_WEIGHTS.length > 0 && gameState.players.length === 4) {
          action = NeuralAI.getAction(gameState, TRAINED_WEIGHTS);
       } else {
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
  }, [gameState, aiPersonalities, startTurn, confirmSteal, declineSteal, drawCard, endTurn]);

  const deckDistribution = useMemo(() => {
    if (gameState.stage !== 'playing') return {};
    const dist: Record<number, number> = { ...CARD_COUNTS };
    gameState.players.forEach(p => {
      p.scorePile.forEach(c => dist[c]--);
      p.display.forEach(c => dist[c]--);
    });
    gameState.discardPile.forEach(c => dist[c]--);
    return dist;
  }, [gameState.players, gameState.discardPile, gameState.stage]);

  const currentEV = useMemo(() => {
    if (gameState.stage !== 'playing' || gameState.isGameOver) return null;
    return AdvancedAI.getEVDetails(gameState, aiPersonalities[gameState.activePlayerIndex]);
  }, [gameState, aiPersonalities]);

  const winner = useMemo(() => {
    if (!gameState.isGameOver) return null;
    return [...gameState.players].sort((a, b) => calculateTotalScore(b.scorePile) - calculateTotalScore(a.scorePile))[0];
  }, [gameState.isGameOver, gameState.players]);

  if (gameState.stage === 'setup') {
    return <div className="game-container"><GameSetup onStart={startGame} /></div>;
  }

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
                  <div className="histo-count">{deckDistribution[v as keyof typeof deckDistribution]}</div>
                  <div className="histo-bar-wrapper">
                    <div
                      className="histo-bar"
                      style={{
                        height: `${((deckDistribution[v as keyof typeof deckDistribution] || 0) / 11) * 100}%`,
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
               {!(gameState.players[gameState.activePlayerIndex] as any).isAI ? (
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
                  <div style={{ fontStyle: 'italic', color: '#ccc' }}>Waiting for {gameState.players[gameState.activePlayerIndex].name}...</div>
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
                <h3>{p.name} {(p as any).isAI ? '(AI)' : ''}</h3>
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
                    
                    let borderColor = cardColors[c.toString()] || '#ddd';
                    if (gameState.pendingSteal) {
                      if (!isBeingStolen && !(gameState.pendingSteal.card === c && idx === gameState.activePlayerIndex)) {
                        borderColor = '#ddd';
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
    </div>
  );
}
