import { useState, useEffect } from 'react';

interface Player {
  name: string;
  totalScore: number;
}

interface PlayerRoundData {
  bid: number;
  tricks: number;
  piratesCapture: number;
  skullKingCapture: boolean;
}

interface RoundScore extends PlayerRoundData {
  score: number;
}

interface GameHistoryEntry {
  round: number;
  scores: Record<number, RoundScore>;
}

interface PhaseSnapshot {
  roundData: Record<number, PlayerRoundData>;
  players: Player[];
  currentRound: number;
  roundPhase: RoundPhase;
  gameHistory: GameHistoryEntry[];
}

type RoundPhase = 'bidding' | 'scoring' | 'complete';

function usePersistedState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(`skullking_${key}`);
    return stored ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(`skullking_${key}`, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

interface NumberStepperProps {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  min?: number;
  max?: number;
  label?: string;
}

const NumberStepper = ({ value, onDecrement, onIncrement, min = 0, max = 10, label }: NumberStepperProps) => (
  <div style={styles.stepper}>
    {label && <span style={styles.stepperLabel}>{label}</span>}
    <div style={styles.stepperControls}>
      <button
        style={{...styles.stepperBtn, opacity: value <= min ? 0.3 : 1}}
        onClick={onDecrement}
        disabled={value <= min}
      >
        −
      </button>
      <span style={styles.stepperValue}>{value}</span>
      <button
        style={{...styles.stepperBtn, opacity: value >= max ? 0.3 : 1}}
        onClick={onIncrement}
        disabled={value >= max}
      >
        +
      </button>
    </div>
  </div>
);

const SkullKingScorer = () => {
  const [gameStarted, setGameStarted] = usePersistedState('gameStarted', false);
  const [players, setPlayers] = usePersistedState<Player[]>('players', []);
  const [playerName, setPlayerName] = useState('');
  const [currentRound, setCurrentRound] = usePersistedState('currentRound', 1);
  const [roundPhase, setRoundPhase] = usePersistedState<RoundPhase>('roundPhase', 'bidding');
  const [roundData, setRoundData] = usePersistedState<Record<number, PlayerRoundData>>('roundData', {});
  const [gameHistory, setGameHistory] = usePersistedState<GameHistoryEntry[]>('gameHistory', []);
  const [phaseHistory, setPhaseHistory] = usePersistedState<PhaseSnapshot[]>('phaseHistory', []);
  const [showHistory, setShowHistory] = useState(false);
  const [editingBid, setEditingBid] = useState<number | null>(null);

  const addPlayer = () => {
    if (playerName.trim() && players.length < 6) {
      setPlayers([...players, { name: playerName.trim(), totalScore: 0 }]);
      setPlayerName('');
    }
  };

  const removePlayer = (index: number) => {
    setPlayers(players.filter((_, i) => i !== index));
  };

  const savePhaseSnapshot = () => {
    const snapshot: PhaseSnapshot = {
      roundData: Object.fromEntries(
        Object.entries(roundData).map(([k, v]) => [k, { ...v }])
      ),
      players: players.map(p => ({ ...p })),
      currentRound,
      roundPhase,
      gameHistory: gameHistory.map(entry => ({
        ...entry,
        scores: Object.fromEntries(
          Object.entries(entry.scores).map(([k, v]) => [k, { ...v }])
        )
      }))
    };
    const newHistory = [...phaseHistory, snapshot];
    // Keep only last 20 snapshots to prevent unbounded growth
    if (newHistory.length > 20) {
      newHistory.shift();
    }
    setPhaseHistory(newHistory);
  };

  const performUndo = () => {
    if (phaseHistory.length === 0) return;

    const newHistory = [...phaseHistory];
    const snapshot = newHistory.pop()!;
    setPhaseHistory(newHistory);

    // Deep clone when restoring to prevent mutation of snapshot
    setRoundData(
      Object.fromEntries(
        Object.entries(snapshot.roundData).map(([k, v]) => [k, { ...v }])
      )
    );
    setPlayers(snapshot.players.map(p => ({ ...p })));
    setCurrentRound(snapshot.currentRound);
    setRoundPhase(snapshot.roundPhase);
    setGameHistory(
      snapshot.gameHistory.map(entry => ({
        ...entry,
        scores: Object.fromEntries(
          Object.entries(entry.scores).map(([k, v]) => [k, { ...v }])
        )
      }))
    );

    // Exit history view after undo to show the restored game state
    setShowHistory(false);
    setEditingBid(null);
  };

  const startGame = () => {
    if (players.length >= 2) {
      const initialRoundData: Record<number, PlayerRoundData> = {};
      players.forEach((_, i) => {
        initialRoundData[i] = { bid: 0, tricks: 0, piratesCapture: 0, skullKingCapture: false };
      });
      setRoundData(initialRoundData);
      setGameStarted(true);
      setPhaseHistory([]);
      // Reset UI navigation states
      setShowHistory(false);
      setEditingBid(null);
    }
  };

  const setBid = (playerIndex: number, value: number) => {
    setRoundData(prev => ({
      ...prev,
      [playerIndex]: { ...prev[playerIndex], bid: value }
    }));
  };

  const updateTricks = (playerIndex: number, delta: number) => {
    setRoundData(prev => ({
      ...prev,
      [playerIndex]: {
        ...prev[playerIndex],
        tricks: Math.max(0, Math.min(currentRound, prev[playerIndex].tricks + delta))
      }
    }));
  };

  const updatePiratesCapture = (playerIndex: number, delta: number) => {
    setRoundData(prev => ({
      ...prev,
      [playerIndex]: {
        ...prev[playerIndex],
        piratesCapture: Math.max(0, Math.min(5, prev[playerIndex].piratesCapture + delta))
      }
    }));
  };

  const toggleSkullKingCapture = (playerIndex: number) => {
    setRoundData(prev => ({
      ...prev,
      [playerIndex]: {
        ...prev[playerIndex],
        skullKingCapture: !prev[playerIndex].skullKingCapture
      }
    }));
  };

  const calculateScore = (data: PlayerRoundData): number => {
    const { bid, tricks, piratesCapture, skullKingCapture } = data;

    if (bid === 0) {
      // No-tricks bid
      if (tricks === 0) {
        return currentRound * 10;
      } else {
        return -(currentRound * 10);
      }
    } else {
      // Normal bid
      if (bid === tricks) {
        let score = tricks * 20;
        score += piratesCapture * 30;
        if (skullKingCapture) score += 50;
        return score;
      } else {
        return -Math.abs(bid - tricks) * 10;
      }
    }
  };

  const confirmBids = () => {
    savePhaseSnapshot();
    setRoundPhase('scoring');
    setEditingBid(null);
  };

  const finishRound = () => {
    const roundScores: Record<number, RoundScore> = {};

    // Check if this round already exists in history (can happen after undo)
    const existingRoundIndex = gameHistory.findIndex(entry => entry.round === currentRound);

    const updatedPlayers = players.map((player, i) => {
      const score = calculateScore(roundData[i]);
      roundScores[i] = { ...roundData[i], score };

      // Recalculate total from scratch to handle undo scenarios correctly
      // Sum all previous rounds (excluding current if it exists) + current round
      const previousRounds = existingRoundIndex >= 0
        ? [...gameHistory.slice(0, existingRoundIndex), ...gameHistory.slice(existingRoundIndex + 1)]
        : gameHistory;

      const previousTotal = previousRounds.reduce((sum, entry) => sum + entry.scores[i].score, 0);
      const total = previousTotal + score;

      return { ...player, totalScore: total };
    });

    // Replace existing round or append new round
    const updatedHistory = existingRoundIndex >= 0
      ? [
          ...gameHistory.slice(0, existingRoundIndex),
          { round: currentRound, scores: roundScores },
          ...gameHistory.slice(existingRoundIndex + 1)
        ]
      : [...gameHistory, { round: currentRound, scores: roundScores }];

    setGameHistory(updatedHistory);
    setPlayers(updatedPlayers);

    if (currentRound < 10) {
      // Save snapshot with updated values BEFORE moving to next round
      const snapshot: PhaseSnapshot = {
        roundData: Object.fromEntries(
          Object.entries(roundData).map(([k, v]) => [k, { ...v }])
        ),
        players: updatedPlayers.map(p => ({ ...p })),
        currentRound,
        roundPhase: 'scoring',
        gameHistory: updatedHistory.map(entry => ({
          ...entry,
          scores: Object.fromEntries(
            Object.entries(entry.scores).map(([k, v]) => [k, { ...v }])
          )
        }))
      };
      const newPhaseHistory = [...phaseHistory, snapshot];
      if (newPhaseHistory.length > 20) {
        newPhaseHistory.shift();
      }
      setPhaseHistory(newPhaseHistory);

      const newRoundData: Record<number, PlayerRoundData> = {};
      updatedPlayers.forEach((_, i) => {
        newRoundData[i] = { bid: 0, tricks: 0, piratesCapture: 0, skullKingCapture: false };
      });
      setRoundData(newRoundData);
      setCurrentRound(currentRound + 1);
      setRoundPhase('bidding');
    } else {
      setRoundPhase('complete');
      // Reset UI navigation states when game ends
      setShowHistory(false);
      setEditingBid(null);
    }
  };

  const resetGame = () => {
    setPlayers(players.map(p => ({ ...p, totalScore: 0 })));
    setGameStarted(false);
    setCurrentRound(1);
    setRoundPhase('bidding');
    setRoundData({});
    setGameHistory([]);
    setPhaseHistory([]);
    // Reset UI navigation states
    setShowHistory(false);
    setEditingBid(null);
  };

  const clearPlayers = () => {
    if (window.confirm('Remove all players?')) {
      setPlayers([]);
    }
  };

  const endGameEarly = () => {
    if (window.confirm('End the game now? Current scores will be final.')) {
      setRoundPhase('complete');
      // Reset UI navigation states when ending game
      setShowHistory(false);
      setEditingBid(null);
    }
  };

  // Setup Screen
  if (!gameStarted) {
    return (
      <>
        <div style={styles.fixedBackground}></div>
        <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.skull}>💀</div>
          <h1 style={styles.title}>Skull King</h1>
          <p style={styles.subtitle}>Yo-Ho-Ho!</p>
        </div>

        <div style={styles.setupCard}>
          <h2 style={styles.cardTitle}>Gather Yer Crew</h2>
          <p style={styles.hint}>2-6 pirates required</p>

          <div style={styles.inputRow}>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
              placeholder="Pirate name..."
              style={styles.input}
              maxLength={12}
            />
            <button
              onClick={addPlayer}
              style={styles.addBtn}
              disabled={!playerName.trim() || players.length >= 6}
            >
              +
            </button>
          </div>

          <div style={styles.playerList}>
            {players.map((player, i) => (
              <div key={i} style={styles.playerChip}>
                <span style={styles.playerIcon}>☠️</span>
                <span>{player.name}</span>
                <button onClick={() => removePlayer(i)} style={styles.removeBtn}>×</button>
              </div>
            ))}
          </div>

          {players.length > 0 && (
            <button onClick={clearPlayers} style={styles.clearBtn}>
              Clear Crew
            </button>
          )}

          {players.length >= 2 && (
            <button onClick={startGame} style={styles.startBtn}>
              Set Sail! ⚓
            </button>
          )}
        </div>
      </div>
      </>
    );
  }

  // Game Complete Screen
  if (roundPhase === 'complete') {
    const sortedPlayers = [...players].sort((a, b) => b.totalScore - a.totalScore);
    return (
      <>
        <div style={styles.fixedBackground}></div>
        <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.skull}>🏴‍☠️</div>
          <h1 style={styles.title}>Battle Complete!</h1>
        </div>

        <div style={styles.resultsCard}>
          <h2 style={styles.cardTitle}>Final Standings</h2>
          {sortedPlayers.map((player, i) => (
            <div key={i} style={{
              ...styles.resultRow,
              background: i === 0 ? 'linear-gradient(90deg, #ffd700 0%, #b8860b 100%)' : 'rgba(0,0,0,0.2)'
            }}>
              <span style={styles.rank}>{i === 0 ? '👑' : `#${i + 1}`}</span>
              <span style={styles.resultName}>{player.name}</span>
              <span style={styles.resultScore}>{player.totalScore}</span>
            </div>
          ))}

          <button onClick={resetGame} style={styles.startBtn}>
            New Game 🔄
          </button>
        </div>
      </div>
      </>
    );
  }

  // Bidding Phase
  if (roundPhase === 'bidding') {
    return (
      <>
        <div style={styles.fixedBackground}></div>
        <div style={styles.container}>
        <div style={styles.roundHeader}>
          <span style={styles.roundBadge}>Round {currentRound}/10</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            {phaseHistory.length > 0 && (
              <button onClick={performUndo} style={styles.undoBtn}>↶ Undo</button>
            )}
            <button onClick={endGameEarly} style={styles.endGameBtn}>End Game</button>
          </div>
        </div>

        <h2 style={styles.phaseTitle}>🤞 Place Yer Bids!</h2>
        <p style={styles.phaseHint}>How many tricks will ye win?</p>

        <div style={styles.playersGrid}>
          {players.map((player, i) => (
            <div key={i} style={styles.playerCard}>
              <div style={styles.playerName}>☠️ {player.name}</div>
              <div style={styles.totalScore}>Total: {player.totalScore}</div>

              <div style={styles.bidSection}>
                <span style={styles.bidLabel}>Bid</span>
                <div style={styles.bidButtons}>
                  {[...Array(currentRound + 1)].map((_, num) => (
                    <button
                      key={num}
                      onClick={() => setBid(i, num)}
                      style={{
                        ...styles.bidBtn,
                        ...(roundData[i]?.bid === num ? styles.bidBtnActive : {})
                      }}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={confirmBids} style={styles.actionBtn}>
          ⚔️ Start Round!
        </button>
      </div>
      </>
    );
  }

  // Scoring Phase
  return (
    <>
      <div style={styles.fixedBackground}></div>
      <div style={styles.container}>
      <div style={styles.roundHeader}>
        <span style={styles.roundBadge}>Round {currentRound}/10</span>
        <div style={{ display: 'flex', gap: '10px' }}>
          {gameHistory.length > 0 && (
            <button onClick={() => setShowHistory(!showHistory)} style={styles.historyBtn}>
              {showHistory ? '← Back' : '📋 History'}
            </button>
          )}
          {phaseHistory.length > 0 && (
            <button onClick={performUndo} style={styles.undoBtn}>↶ Undo</button>
          )}
          <button onClick={endGameEarly} style={styles.endGameBtn}>End Game</button>
        </div>
      </div>

      {!showHistory ? (
        <>
          <h2 style={styles.phaseTitle}>🎯 Record Results</h2>

          <div style={styles.playersGrid}>
            {players.map((player, i) => {
              const data = roundData[i];
              const bidMet = data.bid === data.tricks;
              const score = calculateScore(data);

              return (
                <div key={i} style={styles.playerCard}>
                  <div style={styles.playerName}>☠️ {player.name}</div>
                  {editingBid === i ? (
                    <div style={styles.bidSection}>
                      <span style={styles.bidLabel}>Edit Bid</span>
                      <div style={styles.bidButtons}>
                        {[...Array(currentRound + 1)].map((_, num) => (
                          <button
                            key={num}
                            onClick={() => {
                              setBid(i, num);
                              setEditingBid(null);
                            }}
                            style={{
                              ...styles.bidBtn,
                              ...(data.bid === num ? styles.bidBtnActive : {})
                            }}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setEditingBid(null)} style={styles.cancelBtn}>Cancel</button>
                    </div>
                  ) : (
                    // Pencil icon ✏️ always visible (good for mobile - no hover state)
                    // Cursor pointer + title provide additional affordance on desktop
                    <div
                      style={{...styles.bidDisplay, cursor: 'pointer'}}
                      onClick={() => setEditingBid(i)}
                      title="Click to edit bid"
                    >
                      Bid: {data.bid} ✏️
                    </div>
                  )}

              <NumberStepper
                label="Tricks Won"
                value={data.tricks}
                onDecrement={() => updateTricks(i, -1)}
                onIncrement={() => updateTricks(i, 1)}
                max={currentRound}
              />

              {bidMet && data.bid > 0 && (
                <div style={styles.bonusSection}>
                  <div style={styles.bonusTitle}>⭐ Bonuses</div>

                  <NumberStepper
                    label="Pirates caught by Skull King"
                    value={data.piratesCapture}
                    onDecrement={() => updatePiratesCapture(i, -1)}
                    onIncrement={() => updatePiratesCapture(i, 1)}
                    max={5}
                  />

                  <button
                    onClick={() => toggleSkullKingCapture(i)}
                    style={{
                      ...styles.bonusToggle,
                      ...(data.skullKingCapture ? styles.bonusToggleActive : {})
                    }}
                  >
                    🧜‍♀️ Mermaid caught Skull King {data.skullKingCapture ? '✓' : ''}
                  </button>
                </div>
              )}

              <div style={{
                ...styles.roundScore,
                color: score >= 0 ? '#2ecc40' : '#ff4136'
              }}>
                {score >= 0 ? '+' : ''}{score} pts
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={finishRound} style={styles.actionBtn}>
        {currentRound < 10 ? '✅ Finish Round' : '🏆 End Game'}
      </button>
        </>
      ) : (
        <>
          <h2 style={styles.phaseTitle}>📜 Game History</h2>
          <div style={styles.playersGrid}>
            {gameHistory.map((entry, roundIndex) => (
              <div key={roundIndex} style={styles.historyRoundCard}>
                <h3 style={styles.historyRoundTitle}>Round {entry.round}</h3>
                {players.map((player, playerIndex) => {
                  const data = entry.scores[playerIndex];
                  return (
                    <div key={playerIndex} style={styles.historyPlayerRow}>
                      <span style={styles.historyPlayerName}>{player.name}</span>
                      <div style={styles.historyDetails}>
                        <span>Bid: {data.bid}</span>
                        <span>Won: {data.tricks}</span>
                        {data.piratesCapture > 0 && <span>⚔️ {data.piratesCapture}</span>}
                        {data.skullKingCapture && <span>🧜‍♀️</span>}
                        <span style={{color: data.score >= 0 ? '#2ecc40' : '#ff4136', fontWeight: 'bold'}}>
                          {data.score >= 0 ? '+' : ''}{data.score}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  fixedBackground: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    zIndex: 0,
  },
  container: {
    position: 'relative',
    zIndex: 1,
    minHeight: '100dvh',
    padding: '20px',
    fontFamily: "'Cinzel', 'Georgia', serif",
    color: '#f4e4bc',
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px',
  },
  skull: {
    fontSize: '64px',
    animation: 'bob 2s ease-in-out infinite',
    textShadow: '0 0 30px rgba(255,215,0,0.5)',
  },
  title: {
    fontSize: '42px',
    margin: '10px 0',
    fontWeight: 'bold',
    background: 'linear-gradient(180deg, #ffd700 0%, #b8860b 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    textShadow: 'none',
    letterSpacing: '3px',
  },
  subtitle: {
    fontSize: '20px',
    opacity: 0.8,
    fontStyle: 'italic',
    letterSpacing: '5px',
  },
  setupCard: {
    background: 'linear-gradient(135deg, rgba(139,69,19,0.4) 0%, rgba(101,67,33,0.6) 100%)',
    borderRadius: '20px',
    padding: '30px',
    maxWidth: '500px',
    margin: '0 auto',
    border: '2px solid #b8860b',
    boxShadow: '0 10px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.2)',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: '24px',
    textAlign: 'center',
    marginBottom: '10px',
    color: '#ffd700',
  },
  hint: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: '20px',
    fontSize: '14px',
  },
  inputRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    alignItems: 'stretch',
    width: '100%',
    boxSizing: 'border-box',
  },
  input: {
    flex: 1,
    padding: '15px',
    fontSize: '18px',
    border: '2px solid #b8860b',
    borderRadius: '10px',
    background: 'rgba(0,0,0,0.3)',
    color: '#f4e4bc',
    outline: 'none',
    fontFamily: 'inherit',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  addBtn: {
    width: '54px',
    fontSize: '24px',
    border: '2px solid #b8860b',
    borderRadius: '10px',
    background: 'linear-gradient(180deg, #b8860b 0%, #8b4513 100%)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
    flexShrink: 0,
    boxSizing: 'border-box',
  },
  playerList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '20px',
  },
  playerChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 15px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '30px',
    border: '1px solid #b8860b',
  },
  playerIcon: {
    fontSize: '18px',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ff4136',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '0 5px',
  },
  startBtn: {
    width: '100%',
    padding: '18px',
    fontSize: '20px',
    border: 'none',
    borderRadius: '15px',
    background: 'linear-gradient(180deg, #2ecc40 0%, #1a8a2a 100%)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    letterSpacing: '2px',
    boxShadow: '0 5px 20px rgba(46,204,64,0.4)',
    marginTop: '10px',
  },
  clearBtn: {
    padding: '10px 20px',
    fontSize: '14px',
    border: '1px solid #ff4136',
    borderRadius: '10px',
    background: 'transparent',
    color: '#ff4136',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginBottom: '10px',
  },
  endGameBtn: {
    padding: '8px 16px',
    fontSize: '12px',
    border: '1px solid rgba(255,65,54,0.5)',
    borderRadius: '8px',
    background: 'rgba(255,65,54,0.1)',
    color: '#ff4136',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  undoBtn: {
    padding: '8px 16px',
    fontSize: '12px',
    border: '1px solid rgba(255,215,0,0.5)',
    borderRadius: '8px',
    background: 'rgba(255,215,0,0.1)',
    color: '#ffd700',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  historyBtn: {
    padding: '8px 16px',
    fontSize: '12px',
    border: '1px solid rgba(46,204,64,0.5)',
    borderRadius: '8px',
    background: 'rgba(46,204,64,0.1)',
    color: '#2ecc40',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cancelBtn: {
    padding: '8px 16px',
    fontSize: '12px',
    border: '1px solid rgba(255,215,0,0.5)',
    borderRadius: '8px',
    background: 'transparent',
    color: '#f4e4bc',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: '10px',
  },
  historyRoundCard: {
    background: 'linear-gradient(135deg, rgba(139,69,19,0.3) 0%, rgba(101,67,33,0.4) 100%)',
    borderRadius: '15px',
    padding: '15px',
    border: '1px solid rgba(184,134,11,0.5)',
  },
  historyRoundTitle: {
    fontSize: '18px',
    color: '#ffd700',
    marginBottom: '10px',
    marginTop: 0,
  },
  historyPlayerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,215,0,0.1)',
  },
  historyPlayerName: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  historyDetails: {
    display: 'flex',
    gap: '10px',
    fontSize: '14px',
  },
  roundHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    padding: '15px 20px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '15px',
    border: '1px solid #b8860b',
  },
  roundBadge: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#ffd700',
  },
  cardsInfo: {
    fontSize: '14px',
    opacity: 0.8,
  },
  phaseTitle: {
    fontSize: '28px',
    textAlign: 'center',
    marginBottom: '10px',
    color: '#ffd700',
  },
  phaseHint: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: '25px',
    fontSize: '16px',
  },
  playersGrid: {
    display: 'grid',
    gap: '15px',
    marginBottom: '20px',
  },
  playerCard: {
    background: 'linear-gradient(135deg, rgba(139,69,19,0.4) 0%, rgba(101,67,33,0.5) 100%)',
    borderRadius: '15px',
    padding: '20px',
    border: '1px solid #b8860b',
  },
  playerName: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '5px',
  },
  totalScore: {
    fontSize: '14px',
    opacity: 0.7,
    marginBottom: '15px',
  },
  bidSection: {
    marginTop: '15px',
  },
  bidLabel: {
    display: 'block',
    fontSize: '14px',
    marginBottom: '10px',
    opacity: 0.8,
  },
  bidButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  bidBtn: {
    width: '44px',
    height: '44px',
    fontSize: '18px',
    border: '2px solid #b8860b',
    borderRadius: '10px',
    background: 'rgba(0,0,0,0.3)',
    color: '#f4e4bc',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
  },
  bidBtnActive: {
    background: 'linear-gradient(180deg, #ffd700 0%, #b8860b 100%)',
    color: '#1a1a2e',
    fontWeight: 'bold',
    transform: 'scale(1.1)',
  },
  bidDisplay: {
    fontSize: '16px',
    padding: '8px 15px',
    background: 'rgba(255,215,0,0.2)',
    borderRadius: '8px',
    display: 'inline-block',
    marginBottom: '15px',
  },
  stepper: {
    marginBottom: '15px',
  },
  stepperLabel: {
    display: 'block',
    fontSize: '14px',
    marginBottom: '8px',
    opacity: 0.8,
  },
  stepperControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  stepperBtn: {
    width: '50px',
    height: '50px',
    fontSize: '28px',
    border: '2px solid #b8860b',
    borderRadius: '12px',
    background: 'linear-gradient(180deg, #b8860b 0%, #8b4513 100%)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  stepperValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    minWidth: '50px',
    textAlign: 'center',
  },
  bonusSection: {
    marginTop: '15px',
    padding: '15px',
    background: 'rgba(255,215,0,0.1)',
    borderRadius: '10px',
    border: '1px dashed #ffd700',
  },
  bonusTitle: {
    fontSize: '16px',
    marginBottom: '15px',
    color: '#ffd700',
  },
  bonusToggle: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '2px solid #b8860b',
    borderRadius: '10px',
    background: 'rgba(0,0,0,0.3)',
    color: '#f4e4bc',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: '10px',
    transition: 'all 0.2s',
  },
  bonusToggleActive: {
    background: 'linear-gradient(180deg, #9b59b6 0%, #6c3483 100%)',
    borderColor: '#9b59b6',
  },
  roundScore: {
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'right',
    marginTop: '15px',
    padding: '10px',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '8px',
  },
  actionBtn: {
    width: '100%',
    padding: '18px',
    fontSize: '20px',
    border: 'none',
    borderRadius: '15px',
    background: 'linear-gradient(180deg, #ff851b 0%, #e65c00 100%)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    letterSpacing: '2px',
    boxShadow: '0 5px 20px rgba(255,133,27,0.4)',
    marginTop: '10px',
  },
  resultsCard: {
    background: 'linear-gradient(135deg, rgba(139,69,19,0.4) 0%, rgba(101,67,33,0.6) 100%)',
    borderRadius: '20px',
    padding: '30px',
    maxWidth: '500px',
    margin: '0 auto',
    border: '2px solid #b8860b',
    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '15px',
    borderRadius: '10px',
    marginBottom: '10px',
  },
  rank: {
    fontSize: '24px',
    marginRight: '15px',
    minWidth: '40px',
  },
  resultName: {
    flex: 1,
    fontSize: '20px',
  },
  resultScore: {
    fontSize: '24px',
    fontWeight: 'bold',
  },
};

// Add keyframe animation via style tag
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap');

  @keyframes bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #1a1a2e;
    min-height: 100vh;
  }
`;
document.head.appendChild(styleSheet);

export default SkullKingScorer;
