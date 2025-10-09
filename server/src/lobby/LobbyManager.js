import { customAlphabet } from 'nanoid';
import { ImposterGame } from '../games/ImposterGame.js';
import { ConnectionsGame } from '../games/ConnectionsGame.js';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

export class LobbyManager {
  constructor(io) {
    this.io = io;
    this.lobbies = new Map(); // lobbyCode -> Lobby
    this.socketToLobby = new Map(); // socketId -> lobbyCode
  }

  createLobby(socket, data, callback) {
    const { gameType, playerName, settings } = data;
    const lobbyCode = nanoid();

    const lobby = {
      code: lobbyCode,
      gameType: gameType || null, // null until selected, or use provided gameType for compatibility
      host: socket.id,
      players: new Map([[socket.id, { id: socket.id, name: playerName, isHost: true }]]),
      settings: settings || {},
      game: null,
      state: gameType ? 'waiting' : 'selecting' // 'selecting' if no gameType provided, 'waiting' otherwise
    };

    this.lobbies.set(lobbyCode, lobby);
    this.socketToLobby.set(socket.id, lobbyCode);
    socket.join(lobbyCode);

    console.log(`Lobby created: ${lobbyCode} (${gameType})`);

    callback({ success: true, lobbyCode, lobby: this.getLobbyInfo(lobby) });
    this.broadcastLobbyUpdate(lobbyCode);
  }

  joinLobby(socket, data, callback) {
    const { lobbyCode, playerName } = data;
    const lobby = this.lobbies.get(lobbyCode);

    if (!lobby) {
      return callback({ success: false, error: 'Lobby not found' });
    }

    // Allow joining even during games - spectator mode for Imposter, active play for Connections
    const isSpectator = lobby.state === 'playing' && lobby.gameType === 'imposter';

    lobby.players.set(socket.id, {
      id: socket.id,
      name: playerName,
      isHost: false,
      isSpectator: isSpectator
    });
    this.socketToLobby.set(socket.id, lobbyCode);
    socket.join(lobbyCode);

    console.log(`Player ${playerName} joined lobby ${lobbyCode}${isSpectator ? ' as spectator' : ''}`);

    // If joining Connections mid-game, notify game instance
    if (lobby.state === 'playing' && lobby.gameType === 'connections' && lobby.game) {
      lobby.game.addPlayer(socket.id);
    }

    callback({ success: true, lobby: this.getLobbyInfo(lobby) });
    this.broadcastLobbyUpdate(lobbyCode);
  }

  leaveLobby(socket) {
    const lobbyCode = this.socketToLobby.get(socket.id);
    if (!lobbyCode) return;

    const lobby = this.lobbies.get(lobbyCode);
    if (!lobby) return;

    // Notify game instance about player leaving (for cleanup)
    if (lobby.game && typeof lobby.game.removePlayer === 'function') {
      lobby.game.removePlayer(socket.id);
    }

    // Remove lobby cursor for this player
    socket.broadcast.to(lobby.code).emit('lobby_cursor_remove', {
      playerId: socket.id
    });

    lobby.players.delete(socket.id);
    this.socketToLobby.delete(socket.id);
    socket.leave(lobbyCode);

    // If lobby is empty, delete it
    if (lobby.players.size === 0) {
      this.lobbies.delete(lobbyCode);
      console.log(`Lobby ${lobbyCode} deleted (empty)`);
      return;
    }

    // If host left, assign new host
    if (lobby.host === socket.id) {
      const newHost = Array.from(lobby.players.keys())[0];
      lobby.host = newHost;
      lobby.players.get(newHost).isHost = true;
    }

    this.broadcastLobbyUpdate(lobbyCode);
  }

  handleDisconnect(socket) {
    this.leaveLobby(socket);
  }

  selectGamemode(socket, data) {
    const lobbyCode = this.socketToLobby.get(socket.id);
    const lobby = this.lobbies.get(lobbyCode);

    if (!lobby || lobby.host !== socket.id) {
      return; // Only host can select gamemode
    }

    const { gameType, settings } = data;

    // Allow null to go back to selection
    if (gameType === null) {
      lobby.gameType = null;
      lobby.state = 'selecting';
      console.log(`Lobby ${lobbyCode} returned to gamemode selection`);
      this.broadcastLobbyUpdate(lobbyCode);
      return;
    }

    if (!['imposter', 'connections'].includes(gameType)) {
      return;
    }

    lobby.gameType = gameType;
    if (settings) {
      lobby.settings = { ...lobby.settings, ...settings };
    }
    lobby.state = 'waiting'; // Move to waiting state

    console.log(`Lobby ${lobbyCode} gamemode selected: ${gameType}`);
    this.broadcastLobbyUpdate(lobbyCode);
  }

