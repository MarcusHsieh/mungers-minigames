import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import './Home.css';

function Home({ onJoinLobby }) {
  const { socket, connected } = useSocket();
  const [gameType, setGameType] = useState('imposter');
  const [playerName, setPlayerName] = useState('');
  const [lobbyCode, setLobbyCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const createLobby = () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');

    socket.emit('create_lobby', {
      gameType,
      playerName: playerName.trim(),
      settings: gameType === 'connections' ? { megaMode: false, puzzleCount: 1 } : {}
    }, (response) => {
      setLoading(false);
      if (response.success) {
        onJoinLobby(response.lobby);
      } else {
        setError(response.error || 'Failed to create lobby');
      }
    });
  };

  const joinLobby = () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!lobbyCode.trim()) {
      setError('Please enter a lobby code');
      return;
    }

    setLoading(true);
    setError('');

    socket.emit('join_lobby', {
      lobbyCode: lobbyCode.trim().toUpperCase(),
      playerName: playerName.trim()
    }, (response) => {
      setLoading(false);
      if (response.success) {
        onJoinLobby(response.lobby);
      } else {
        setError(response.error || 'Failed to join lobby');
      }
    });
  };

  if (!connected) {
    return (
      <div className="card">
        <h1 className="title">Munger's Arcade</h1>
        <p className="subtitle">Connecting to server...</p>
      </div>
    );
  }

  return (
    <div className="card home">
      <h1 className="title">🎮 Munger's Arcade</h1>
      <p className="subtitle">Choose your game and get started!</p>

      <div className="game-selector">
        <button
          className={`game-card ${gameType === 'imposter' ? 'selected' : ''}`}
          onClick={() => setGameType('imposter')}
        >
          <div className="game-icon">🕵️</div>
          <h3>Imposter</h3>
          <p>Social deduction word game</p>
        </button>

        <button
          className={`game-card ${gameType === 'connections' ? 'selected' : ''}`}
          onClick={() => setGameType('connections')}
        >
          <div className="game-icon">🧩</div>
          <h3>Connections</h3>
          <p>Collaborative word puzzle</p>
        </button>
      </div>

      <div className="input-group">
        <input
          type="text"
          placeholder="Your Name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          maxLength={20}
        />
      </div>

      <div className="actions">
        <button onClick={createLobby} disabled={loading}>
          Create Lobby
        </button>

        <div className="join-section">
          <input
            type="text"
            placeholder="Lobby Code"
            value={lobbyCode}
            onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button onClick={joinLobby} disabled={loading}>
            Join Lobby
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}

export default Home;
