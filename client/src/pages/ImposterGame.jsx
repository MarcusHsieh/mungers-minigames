import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import './ImposterGame.css';

function ImposterGame({ onEnd }) {
  const { socket } = useSocket();
  const [gameState, setGameState] = useState({
    role: null,
    word: null,
    phase: 'waiting', // waiting, turn, voting, roundEnd, gameEnd
    currentPlayer: null,
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

  useEffect(() => {
    if (!socket) return;

    socket.on('game_start', (data) => {
      setGameState({
        role: data.role,
        word: data.word,
        phase: 'waiting',
        currentPlayer: null,
        round: 0,
        totalRounds: 0,
        isSpectator: data.isSpectator || false
      });
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
        currentPlayer: data.playerName
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

    return () => {
      socket.off('game_start');
      socket.off('round_start');
      socket.off('turn_start');
      socket.off('word_submitted');
      socket.off('voting_start');
      socket.off('voting_result');
      socket.off('game_end');
    };
  }, [socket]);

  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setTimeout(() => setTimeRemaining(t => t - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeRemaining]);

  const submitWord = () => {
    if (wordInput.trim() && gameState.phase === 'turn') {
      socket.emit('submit_word', { word: wordInput.trim() });
    }
  };

  const castVote = (targetId) => {
    setSelectedVote(targetId);
    socket.emit('cast_vote', { targetId });
  };

  const isMyTurn = gameState.currentPlayer && socket.id === gameState.currentPlayer;

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
    <div className="card imposter-game">
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

      {gameState.phase === 'turn' && !gameState.isSpectator && (
        <div className="turn-phase">
          <div className="timer">{timeRemaining}s</div>
          <h2>
            {isMyTurn ? "Your turn! Submit a word:" : `Waiting for ${gameState.currentPlayer}...`}
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
          <p>Watching: {gameState.currentPlayer}'s turn</p>
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
