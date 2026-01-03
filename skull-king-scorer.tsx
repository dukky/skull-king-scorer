import { useState, useEffect } from 'react';
import { styles } from './styles';

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
    try {
      const stored = localStorage.getItem(`skullking_${key}`);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
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

  // Reset transient UI state when phase or round changes
  useEffect(() => {
    setShowHistory(false);
    setEditingBid(null);
  }, [currentRound, roundPhase]);

  const addPlayer = () => {
    if (playerName.trim() && players.length < 6) {
      setPlayers([...players, { name: playerName.trim(), totalScore: 0 }]);
      setPlayerName('');
    }
  };

  const removePlayer = (index: number) => {
    setPlayers(players.filter((_, i) => i !== index));
  };

  // Deep clone state for undo snapshots - without this, saved snapshots would hold
  // references to live objects, so mutations to current state would corrupt history.
  // Could simplify with structuredClone() if manual cloning becomes unwieldy.
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
    }
  };

  const setBid = (playerIndex: number, value: number) => {
    setRoundData(prev => ({
      ...prev,
      [playerIndex]: { ...prev[playerIndex], bid: value }
    }));
  };

  const updateTricks = (playerIndex: number, delta: number) => {
    setRoundData(prev => {
      const current = prev[playerIndex];
      if (!current) return prev;
      return {
        ...prev,
        [playerIndex]: {
          ...current,
          tricks: Math.max(0, Math.min(currentRound, current.tricks + delta))
        }
      };
    });
  };

  const updatePiratesCapture = (playerIndex: number, delta: number) => {
    setRoundData(prev => {
      const current = prev[playerIndex];
      if (!current) return prev;
      return {
        ...prev,
        [playerIndex]: {
          ...current,
          piratesCapture: Math.max(0, Math.min(5, current.piratesCapture + delta))
        }
      };
    });
  };

  const toggleSkullKingCapture = (playerIndex: number) => {
    setRoundData(prev => {
      const current = prev[playerIndex];
      if (!current) return prev;
      return {
        ...prev,
        [playerIndex]: {
          ...current,
          skullKingCapture: !current.skullKingCapture
        }
      };
    });
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
  };

  const finishRound = () => {
    // Validate total tricks equals round number
    const totalTricks = Object.values(roundData).reduce((sum, data) => sum + data.tricks, 0);
    if (totalTricks !== currentRound) {
      alert(`Total tricks (${totalTricks}) must equal round number (${currentRound})`);
      return;
    }

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

      const previousTotal = previousRounds.reduce((sum, entry) => sum + (entry.scores[i]?.score ?? 0), 0);
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
  };

  const clearPlayers = () => {
    if (window.confirm('Remove all players?')) {
      setPlayers([]);
    }
  };

  const endGameEarly = () => {
    if (window.confirm('End the game now? Current scores will be final.')) {
      setRoundPhase('complete');
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

export default SkullKingScorer;
