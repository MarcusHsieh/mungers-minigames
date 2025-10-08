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
      gameType, // 'imposter' or 'connections'
      host: socket.id,
      players: new Map([[socket.id, { id: socket.id, name: playerName, isHost: true }]]),
      settings: settings || {},
      game: null,
      state: 'waiting' // waiting, playing, finished
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

    if (lobby.state === 'playing' && lobby.gameType === 'imposter') {
      return callback({ success: false, error: 'Game already in progress' });
    }

    // For Connections, allow join anytime
    lobby.players.set(socket.id, { id: socket.id, name: playerName, isHost: false });
    this.socketToLobby.set(socket.id, lobbyCode);
    socket.join(lobbyCode);

    console.log(`Player ${playerName} joined lobby ${lobbyCode}`);

    callback({ success: true, lobby: this.getLobbyInfo(lobby) });
    this.broadcastLobbyUpdate(lobbyCode);
  }

  leaveLobby(socket) {
    const lobbyCode = this.socketToLobby.get(socket.id);
    if (!lobbyCode) return;

    const lobby = this.lobbies.get(lobbyCode);
    if (!lobby) return;

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

  startGame(socket, data) {
    const lobbyCode = this.socketToLobby.get(socket.id);
    const lobby = this.lobbies.get(lobbyCode);

    if (!lobby || lobby.host !== socket.id) {
      return;
    }

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
        lobby.game = new ImposterGame(this.io, lobby);
        lobby.game.start();
      } else if (lobby.gameType === 'connections') {
        lobby.game = new ConnectionsGame(this.io, lobby);
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

  // Connections game handlers
  handleConnectionsCursor(socket, data) {
    const lobby = this.getLobbyForSocket(socket.id);
    if (lobby?.game instanceof ConnectionsGame) {
      lobby.game.updateCursor(socket.id, data);
    }
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

  getStats() {
    return {
      totalLobbies: this.lobbies.size,
      activeGames: Array.from(this.lobbies.values()).filter(l => l.state === 'playing').length
    };
  }
}
