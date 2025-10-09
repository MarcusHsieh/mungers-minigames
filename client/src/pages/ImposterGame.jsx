import { useEffect, useState, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import './ImposterGame.css';

function ImposterGame({ onEnd, lobbyData }) {
  const { socket } = useSocket();
  const gameAreaRef = useRef(null);
  const [gameState, setGameState] = useState({
    role: null,
    word: null,
    phase: 'waiting', // waiting, turn, voting, roundEnd, gameEnd
    currentPlayerId: null,
    currentPlayerName: null,
    round: 0,
    totalRounds: 0,
    isSpectator: false
  });
  const [submittedWords, setSubmittedWords] = useState([]);
  const [wordInput, setWordInput] = useState('');
  const [selectedVote, setSelectedVote] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [voteResults, setVoteResults] = useState(null);
  const [gameEndInfo, setGameEndInfo] = useState(null);
  const [cursors, setCursors] = useState(new Map());
  const [players, setPlayers] = useState([]);

  // Initialize players from lobby data
  useEffect(() => {
    if (lobbyData?.players) {
      setPlayers(lobbyData.players);
    }
  }, [lobbyData]);

  useEffect(() => {
    if (!socket) return;

    socket.on('lobby_update', (data) => {
      if (data.players) {
        setPlayers(data.players);
      }
    });

    socket.on('game_start', (data) => {
      setGameState({
        role: data.role,
        word: data.word,
        phase: 'waiting',
        currentPlayerId: null,
        currentPlayerName: null,
        round: 0,
        totalRounds: 0,
        isSpectator: data.isSpectator || false
      });

      // Update player list from authoritative server data
      if (data.players) {
        setPlayers(data.players);
      }
    });

    socket.on('round_start', (data) => {
      setGameState(prev => ({
        ...prev,
        round: data.round,
        totalRounds: data.totalRounds,
        phase: 'waiting'
      }));
      setSubmittedWords([]);
      setVoteResults(null);
    });

    socket.on('turn_start', (data) => {
      setGameState(prev => ({
        ...prev,
        phase: 'turn',
        currentPlayerId: data.playerId,
        currentPlayerName: data.playerName
      }));
      setTimeRemaining(data.timeLimit);
    });

    socket.on('word_submitted', (data) => {
      setSubmittedWords(prev => [...prev, data]);
      setWordInput('');
    });

    socket.on('voting_start', (data) => {
      setGameState(prev => ({ ...prev, phase: 'voting' }));
      setTimeRemaining(data.timeLimit);
      setSubmittedWords(data.words);
    });

    socket.on('voting_result', (data) => {
      setGameState(prev => ({ ...prev, phase: 'roundEnd' }));
      setVoteResults(data);
      setSelectedVote(null);
    });

    socket.on('game_end', (data) => {
      setGameState(prev => ({ ...prev, phase: 'gameEnd' }));
      setGameEndInfo(data);
    });

    socket.on('imposter_cursor_update', (data) => {
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

    socket.on('imposter_cursor_remove', (data) => {
      setCursors(prev => {
        const newCursors = new Map(prev);
        newCursors.delete(data.playerId);
        return newCursors;
      });
    });

    return () => {
      socket.off('lobby_update');
      socket.off('game_start');
      socket.off('round_start');
      socket.off('turn_start');
      socket.off('word_submitted');
      socket.off('voting_start');
      socket.off('voting_result');
      socket.off('game_end');
      socket.off('imposter_cursor_update');
      socket.off('imposter_cursor_remove');
    };
  }, [socket]);

  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setTimeout(() => setTimeRemaining(t => t - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeRemaining]);

  // Track mouse movement for cursors
  useEffect(() => {
    if (!gameAreaRef.current || !socket) return;

    let throttleTimeout = null;

    const handleMouseMove = (e) => {
      if (!throttleTimeout) {
        const rect = gameAreaRef.current.getBoundingClientRect();
        let x = ((e.clientX - rect.left) / rect.width) * 100;
        let y = ((e.clientY - rect.top) / rect.height) * 100;

        // Clamp to 0-100 range
        x = Math.max(0, Math.min(100, x));
        y = Math.max(0, Math.min(100, y));

        socket.emit('imposter_cursor_move', { x, y });

        throttleTimeout = setTimeout(() => {
          throttleTimeout = null;
        }, 50);
      }
    };

    const area = gameAreaRef.current;
    area.addEventListener('mousemove', handleMouseMove);

    return () => {
      area.removeEventListener('mousemove', handleMouseMove);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [socket]);

  const submitWord = () => {
    if (wordInput.trim() && gameState.phase === 'turn') {
      socket.emit('submit_word', { word: wordInput.trim() });
    }
  };

  const castVote = (targetId) => {
    setSelectedVote(targetId);
    socket.emit('cast_vote', { targetId });
  };

  const isMyTurn = gameState.currentPlayerId && socket.id === gameState.currentPlayerId;

  if (gameState.phase === 'gameEnd' && gameEndInfo) {
    return (
      <div className="card imposter-game">
        <h1 className="title">Game Over!</h1>
        <div className="game-end">
          <div className={`winner-banner ${gameEndInfo.winner}`}>
            {gameEndInfo.winner === 'imposters' ? '🕵️ Imposters Win!' : '😇 Innocents Win!'}
          </div>

          <div className="reveal">
            <h2>The Secret Word Was:</h2>
            <div className="secret-word">{gameEndInfo.targetWord}</div>
          </div>

          <div className="teams">
            <div className="team imposters">
              <h3>🕵️ Imposters</h3>
              {gameEndInfo.imposters.map(p => (
                <div key={p.playerId}>{p.playerName}</div>
              ))}
            </div>
            <div className="team innocents">
              <h3>😇 Innocents</h3>
              {gameEndInfo.innocents.map(p => (
                <div key={p.playerId}>{p.playerName}</div>
              ))}
            </div>
          </div>

          <button onClick={onEnd}>Return to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card imposter-game"
      ref={gameAreaRef}
      style={{
        cursor: players.find(p => p.id === socket?.id)?.color
          ? `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><text y="20" font-size="20" fill="${encodeURIComponent(players.find(p => p.id === socket?.id)?.color || '#888')}">▲</text></svg>') 12 12, auto`
          : 'auto'
      }}
    >
      {/* Render other players' cursors */}
      {Array.from(cursors.entries()).map(([playerId, cursor]) => (
        <div
          key={playerId}
          className="imposter-cursor"
          style={{
            left: `${cursor.x}%`,
            top: `${cursor.y}%`
          }}
        >
          <div className="cursor-pointer" style={{ color: cursor.color }}>▲</div>
          <div className="cursor-name" style={{ color: cursor.color, borderColor: cursor.color }}>{cursor.name}</div>
        </div>
      ))}

      <div className="game-header">
        <div className="role-badge" data-role={gameState.isSpectator ? 'spectator' : gameState.role}>
          {gameState.isSpectator ? '👁️ Spectator' :
           gameState.role === 'imposter' ? '🕵️ Imposter' : '😇 Innocent'}
        </div>
        <div className="round-info">
          Round {gameState.round} / {gameState.totalRounds}
        </div>
      </div>

      {gameState.isSpectator && (
        <div className="spectator-notice">
          <p>👁️ You joined as a spectator</p>
          <p className="subtitle">You'll be able to play in the next game!</p>
        </div>
      )}

      {gameState.word && !gameState.isSpectator && (
        <div className="word-display">
          <span>Your word:</span>
          <strong>{gameState.word}</strong>
        </div>
      )}

      {/* Player sidebar */}
      <div className="players-sidebar">
        <h3>Players</h3>
        <div className="players-list-game">
          {players.map((player) => (
            <div key={player.id} className="player-item">
              <span
                className="player-color-dot"
                style={{ backgroundColor: player.color || '#888' }}
              />
              <div className="player-info">
                <span className="player-name">
                  {player.name}
                  {player.id === socket.id && <span className="player-you"> (You)</span>}
                </span>
                {player.isSpectator && <span className="player-status spectator">Spectator</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {gameState.phase === 'turn' && !gameState.isSpectator && (
        <div className="turn-phase">
          <div className="timer">{timeRemaining}s</div>
          <h2>
            {isMyTurn ? "Your turn! Submit a word:" : `Waiting for ${gameState.currentPlayerName}...`}
          </h2>
          {isMyTurn && (
            <div className="word-input">
              <input
                type="text"
                value={wordInput}
                onChange={(e) => setWordInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && submitWord()}
                placeholder="Enter a word..."
                maxLength={30}
                autoFocus
              />
              <button onClick={submitWord} disabled={!wordInput.trim()}>
                Submit
              </button>
            </div>
          )}
        </div>
      )}

      {gameState.phase === 'turn' && gameState.isSpectator && (
        <div className="spectator-view">
          <div className="timer">{timeRemaining}s</div>
          <p>Watching: {gameState.currentPlayerName}'s turn</p>
        </div>
      )}

      {submittedWords.length > 0 && (
        <div className="submitted-words">
          <h3>Submitted Words:</h3>
          <div className="words-grid">
            {submittedWords.map((item, idx) => (
              <div key={idx} className="word-item">
                <span className="player-name">{item.playerName}</span>
                <span className="word">{item.word}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {gameState.phase === 'voting' && !gameState.isSpectator && (
        <div className="voting-phase">
          <div className="timer">{timeRemaining}s</div>
          <h2>Vote for who you think is the Imposter:</h2>
          <div className="vote-options">
            {submittedWords.map((item) => (
              <button
                key={item.playerId}
                className={`vote-option ${selectedVote === item.playerId ? 'selected' : ''}`}
                onClick={() => castVote(item.playerId)}
                disabled={selectedVote !== null}
              >
                <span className="player-name">{item.playerName}</span>
                <span className="word">"{item.word}"</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {gameState.phase === 'voting' && gameState.isSpectator && (
        <div className="spectator-view">
          <div className="timer">{timeRemaining}s</div>
          <h2>Voting Phase</h2>
          <p>Players are voting for the imposter...</p>
        </div>
      )}

      {gameState.phase === 'roundEnd' && voteResults && (
        <div className="round-end">
          <h2>Voting Results</h2>
          {voteResults.eliminated ? (
            <div className="eliminated">
              <p>
                <strong>{voteResults.eliminated.playerName}</strong> was eliminated!
              </p>
              <p>
                They were {voteResults.eliminated.wasImposter ? 'an 🕵️ Imposter' : 'an 😇 Innocent'}
              </p>
            </div>
          ) : (
            <p>No one was eliminated (vote tie)</p>
          )}
          <div className="votes-list">
            {voteResults.votes.map((v, idx) => (
              <div key={idx}>
                {v.playerName}: {v.votes} vote(s)
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ImposterGame;
