import { useState, useEffect } from 'react';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import ImposterGame from './pages/ImposterGame';
import ConnectionsGame from './pages/ConnectionsGame';
import { SocketProvider, useSocket } from './context/SocketContext';
import { enableCustomCursor, updateCursorColor } from './utils/cursor';

function AppContent() {
  const { socket } = useSocket();
  const [screen, setScreen] = useState('home'); // home, lobby, imposter, connections
  const [lobbyData, setLobbyData] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);

  // Enable custom cursor on mount
  useEffect(() => {
    enableCustomCursor();
    updateCursorColor('#f59e0b'); // Default color
  }, []);

  const goToLobby = (data) => {
    setLobbyData(data);
    setScreen('lobby');
  };

  const startGame = (gameType) => {
    console.log('[App] Starting game, transitioning to screen:', gameType);
    setScreen(gameType);
  };

  const returnToLobby = () => {
    // Return to lobby after game ends (preserves lobbyData)
    setScreen('lobby');
  };

  const goHome = () => {
    setScreen('home');
    setLobbyData(null);
  };

  // Listen for lobby updates to keep lobbyData in sync
  useEffect(() => {
    if (!socket) return;

    socket.on('lobby_update', (updatedLobby) => {
      // Only update lobbyData if we're in a lobby or game
      if (screen !== 'home') {
        setLobbyData(updatedLobby);
      }
    });

    return () => {
      socket.off('lobby_update');
    };
  }, [socket, screen]);

  // Listen for session restoration
  useEffect(() => {
    if (!socket) return;

    socket.on('session_restored', (data) => {
      console.log('♻️ Session restored:', data);
      setReconnecting(true);

      // Restore lobby data
      setLobbyData(data.lobby);

      // Restore appropriate screen
      if (data.gameState === 'playing' && data.gameType) {
        setScreen(data.gameType);
      } else {
        setScreen('lobby');
      }

      // Hide reconnecting overlay after a moment
      setTimeout(() => {
        setReconnecting(false);
      }, 1500);
    });

    return () => {
      socket.off('session_restored');
    };
  }, [socket]);

  return (
    <div className="container">
      {reconnecting && (
        <div className="reconnecting-overlay">
          <div className="reconnecting-message">
            <div className="reconnecting-spinner"></div>
            <p>Reconnecting...</p>
          </div>
        </div>
      )}

      {screen === 'home' && <Home onJoinLobby={goToLobby} />}
      {screen === 'lobby' && (
        <Lobby lobbyData={lobbyData} onStartGame={startGame} onLeave={goHome} />
      )}
      {screen === 'imposter' && <ImposterGame onEnd={returnToLobby} lobbyData={lobbyData} />}
      {screen === 'connections' && <ConnectionsGame onEnd={returnToLobby} lobbyData={lobbyData} />}
    </div>
  );
}

function App() {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
}

export default App;
