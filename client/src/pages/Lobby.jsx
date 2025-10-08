import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import './Lobby.css';

function Lobby({ lobbyData, onStartGame, onLeave }) {
  const { socket } = useSocket();
  const [lobby, setLobby] = useState(lobbyData);
  const [isHost, setIsHost] = useState(false);
  const [settings, setSettings] = useState({
    imposterCount: 1,
    turnTimeLimit: 30,
    votingTimeLimit: 30,
    maxRounds: 5,
    giveHintWord: false,
    randomEliminationOnTie: true,
    winnerOnMaxRounds: 'innocents',
    // Connections settings
    megaMode: false,
    puzzleCount: 1
  });

  useEffect(() => {
    if (!socket) return;

    // Listen for lobby updates
    socket.on('lobby_update', (updatedLobby) => {
      setLobby(updatedLobby);
      setIsHost(socket.id === updatedLobby.host);
    });

    // Listen for game start
    socket.on('game_start', () => {
      onStartGame(lobby.gameType);
    });

    socket.on('connections_start', () => {
      onStartGame('connections');
    });

    setIsHost(socket.id === lobbyData.host);

    return () => {
      socket.off('lobby_update');
      socket.off('game_start');
      socket.off('connections_start');
    };
  }, [socket, lobbyData, onStartGame, lobby?.gameType]);

  const handleStartGame = () => {
    socket.emit('start_game', { settings });
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleLeave = () => {
    socket.emit('leave_lobby');
    onLeave();
  };

  if (!lobby) return null;

  const minPlayers = lobby.gameType === 'imposter' ? 3 : 1;
  const canStart = lobby.players.length >= minPlayers && isHost;

  return (
    <div className="card lobby">
      <div className="lobby-header">
        <h1 className="title">
          {lobby.gameType === 'imposter' ? '🕵️ Imposter' : '🧩 Connections'}
        </h1>
        <div className="lobby-code">
          <span>Lobby Code:</span>
          <strong>{lobby.code}</strong>
        </div>
      </div>

      <div className="players-section">
        <h2>Players ({lobby.players.length})</h2>
        <div className="players-list">
          {lobby.players.map((player) => (
            <div key={player.id} className="player">
              <span>{player.name}</span>
              {player.isHost && <span className="host-badge">Host</span>}
            </div>
          ))}
        </div>
      </div>

      {lobby.gameType === 'imposter' && (
        <>
          <div className="game-info">
            <p>
              Waiting for at least {minPlayers} players to start...
            </p>
            <p className="tip">
              💡 Innocents get the secret word. Imposters must blend in!
            </p>
          </div>

          {isHost && (
            <div className="settings-section">
              <h2>Game Settings</h2>

              <div className="setting">
                <label>
                  Number of Imposters:
                  <select
                    value={settings.imposterCount}
                    onChange={(e) => updateSetting('imposterCount', parseInt(e.target.value))}
                  >
                    {[1, 2, 3].map(n => (
                      <option key={n} value={n} disabled={n >= lobby.players.length}>
                        {n} {n >= lobby.players.length ? '(need more players)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="setting">
                <label>
                  Turn Time Limit:
                  <select
                    value={settings.turnTimeLimit}
                    onChange={(e) => updateSetting('turnTimeLimit', parseInt(e.target.value))}
                  >
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds</option>
                  </select>
                </label>
              </div>

              <div className="setting">
                <label>
                  Voting Time Limit:
                  <select
                    value={settings.votingTimeLimit}
                    onChange={(e) => updateSetting('votingTimeLimit', parseInt(e.target.value))}
                  >
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds</option>
                  </select>
                </label>
              </div>

              <div className="setting">
                <label>
                  Max Rounds:
                  <select
                    value={settings.maxRounds}
                    onChange={(e) => updateSetting('maxRounds', parseInt(e.target.value))}
                  >
                    {[3, 4, 5, 6, 7, 8].map(n => (
                      <option key={n} value={n}>{n} rounds</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="setting checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.giveHintWord}
                    onChange={(e) => updateSetting('giveHintWord', e.target.checked)}
                  />
                  Give Imposters a Hint Word
                </label>
              </div>

              <div className="setting checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.randomEliminationOnTie}
                    onChange={(e) => updateSetting('randomEliminationOnTie', e.target.checked)}
                  />
                  Random Elimination on Vote Tie
                </label>
              </div>

              <div className="setting">
                <label>
                  Winner if Max Rounds Reached:
                  <select
                    value={settings.winnerOnMaxRounds}
                    onChange={(e) => updateSetting('winnerOnMaxRounds', e.target.value)}
                  >
                    <option value="innocents">Innocents</option>
                    <option value="imposters">Imposters</option>
                  </select>
                </label>
              </div>
            </div>
          )}
        </>
      )}

      {lobby.gameType === 'connections' && (
        <>
          <div className="game-info">
            <p className="tip">
              💡 Work together to find groups of four related words!
            </p>
          </div>

          {isHost && (
            <div className="settings-section">
              <h2>Game Settings</h2>

              <div className="setting checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.megaMode}
                    onChange={(e) => updateSetting('megaMode', e.target.checked)}
                  />
                  Mega Mode (Combine Multiple Puzzles)
                </label>
              </div>

              {settings.megaMode && (
                <div className="setting">
                  <label>
                    Number of Puzzles:
                    <select
                      value={settings.puzzleCount}
                      onChange={(e) => updateSetting('puzzleCount', parseInt(e.target.value))}
                    >
                      <option value={2}>2 puzzles (8 categories)</option>
                      <option value={3}>3 puzzles (12 categories)</option>
                      <option value={4}>4 puzzles (16 categories)</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="lobby-actions">
        {isHost ? (
          <button onClick={handleStartGame} disabled={!canStart}>
            {canStart ? 'Start Game' : `Need ${minPlayers - lobby.players.length} more player(s)`}
          </button>
        ) : (
          <p className="waiting">Waiting for host to start...</p>
        )}

        <button onClick={handleLeave} className="secondary">
          Leave Lobby
        </button>
      </div>
    </div>
  );
}

export default Lobby;
