import { useEffect, useState, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { updateCursorColor } from '../utils/cursor';
import { clearSession } from '../utils/sessionManager';
import './ConnectionsGame.css';

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
const DIFFICULTY_NAMES = ['Easy', 'Medium', 'Hard', 'Tricky'];

const PLAYER_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];

function ConnectionsGame({ onEnd, lobbyData }) {
  const { socket } = useSocket();
  const boardRef = useRef(null);
  const [words, setWords] = useState([]);
  const [solvedCategories, setSolvedCategories] = useState([]);
  const [mySelections, setMySelections] = useState(new Set());
  const [otherSelections, setOtherSelections] = useState(new Map()); // playerId -> Set of words
  const [cursors, setCursors] = useState(new Map()); // playerId -> { x, y, name }
  const [mistakeCount, setMistakeCount] = useState(0);
  const [maxMistakes, setMaxMistakes] = useState(4);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [maxHints, setMaxHints] = useState(2);
  const [revealedHints, setRevealedHints] = useState([]);
  const [gameStatus, setGameStatus] = useState('playing'); // playing, won, lost
  const [allCategories, setAllCategories] = useState([]);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState([]);
  const [playerScores, setPlayerScores] = useState(new Map()); // playerId -> score
  const [finalScores, setFinalScores] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Initialize players from lobby data
  useEffect(() => {
    if (lobbyData?.players) {
      setPlayers(lobbyData.players);
    }
  }, [lobbyData]);

  // Update cursor color based on player's color
  useEffect(() => {
    if (socket && players.length > 0) {
      const currentPlayer = players.find(p => p.id === socket.id);
      if (currentPlayer?.color) {
        updateCursorColor(currentPlayer.color);
      }
    }
  }, [socket, players]);

  useEffect(() => {
    if (!socket) return;

    socket.on('lobby_update', (data) => {
      if (data.players) {
        setPlayers(data.players);
      }
    });

    socket.on('connections_start', (data) => {
      setWords(data.words);
      setMaxMistakes(data.maxMistakes);
      setMaxHints(data.maxHints || 2);
      setMistakeCount(0);
      setHintsUsed(0);
      setRevealedHints([]);
      setSolvedCategories([]);
      setMySelections(new Set());
      setOtherSelections(new Map());
      setGameStatus('playing');
      setLoading(false);
      setEventLog([]);

      // Update player list from authoritative server data
      if (data.players) {
        setPlayers(data.players);
      }

      addEventLog('Game started!', 'success');
    });

    socket.on('cursor_update', (data) => {
      // Validate data before updating state
      if (data.playerId !== socket.id &&
          typeof data.x === 'number' &&
          typeof data.y === 'number' &&
          typeof data.playerName === 'string') {
        setCursors(prev => new Map(prev).set(data.playerId, {
          x: data.x,
          y: data.y,
          name: data.playerName,
          color: data.playerColor || '#888'
        }));
      }
    });

    socket.on('cursor_remove', (data) => {
      setCursors(prev => {
        const newCursors = new Map(prev);
        newCursors.delete(data.playerId);
        return newCursors;
      });
    });

    socket.on('selection_update', (data) => {
      if (data.playerId !== socket.id) {
        setOtherSelections(prev => {
          const updated = new Map(prev);
          updated.set(data.playerId, new Set(data.selections));
          return updated;
        });
      }
    });

    socket.on('category_solved', (data) => {
      setSolvedCategories(prev => [...prev, data.category]);
      setMySelections(new Set());
      showMessage(`${data.solvedBy} found: ${data.category.name}!`, 'success');
      addEventLog(`${data.solvedBy} found: ${data.category.name} (${data.category.words.join(', ')})`, 'success');

      // Remove solved words from the board
      setWords(prev => prev.filter(w => !data.category.words.includes(w)));
    });

    socket.on('mistake_made', (data) => {
      setMistakeCount(data.mistakeCount);
      showMessage(`${data.playerName} made a mistake! (${data.mistakeCount}/${data.maxMistakes})`, 'error');
      addEventLog(`${data.playerName} made a mistake (${data.mistakeCount}/${data.maxMistakes})`, 'error');
    });

    socket.on('hint_revealed', (data) => {
      setHintsUsed(data.hintsUsed);
      setRevealedHints(prev => [...prev, data.categoryName]);
      showMessage(`${data.usedBy} revealed a hint: ${data.categoryName}`, 'hint');
      addEventLog(`${data.usedBy} used a hint: ${data.categoryName}`, 'hint');
    });

    socket.on('sync_hints', (data) => {
      setHintsUsed(data.hintsUsed);
      setRevealedHints(data.revealedHints || []);
    });

    socket.on('score_update', (data) => {
      setPlayerScores(prev => {
        const updated = new Map(prev);
        updated.set(data.playerId, data.score);
        return updated;
      });
    });

    socket.on('connections_end', (data) => {
      setGameStatus(data.won ? 'won' : 'lost');
      setAllCategories(data.categories);
      if (data.scores) {
        setFinalScores(data.scores);
      }
      addEventLog(data.won ? 'Game won! All categories found!' : 'Game over! Too many mistakes.', data.won ? 'success' : 'error');
    });

    socket.on('words_shuffled', (data) => {
      setWords(data.words);
      if (data.shuffledBy) {
        showMessage(`${data.shuffledBy} shuffled the board`, 'hint');
        addEventLog(`${data.shuffledBy} shuffled the board`, 'info');
      }
    });

    socket.on('player_left_game', (data) => {
      showMessage(`${data.playerName} left the game`, 'error');
      addEventLog(`${data.playerName} left the game`, 'error');
    });

    return () => {
      socket.off('lobby_update');
      socket.off('connections_start');
      socket.off('cursor_update');
      socket.off('cursor_remove');
      socket.off('selection_update');
      socket.off('category_solved');
      socket.off('mistake_made');
      socket.off('hint_revealed');
      socket.off('sync_hints');
      socket.off('score_update');
      socket.off('connections_end');
      socket.off('words_shuffled');
      socket.off('player_left_game');
    };
  }, [socket]);

  // Send cursor position updates
  useEffect(() => {
    if (!boardRef.current || !socket) return;

    let throttleTimeout = null;

    const handleMouseMove = (e) => {
      if (!throttleTimeout) {
        const rect = boardRef.current.getBoundingClientRect();
        let x = ((e.clientX - rect.left) / rect.width) * 100;
        let y = ((e.clientY - rect.top) / rect.height) * 100;

        // Clamp coordinates to 0-100 range
        x = Math.max(0, Math.min(100, x));
        y = Math.max(0, Math.min(100, y));

        socket.emit('cursor_move', { x, y });

        throttleTimeout = setTimeout(() => {
          throttleTimeout = null;
        }, 50); // 20 updates per second max
      }
    };

    const board = boardRef.current;
    board.addEventListener('mousemove', handleMouseMove);

    return () => {
      board.removeEventListener('mousemove', handleMouseMove);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [socket, loading]);

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const addEventLog = (text, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setEventLog(prev => [...prev, { text, type, timestamp, id: Date.now() + Math.random() }]);
  };

  const toggleWord = (word) => {
    if (gameStatus !== 'playing') return;

    const newSelections = new Set(mySelections);

    if (newSelections.has(word)) {
      newSelections.delete(word);
    } else {
      if (newSelections.size < 4) {
        newSelections.add(word);
      } else {
        return; // Can't select more than 4
      }
    }

    setMySelections(newSelections);
    socket.emit('select_word', { word });
  };

  const submitGroup = () => {
    if (mySelections.size !== 4) return;

    socket.emit('submit_group', { words: Array.from(mySelections) });
  };

  const deselectAll = () => {
    mySelections.forEach(word => {
      socket.emit('select_word', { word });
    });
    setMySelections(new Set());
  };

  const shuffle = () => {
    socket.emit('shuffle_words');
  };

  const useHint = () => {
    if (hintsUsed >= maxHints) return;
    socket.emit('use_hint');
  };

  const handleLeaveGame = () => {
    socket.emit('leave_game');
    clearSession();
    onEnd();
  };

  const getPlayerIndex = (playerId) => {
    return players.findIndex(p => p.id === playerId);
  };

  const getPlayerColor = (playerId) => {
    const index = getPlayerIndex(playerId);
    return index >= 0 ? PLAYER_COLORS[index % PLAYER_COLORS.length] : '#888';
  };

  const getPlayerNumber = (playerId) => {
    const index = getPlayerIndex(playerId);
    return index >= 0 ? index + 1 : '?';
  };

  const getPlayersWhoSelectedWord = (word) => {
    const playerIds = [];

    // Check if current player selected it
    if (mySelections.has(word)) {
      playerIds.push(socket.id);
    }

    // Check other players
    for (const [playerId, selections] of otherSelections.entries()) {
      if (selections.has(word)) {
        playerIds.push(playerId);
      }
    }

    return playerIds;
  };

  const isWordSelectedByOthers = (word) => {
    for (const selections of otherSelections.values()) {
      if (selections.has(word)) return true;
    }
    return false;
  };

  if (gameStatus === 'won' || gameStatus === 'lost') {
    return (
      <div className="card connections-game">
        <h1 className="title">{gameStatus === 'won' ? '🎉 You Won!' : '😔 Game Over'}</h1>

        {finalScores.length > 0 && (
          <div className="final-scores">
            <h2>Final Scores</h2>
            <div className="scores-list">
              {finalScores.map((score, idx) => (
                <div key={score.playerId} className="score-item">
                  <span className="score-rank">#{idx + 1}</span>
                  <span className="score-name">{score.playerName}</span>
                  <span className="score-points">{score.score} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="results">
          {allCategories.map((cat, idx) => (
            <div
              key={idx}
              className="result-category"
              style={{ backgroundColor: COLORS[cat.difficulty - 1] }}
            >
              <div className="category-name">{cat.name}</div>
              <div className="category-words">{cat.words.join(', ')}</div>
            </div>
          ))}
        </div>

        <button onClick={onEnd}>Return to Home</button>
      </div>
    );
  }

  if (loading || words.length === 0) {
    return (
      <div className="card connections-game">
        <h1 className="title">🧩 Connections</h1>
        <div style={{ textAlign: 'center', padding: '40px', fontSize: '18px' }}>
          <p>Loading puzzle...</p>
          {!socket && <p style={{ marginTop: '10px', opacity: 0.7 }}>Connecting to server...</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`card connections-game ${gameStatus === 'playing' ? 'playing' : ''}`}>
      {showLeaveConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h2>Leave Game?</h2>
            <p>Are you sure you want to leave? Your progress will be lost and other players will be notified.</p>
            <div className="confirm-buttons">
              <button onClick={() => setShowLeaveConfirm(false)} className="secondary">
                Cancel
              </button>
              <button onClick={handleLeaveGame} className="leave-button">
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="game-header">
        <h1 className="title">🧩 Connections</h1>
        <div className="game-stats">
          <div className="mistakes">
            Mistakes: {mistakeCount} / {maxMistakes}
            <div className="mistake-dots">
              {[...Array(maxMistakes)].map((_, i) => (
                <div
                  key={i}
                  className={`dot ${i < mistakeCount ? 'used' : ''}`}
                />
              ))}
            </div>
          </div>
          <div className="hints-info">
            Hints: {hintsUsed} / {maxHints}
          </div>
        </div>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {revealedHints.length > 0 && (
        <div className="hints-display">
          <strong>💡 Hints:</strong> {revealedHints.join(', ')}
        </div>
      )}

      <div className="solved-categories">
        {solvedCategories.map((cat, idx) => (
          <div
            key={idx}
            className="solved-category"
            style={{ backgroundColor: COLORS[cat.difficulty - 1] }}
          >
            <div className="category-name">{cat.name}</div>
            <div className="category-words">{cat.words.join(', ')}</div>
          </div>
        ))}
      </div>

      <div
        className="board"
        ref={boardRef}
      >
        {/* Render other players' cursors */}
        {Array.from(cursors.entries()).map(([playerId, cursor]) => (
          <div
            key={playerId}
            className="player-cursor"
            style={{
              left: `${cursor.x}%`,
              top: `${cursor.y}%`
            }}
          >
            <div className="cursor-pointer" style={{ color: cursor.color }}>▲</div>
            <div className="cursor-name" style={{ color: cursor.color, borderColor: cursor.color }}>{cursor.name}</div>
          </div>
        ))}

        {/* Word tiles */}
        <div className="words-grid">
          {words.map((word, idx) => {
            const selectedByPlayers = getPlayersWhoSelectedWord(word);
            return (
              <button
                key={idx}
                className={`word-tile ${mySelections.has(word) ? 'selected-me' : ''} ${
                  isWordSelectedByOthers(word) ? 'selected-other' : ''
                }`}
                onClick={() => toggleWord(word)}
              >
                {word}
                {selectedByPlayers.length > 0 && (
                  <div className="player-indicators">
                    {selectedByPlayers.map(playerId => (
                      <span
                        key={playerId}
                        className="player-number"
                        style={{ backgroundColor: getPlayerColor(playerId) }}
                      >
                        {getPlayerNumber(playerId)}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Player sidebar */}
      <div className="players-sidebar">
        <h3>Players</h3>
        <div className="players-list-game">
          {players.map((player, idx) => (
            <div key={player.id} className="player-item">
              <span
                className="player-color-indicator"
                style={{ backgroundColor: player.color || PLAYER_COLORS[idx % PLAYER_COLORS.length] }}
              >
                {idx + 1}
              </span>
              <div className="player-info">
                <span className="player-name">
                  {player.name}
                  {player.id === socket.id && <span className="player-you"> (You)</span>}
                </span>
                <span className="player-score">{playerScores.get(player.id) || 0} pts</span>
              </div>
            </div>
          ))}
        </div>

        <h3 style={{ marginTop: '20px' }}>Event Log</h3>
        <div className="event-log">
          {eventLog.length === 0 ? (
            <div className="event-log-empty">No events yet...</div>
          ) : (
            eventLog.map((event) => (
              <div key={event.id} className={`event-log-item event-${event.type}`}>
                <span className="event-time">{event.timestamp}</span>
                <span className="event-text">{event.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="controls">
        <button onClick={shuffle} className="secondary">
          Shuffle
        </button>
        <button onClick={deselectAll} disabled={mySelections.size === 0} className="secondary">
          Deselect All
        </button>
        <button onClick={useHint} disabled={hintsUsed >= maxHints} className="hint-button">
          💡 Hint ({maxHints - hintsUsed} left)
        </button>
        <button onClick={submitGroup} disabled={mySelections.size !== 4}>
          Submit
        </button>
        <button onClick={() => setShowLeaveConfirm(true)} className="leave-button">
          Leave Game
        </button>
      </div>

      <div className="instructions">
        <p>Find groups of four words that share something in common.</p>
        <p>Work together with your friends - you can see each other's cursors and selections!</p>
      </div>
    </div>
  );
}

export default ConnectionsGame;
