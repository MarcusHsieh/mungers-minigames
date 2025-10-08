import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import './Home.css';

function Home({ onJoinLobby }) {
  const { socket, connected } = useSocket();
  const [playerName, setPlayerName] = useState('');
  const [lobbyCode, setLobbyCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lobbyList, setLobbyList] = useState([]);
  const [showLobbyList, setShowLobbyList] = useState(false);

  const createLobby = () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');

    socket.emit('create_lobby', {
      playerName: playerName.trim(),
      settings: {}
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

  const quickJoinLobby = (code) => {
    if (!playerName.trim()) {
      setError('Please enter your name first');
      return;
    }

    socket.emit('join_lobby', {
      lobbyCode: code,
      playerName: playerName.trim()
    }, (response) => {
      if (response.success) {
        onJoinLobby(response.lobby);
      } else {
        setError(response.error || 'Failed to join lobby');
      }
    });
  };

  // Poll for lobby list when browser is visible
  useEffect(() => {
    if (!socket || !showLobbyList) return;

    const fetchLobbies = () => {
      socket.emit('get_lobby_list', (response) => {
        if (response.success) {
          setLobbyList(response.lobbies);
        }
      });
    };

    fetchLobbies();
    const interval = setInterval(fetchLobbies, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [socket, showLobbyList]);

  if (!connected) {
    return (
      <div className="card">
        <h1 className="title">Munger's Minigames</h1>
        <p className="subtitle">Connecting to server...</p>
        <p style={{ fontSize: '14px', opacity: 0.7, marginTop: '10px' }}>
          Server: {import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'}
        </p>
      </div>
    );
  }

  return (
    <div className="card home">
      <h1 className="title">🎮 Munger's Minigames</h1>
      <p className="subtitle">Create or join a lobby to get started!</p>

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
          Create New Lobby
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
            Join with Code
          </button>
        </div>

        <button onClick={() => setShowLobbyList(!showLobbyList)} className="secondary">
          {showLobbyList ? 'Hide Lobby List' : 'Browse Lobbies'}
        </button>
      </div>

      {showLobbyList && (
        <div className="lobby-list">
          <h2>Available Lobbies</h2>
          {lobbyList.length === 0 ? (
            <p className="no-lobbies">No lobbies available. Create one!</p>
          ) : (
            <div className="lobbies">
              {lobbyList.map(lobby => (
                <div key={lobby.code} className="lobby-item">
                  <div className="lobby-info">
                    <span className="lobby-code">{lobby.code}</span>
                    <span className="lobby-host">Host: {lobby.hostName}</span>
                    <span className="lobby-players">{lobby.playerCount} player{lobby.playerCount !== 1 ? 's' : ''}</span>
                    <span className="lobby-gamemode">
                      {lobby.gameType === 'imposter' ? '🕵️ Imposter' :
                       lobby.gameType === 'connections' ? '🧩 Connections' :
                       '🎮 Selecting gamemode'}
                    </span>
                  </div>
                  <button onClick={() => quickJoinLobby(lobby.code)} className="join-button">
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}

export default Home;