  startGame(socket, data) {
    const lobbyCode = this.socketToLobby.get(socket.id);
    const lobby = this.lobbies.get(lobbyCode);

    if (!lobby || lobby.host !== socket.id) {
      console.log(`[startGame] Failed - lobby: ${!!lobby}, isHost: ${lobby?.host === socket.id}`);
      return;
    }

    console.log(`[startGame] Starting game in lobby ${lobbyCode} with ${lobby.players.size} players`);

    // Update lobby settings with data from host
    if (data.settings) {
      lobby.settings = { ...lobby.settings, ...data.settings };
    }

    lobby.state = 'playing';

    // Broadcast lobby update first so clients transition screens
    this.broadcastLobbyUpdate(lobbyCode);

    // Give clients time to mount the game component, then start game
    setTimeout(() => {
      if (lobby.gameType === 'imposter') {
        console.log(`[startGame] Creating Imposter game for lobby ${lobbyCode}`);
        lobby.game = new ImposterGame(this.io, lobby, this);
        lobby.game.start();
      } else if (lobby.gameType === 'connections') {
        console.log(`[startGame] Creating Connections game for lobby ${lobbyCode}`);
        lobby.game = new ConnectionsGame(this.io, lobby, this);
        lobby.game.start();
      }
    }, 100);
  }

  // Imposter game handlers
  handleImposterWord(socket, data) {
    const lobby = this.getLobbyForSocket(socket.id);
    if (lobby?.game instanceof ImposterGame) {
      lobby.game.submitWord(socket.id, data.word);
    }
  }

  handleImposterVote(socket, data) {
    const lobby = this.getLobbyForSocket(socket.id);
    if (lobby?.game instanceof ImposterGame) {
      lobby.game.castVote(socket.id, data.targetId);
    }
  }

  handleImposterCursor(socket, data) {
    const lobby = this.getLobbyForSocket(socket.id);
    if (lobby?.game instanceof ImposterGame) {
      lobby.game.updateCursor(socket, data);
    }
  }

  // Connections game handlers
  handleConnectionsCursor(socket, data) {
    const lobby = this.getLobbyForSocket(socket.id);
    if (lobby?.game instanceof ConnectionsGame) {
      lobby.game.updateCursor(socket, data);
    }
  }

  // Lobby cursor handler
  handleLobbyCursor(socket, data) {
    const lobby = this.getLobbyForSocket(socket.id);
    if (!lobby) return;

    const player = lobby.players.get(socket.id);
    if (!player) return;

    // Validate and clamp coordinates to 0-100 range
    const x = Math.max(0, Math.min(100, parseFloat(data.x) || 0));
    const y = Math.max(0, Math.min(100, parseFloat(data.y) || 0));

    // Broadcast to others in lobby (exclude sender)
    socket.broadcast.to(lobby.code).emit('lobby_cursor_update', {
      playerId: socket.id,
      playerName: player.name,
      x,
      y
    });
  }

  handleConnectionsSelection(socket, data) {
    const lobby = this.getLobbyForSocket(socket.id);
    if (lobby?.game instanceof ConnectionsGame) {
      lobby.game.selectWord(socket.id, data.word);
    }
  }

  handleConnectionsSubmit(socket, data) {
    const lobby = this.getLobbyForSocket(socket.id);
    if (lobby?.game instanceof ConnectionsGame) {
      lobby.game.submitGroup(socket.id, data.words);
    }
  }

  handleConnectionsHint(socket) {
    const lobby = this.getLobbyForSocket(socket.id);
    if (lobby?.game instanceof ConnectionsGame) {
      lobby.game.useHint(socket.id);
    }
  }

  // Helper methods
  getLobbyForSocket(socketId) {
    const lobbyCode = this.socketToLobby.get(socketId);
    return lobbyCode ? this.lobbies.get(lobbyCode) : null;
  }

  getLobbyInfo(lobby) {
    return {
      code: lobby.code,
      gameType: lobby.gameType,
      host: lobby.host,
      players: Array.from(lobby.players.values()),
      settings: lobby.settings,
      state: lobby.state
    };
  }

  broadcastLobbyUpdate(lobbyCode) {
    const lobby = this.lobbies.get(lobbyCode);
    if (lobby) {
      this.io.to(lobbyCode).emit('lobby_update', this.getLobbyInfo(lobby));
    }
  }

  getPublicLobbies() {
    const publicLobbies = [];

    for (const [code, lobby] of this.lobbies.entries()) {
      // Show all lobbies (including in-progress games for mid-game joining)
      publicLobbies.push({
        code: lobby.code,
        playerCount: lobby.players.size,
        state: lobby.state,
        gameType: lobby.gameType,
        hostName: lobby.players.get(lobby.host)?.name || 'Unknown'
      });
    }

    return publicLobbies;
  }

  getStats() {
    const stats = {
      totalLobbies: this.lobbies.size,
      activeGames: Array.from(this.lobbies.values()).filter(l => l.state === 'playing').length,
      lobbies: Array.from(this.lobbies.entries()).map(([code, lobby]) => ({
        code,
        state: lobby.state,
        gameType: lobby.gameType,
        playerCount: lobby.players.size
      }))
    };
    console.log('[getStats]', JSON.stringify(stats, null, 2));
    return stats;
  }
}
