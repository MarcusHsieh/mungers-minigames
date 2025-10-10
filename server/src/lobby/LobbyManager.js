import { customAlphabet } from 'nanoid';
import { ImposterGame } from '../games/ImposterGame.js';
import { ConnectionsGame } from '../games/ConnectionsGame.js';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

export class LobbyManager {
  constructor(io) {
    this.io = io;
    this.lobbies = new Map(); // lobbyCode -> Lobby
    this.socketToLobby = new Map(); // socketId -> lobbyCode
    this.sessions = new Map(); // sessionId -> SessionData
    this.disconnectedPlayers = new Map(); // socketId -> DisconnectData

    // Clean up expired sessions every 5 minutes
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
  }

  createLobby(socket, data, callback) {
    const { gameType, playerName, settings } = data;
    const sessionId = socket.handshake.auth?.sessionId;
    const lobbyCode = nanoid();

    const lobby = {
      code: lobbyCode,
      gameType: gameType || null, // null until selected, or use provided gameType for compatibility
      host: socket.id,
      players: new Map([[socket.id, { id: socket.id, name: playerName, isHost: true, color: '#f59e0b' }]]),
      settings: settings || {},
      game: null,
      state: gameType ? 'waiting' : 'selecting' // 'selecting' if no gameType provided, 'waiting' otherwise
    };

    this.lobbies.set(lobbyCode, lobby);
    this.socketToLobby.set(socket.id, lobbyCode);
    socket.join(lobbyCode);

    // Track session
    if (sessionId) {
      this.sessions.set(sessionId, {
        sessionId,
        lobbyCode,
        playerData: {
          name: playerName,
          color: '#f59e0b',
          wasHost: true,
          hostDisconnectTime: null
        },
        lastSeen: Date.now(),
        previousSocketId: socket.id
      });
    }

    console.log(`Lobby created: ${lobbyCode} (${gameType})`);

    callback({ success: true, lobbyCode, lobby: this.getLobbyInfo(lobby) });
    this.broadcastLobbyUpdate(lobbyCode);
  }

  joinLobby(socket, data, callback) {
    const { lobbyCode, playerName } = data;
    const sessionId = socket.handshake.auth?.sessionId;
    const lobby = this.lobbies.get(lobbyCode);

    if (!lobby) {
      return callback({ success: false, error: 'Lobby not found' });
    }

    // Allow joining even during games - spectator mode for Imposter, active play for Connections
    const isSpectator = lobby.state === 'playing' && lobby.gameType === 'imposter';

    // Assign a random default color
    const defaultColors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];
    const randomColor = defaultColors[Math.floor(Math.random() * defaultColors.length)];

    lobby.players.set(socket.id, {
      id: socket.id,
      name: playerName,
      isHost: false,
      isSpectator: isSpectator,
      color: randomColor
    });
    this.socketToLobby.set(socket.id, lobbyCode);
    socket.join(lobbyCode);

    // Track session
    if (sessionId) {
      this.sessions.set(sessionId, {
        sessionId,
        lobbyCode,
        playerData: {
          name: playerName,
          color: randomColor,
          wasHost: false,
          hostDisconnectTime: null
        },
        lastSeen: Date.now(),
        previousSocketId: socket.id
      });
    }

    console.log(`Player ${playerName} joined lobby ${lobbyCode}${isSpectator ? ' as spectator' : ''}`);

    // If joining mid-game, notify game instance
    if (lobby.state === 'playing' && lobby.game) {
      if (lobby.gameType === 'connections') {
        lobby.game.addPlayer(socket.id);
      } else if (lobby.gameType === 'imposter') {
        lobby.game.addPlayer(socket.id);
      }
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

  handleDisconnect(socket, sessionId) {
    const lobbyCode = this.socketToLobby.get(socket.id);
    if (!lobbyCode) return;

    const lobby = this.lobbies.get(lobbyCode);
    if (!lobby) return;

    const player = lobby.players.get(socket.id);
    if (!player) return;

    console.log(`Player ${player.name} disconnected from lobby ${lobbyCode}`);

    // If player has a session, mark as disconnected with grace period
    if (sessionId && this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId);

      // Track if this player was host
      const wasHost = lobby.host === socket.id;

      // Store disconnect info for grace period
      this.disconnectedPlayers.set(socket.id, {
        lobbyCode,
        sessionId,
        disconnectTime: Date.now(),
        wasHost,
        playerData: { ...player }
      });

      // Update session
      session.lastSeen = Date.now();
      session.playerData.wasHost = wasHost;
      if (wasHost) {
        session.playerData.hostDisconnectTime = Date.now();
      }

      // Notify game instance about temporary disconnect
      if (lobby.game && typeof lobby.game.playerDisconnected === 'function') {
        lobby.game.playerDisconnected(socket.id);
      }

      // Remove lobby cursor
      socket.broadcast.to(lobby.code).emit('lobby_cursor_remove', {
        playerId: socket.id
      });

      // Set timeout to actually remove player after grace period (2 minutes)
      setTimeout(() => {
        const disconnectData = this.disconnectedPlayers.get(socket.id);
        if (disconnectData) {
          // Player didn't reconnect, remove them permanently
          this.removeDisconnectedPlayer(socket.id);
        }
      }, 2 * 60 * 1000); // 2 minute grace period

      // If was host, temporarily assign new host
      if (wasHost && lobby.players.size > 1) {
        const newHost = Array.from(lobby.players.keys()).find(id => id !== socket.id);
        if (newHost) {
          lobby.host = newHost;
          lobby.players.get(newHost).isHost = true;
          console.log(`Temporarily assigned ${lobby.players.get(newHost).name} as host`);
        }
      }

      this.broadcastLobbyUpdate(lobbyCode);
    } else {
      // No session, immediately remove player
      this.leaveLobby(socket);
    }
  }

