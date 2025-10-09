import { useEffect, useState, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { updateCursorColor } from '../utils/cursor';
import Dropdown from '../components/Dropdown';
import './Lobby.css';

const AVAILABLE_COLORS = [
  { name: 'Orange', value: '#f59e0b' },
  { name: 'Green', value: '#10b981' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Amber', value: '#f97316' }
];

function Lobby({ lobbyData, onStartGame, onLeave }) {
  const { socket } = useSocket();
  const [lobby, setLobby] = useState(lobbyData);
  const [isHost, setIsHost] = useState(false);
  const [lobbyCursors, setLobbyCursors] = useState(new Map());
  const lobbyAreaRef = useRef(null);
  const [selectedColor, setSelectedColor] = useState(AVAILABLE_COLORS[0].value);
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

  // Initialize isHost and color on mount
  useEffect(() => {
    if (socket && lobbyData) {
      setIsHost(socket.id === lobbyData.host);

      // Set color from player data if available
      const currentPlayer = lobbyData.players?.find(p => p.id === socket.id);
      if (currentPlayer?.color) {
        setSelectedColor(currentPlayer.color);
        updateCursorColor(currentPlayer.color);
      }
    }
  }, [socket, lobbyData]);

  // Check if joining a game in progress and immediately transition
  useEffect(() => {
    if (lobbyData && lobbyData.state === 'playing' && lobbyData.gameType) {
      console.log(`Joining game in progress: ${lobbyData.gameType}`);
      onStartGame(lobbyData.gameType);
    }
  }, [lobbyData, onStartGame]);

  useEffect(() => {
    if (!socket) return;

    // Listen for lobby updates
    socket.on('lobby_update', (updatedLobby) => {
      setLobby(updatedLobby);
      setIsHost(socket.id === updatedLobby.host);

      // Transition to game screen when lobby state changes to 'playing'
      if (updatedLobby.state === 'playing' && lobby?.state !== 'playing') {
        onStartGame(updatedLobby.gameType);
      }
    });

    // Listen for game start (for Imposter)
    socket.on('game_start', () => {
      if (lobby?.gameType === 'imposter') {
        onStartGame(lobby.gameType);
      }
    });

    // Listen for lobby cursor updates
    socket.on('lobby_cursor_update', (data) => {
      if (data.playerId !== socket.id) {
        setLobbyCursors(prev => new Map(prev).set(data.playerId, {
          x: data.x,
          y: data.y,
          name: data.playerName,
          color: data.playerColor || '#888'
        }));
      }
    });

    socket.on('lobby_cursor_remove', (data) => {
      setLobbyCursors(prev => {
        const newCursors = new Map(prev);
        newCursors.delete(data.playerId);
        return newCursors;
      });
    });

    setIsHost(socket.id === lobbyData.host);

    return () => {
      socket.off('lobby_update');
      socket.off('game_start');
      socket.off('lobby_cursor_update');
      socket.off('lobby_cursor_remove');
    };
  }, [socket, lobbyData, onStartGame, lobby?.gameType, lobby?.state]);

  // Track mouse movement for lobby cursors
  useEffect(() => {
    if (!lobbyAreaRef.current || !socket) return;

    let throttleTimeout = null;

    const handleMouseMove = (e) => {
      if (!throttleTimeout) {
        const rect = lobbyAreaRef.current.getBoundingClientRect();
        let x = ((e.clientX - rect.left) / rect.width) * 100;
        let y = ((e.clientY - rect.top) / rect.height) * 100;

        // Clamp to 0-100 range
        x = Math.max(0, Math.min(100, x));
        y = Math.max(0, Math.min(100, y));

        socket.emit('lobby_cursor_move', { x, y });

        throttleTimeout = setTimeout(() => {
          throttleTimeout = null;
        }, 50);
      }
    };

    const area = lobbyAreaRef.current;
    area.addEventListener('mousemove', handleMouseMove);

    return () => {
      area.removeEventListener('mousemove', handleMouseMove);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [socket]);

  const handleStartGame = () => {
    socket.emit('start_game', { settings });
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleColorChange = (color) => {
    setSelectedColor(color);
    updateCursorColor(color);
    if (socket) {
      socket.emit('update_player_color', { color });
    }
  };

  const handleLeave = () => {
    socket.emit('leave_lobby');
    onLeave();
  };

  const selectGamemode = (gameType) => {
    socket.emit('select_gamemode', { gameType, settings: {} });
  };

  const backToGameSelection = () => {
    socket.emit('select_gamemode', { gameType: null, settings: {} });
  };

  if (!lobby) return null;

  const minPlayers = lobby.gameType === 'imposter' ? 3 : 1;
  const canStart = lobby.players.length >= minPlayers && isHost;

  return (
    <div className="card lobby" ref={lobbyAreaRef}>
      {/* Render other players' cursors */}
      {Array.from(lobbyCursors.entries()).map(([playerId, cursor]) => (
        <div
          key={playerId}
          className="lobby-cursor"
          style={{
            left: `${cursor.x}%`,
            top: `${cursor.y}%`
          }}
        >
          <div className="cursor-pointer" style={{ color: cursor.color }}>▲</div>
          <div className="cursor-name" style={{ color: cursor.color, borderColor: cursor.color }}>{cursor.name}</div>
        </div>
      ))}

      <div className="lobby-header">
        <h1 className="title">
          {lobby.state === 'selecting' ? '🎮 Select Game Mode' :
           lobby.gameType === 'imposter' ? '🕵️ Imposter' : '🧩 Connections'}
        </h1>
        <div className="lobby-code">
          <span>Lobby Code:</span>
          <strong>{lobby.code}</strong>
        </div>
      </div>

      <div className="color-selector-section">
        <h3>Your Color</h3>
        <div className="color-options">
          {AVAILABLE_COLORS.map((color) => (
            <button
              key={color.value}
              className={`color-option ${selectedColor === color.value ? 'selected' : ''}`}
              style={{ backgroundColor: color.value }}
              onClick={() => handleColorChange(color.value)}
              title={color.name}
            />
          ))}
        </div>
      </div>

      <div className="players-section">
        <h2>Players ({lobby.players.length})</h2>
        <div className="players-list">
          {lobby.players.map((player) => (
            <div key={player.id} className="player">
              <span
                className="player-color-dot"
                style={{ backgroundColor: player.color || '#888' }}
              />
              <span>{player.name}</span>
              {player.isHost && <span className="host-badge">Host</span>}
            </div>
          ))}
        </div>
      </div>

      {lobby.state === 'selecting' && isHost && (
        <div className="gamemode-selection">
          <div className="game-info">
            <p className="tip">
              Choose which game to play:
            </p>
          </div>
          <div className="gamemode-buttons">
            <button onClick={() => selectGamemode('imposter')} className="gamemode-button">
              <div className="game-icon">🕵️</div>
              <h3>Imposter</h3>
              <p>Social deduction word game</p>
            </button>
            <button onClick={() => selectGamemode('connections')} className="gamemode-button">
              <div className="game-icon">🧩</div>
              <h3>Connections</h3>
              <p>Collaborative word puzzle</p>
            </button>
          </div>
        </div>
      )}

      {lobby.state === 'selecting' && !isHost && (
        <div className="game-info">
          <p className="waiting">Waiting for host to select game mode...</p>
        </div>
      )}

      {lobby.gameType === 'imposter' && lobby.state === 'waiting' && (
        <>
          <div className="game-info">
            <p>
              Waiting for at least {minPlayers} players to start...
            </p>
            <p className="tip">
              💡 Innocents get the secret word. Imposters must blend in!
            </p>
            {isHost && (
              <button onClick={backToGameSelection} className="back-button">
                ← Change Game Mode
              </button>
            )}
          </div>

          {isHost && (
            <div className="settings-section">
              <h2>Game Settings</h2>

              <div className="setting">
                <label>
                  Number of Imposters:
                  <Dropdown
                    value={settings.imposterCount}
                    onChange={(value) => updateSetting('imposterCount', value)}
                    options={[1, 2, 3].map(n => ({
                      value: n,
                      label: `${n} ${n >= lobby.players.length ? '(need more players)' : ''}`,
                      disabled: n >= lobby.players.length
                    }))}
                  />
                </label>
              </div>

              <div className="setting">
                <label>
                  Turn Time Limit:
                  <Dropdown
                    value={settings.turnTimeLimit}
                    onChange={(value) => updateSetting('turnTimeLimit', value)}
                    options={[
                      { value: 15, label: '15 seconds' },
                      { value: 30, label: '30 seconds' },
                      { value: 45, label: '45 seconds' },
                      { value: 60, label: '60 seconds' }
                    ]}
                  />
                </label>
              </div>

              <div className="setting">
                <label>
                  Voting Time Limit:
                  <Dropdown
                    value={settings.votingTimeLimit}
                    onChange={(value) => updateSetting('votingTimeLimit', value)}
                    options={[
                      { value: 15, label: '15 seconds' },
                      { value: 30, label: '30 seconds' },
                      { value: 45, label: '45 seconds' },
                      { value: 60, label: '60 seconds' }
                    ]}
                  />
                </label>
              </div>

              <div className="setting">
                <label>
                  Max Rounds:
                  <Dropdown
                    value={settings.maxRounds}
                    onChange={(value) => updateSetting('maxRounds', value)}
                    options={[3, 4, 5, 6, 7, 8].map(n => ({
                      value: n,
                      label: `${n} rounds`
                    }))}
                  />
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
                  <Dropdown
                    value={settings.winnerOnMaxRounds}
                    onChange={(value) => updateSetting('winnerOnMaxRounds', value)}
                    options={[
                      { value: 'innocents', label: 'Innocents' },
                      { value: 'imposters', label: 'Imposters' }
                    ]}
                  />
                </label>
              </div>
            </div>
          )}
        </>
      )}

      {lobby.gameType === 'connections' && lobby.state === 'waiting' && (
        <>
          <div className="game-info">
            <p className="tip">
              💡 Work together to find groups of four related words!
            </p>
            {isHost && (
              <button onClick={backToGameSelection} className="back-button">
                ← Change Game Mode
              </button>
            )}
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
                    <Dropdown
                      value={settings.puzzleCount}
                      onChange={(value) => updateSetting('puzzleCount', value)}
                      options={[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({
                        value: n,
                        label: `${n} puzzles (${n * 4} categories)`
                      }))}
                    />
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
