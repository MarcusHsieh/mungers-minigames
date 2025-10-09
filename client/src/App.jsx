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

  return (
    <div className="container">
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
