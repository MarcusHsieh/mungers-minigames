import { useState } from 'react';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import ImposterGame from './pages/ImposterGame';
import ConnectionsGame from './pages/ConnectionsGame';
import { SocketProvider } from './context/SocketContext';

function App() {
  const [screen, setScreen] = useState('home'); // home, lobby, imposter, connections
  const [lobbyData, setLobbyData] = useState(null);

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

  return (
    <SocketProvider>
      <div className="container">
        {screen === 'home' && <Home onJoinLobby={goToLobby} />}
        {screen === 'lobby' && (
          <Lobby lobbyData={lobbyData} onStartGame={startGame} onLeave={goHome} />
        )}
        {screen === 'imposter' && <ImposterGame onEnd={returnToLobby} />}
        {screen === 'connections' && <ConnectionsGame onEnd={returnToLobby} lobbyData={lobbyData} />}
      </div>
    </SocketProvider>
  );
}

export default App;