  removeDisconnectedPlayer(socketId) {
    const disconnectData = this.disconnectedPlayers.get(socketId);
    if (!disconnectData) return;

    const { lobbyCode, sessionId } = disconnectData;
    const lobby = this.lobbies.get(lobbyCode);

    console.log(`Removing disconnected player ${socketId} from lobby ${lobbyCode} (grace period expired)`);

    // Remove from disconnected tracking
    this.disconnectedPlayers.delete(socketId);

    // Remove session
    if (sessionId) {
      this.sessions.delete(sessionId);
    }

    if (!lobby) return;

    // Notify game instance
    if (lobby.game && typeof lobby.game.removePlayer === 'function') {
      lobby.game.removePlayer(socketId);
    }

    // Remove player
    lobby.players.delete(socketId);
    this.socketToLobby.delete(socketId);

    // If lobby is empty, delete it
    if (lobby.players.size === 0) {
      this.lobbies.delete(lobbyCode);
      console.log(`Lobby ${lobbyCode} deleted (empty after grace period)`);
      return;
    }

    this.broadcastLobbyUpdate(lobbyCode);
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
      playerColor: player.color || '#888',
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

  handleConnectionsShuffle(socket) {
    const lobby = this.getLobbyForSocket(socket.id);
    if (lobby?.game instanceof ConnectionsGame) {
      lobby.game.shuffleWords(socket.id);
    }
  }

  updatePlayerColor(socket, data) {
    const lobby = this.getLobbyForSocket(socket.id);
    if (!lobby) return;

    const player = lobby.players.get(socket.id);
    if (!player) return;

    // Update player color
    player.color = data.color;

    // Update session if exists
    const sessionId = socket.handshake.auth?.sessionId;
    if (sessionId && this.sessions.has(sessionId)) {
      this.sessions.get(sessionId).playerData.color = data.color;
    }

    // Broadcast updated lobby info to all players
    this.broadcastLobbyUpdate(lobby.code);

    console.log(`Player ${player.name} changed color to ${data.color} in lobby ${lobby.code}`);
  }

  attemptReconnection(socket, sessionId) {
    if (!sessionId || !this.sessions.has(sessionId)) {
      console.log(`No valid session found for ${socket.id}`);
      return;
    }

    const session = this.sessions.get(sessionId);
    const lobby = this.lobbies.get(session.lobbyCode);

    // Check if lobby still exists
    if (!lobby) {
      console.log(`Lobby ${session.lobbyCode} no longer exists, clearing session`);
      this.sessions.delete(sessionId);
      socket.emit('session_expired');
      return;
    }

    // Check session expiration (30 minutes)
    const sessionAge = Date.now() - session.lastSeen;
    if (sessionAge > 30 * 60 * 1000) {
      console.log(`Session expired for ${socket.id} (age: ${Math.round(sessionAge / 1000)}s)`);
      this.sessions.delete(sessionId);
      socket.emit('session_expired');
      return;
    }

    const oldSocketId = session.previousSocketId;

    console.log(`♻️ Reconnecting player with session ${sessionId.substring(0, 8)}`);
    console.log(`   Old socket: ${oldSocketId}, New socket: ${socket.id}`);

    // Update player in lobby with new socket ID
    const playerData = session.playerData;
    const wasHost = playerData.wasHost;

    // Check if we should restore host status
    let shouldRestoreHost = false;
    if (wasHost && playerData.hostDisconnectTime) {
      const disconnectDuration = Date.now() - playerData.hostDisconnectTime;
      // Restore host if disconnected less than 2 minutes ago
      if (disconnectDuration < 2 * 60 * 1000) {
        shouldRestoreHost = true;
        console.log(`   Restoring host status (disconnected for ${Math.round(disconnectDuration / 1000)}s)`);
      }
    }

    // Remove old socket references
    if (lobby.players.has(oldSocketId)) {
      lobby.players.delete(oldSocketId);
    }
    this.socketToLobby.delete(oldSocketId);
    this.disconnectedPlayers.delete(oldSocketId);

    // Add player with new socket ID
    lobby.players.set(socket.id, {
      id: socket.id,
      name: playerData.name,
      color: playerData.color,
      isHost: shouldRestoreHost,
      isSpectator: false
    });

    this.socketToLobby.set(socket.id, session.lobbyCode);
    socket.join(session.lobbyCode);

    // Restore host if applicable
    if (shouldRestoreHost) {
      lobby.host = socket.id;
    }

    // Update session with new socket
    session.previousSocketId = socket.id;
    session.lastSeen = Date.now();
    if (shouldRestoreHost) {
      session.playerData.hostDisconnectTime = null;
    }

    // Notify game instance to restore player state
    if (lobby.game) {
      if (typeof lobby.game.restorePlayer === 'function') {
        lobby.game.restorePlayer(oldSocketId, socket.id);
      }
    }

    // Send reconnection confirmation to client
    socket.emit('session_restored', {
      lobby: this.getLobbyInfo(lobby),
      gameType: lobby.gameType,
      gameState: lobby.state,
      wasHost: shouldRestoreHost,
      message: `Welcome back, ${playerData.name}!`
    });

    // Broadcast updated lobby to all players
    this.broadcastLobbyUpdate(session.lobbyCode);

    console.log(`✅ Successfully reconnected ${playerData.name} to lobby ${session.lobbyCode}`);
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.lastSeen;
      if (age > 30 * 60 * 1000) { // 30 minutes
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      console.log(`🧹 Cleaning up expired session: ${sessionId.substring(0, 8)}`);
      this.sessions.delete(sessionId);
    }

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
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
