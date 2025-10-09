import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { LobbyManager } from './lobby/LobbyManager.js';

const app = express();
const httpServer = createServer(app);

// Configure CORS
app.use(cors());

// Create Socket.IO server with CORS
// Remove trailing slash from CLIENT_URL to avoid CORS issues
const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');

const io = new Server(httpServer, {
  cors: {
    origin: clientUrl,
    methods: ['GET', 'POST']
  }
});

// Initialize lobby manager
const lobbyManager = new LobbyManager(io);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', lobbies: lobbyManager.getStats() });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Lobby events
  socket.on('create_lobby', (data, callback) => {
    lobbyManager.createLobby(socket, data, callback);
  });

  socket.on('join_lobby', (data, callback) => {
    lobbyManager.joinLobby(socket, data, callback);
  });

  socket.on('leave_lobby', () => {
    lobbyManager.leaveLobby(socket);
  });

  socket.on('get_lobby_list', (callback) => {
    const lobbies = lobbyManager.getPublicLobbies();
    callback({ success: true, lobbies });
  });

  socket.on('select_gamemode', (data) => {
    lobbyManager.selectGamemode(socket, data);
  });

  socket.on('start_game', (data) => {
    lobbyManager.startGame(socket, data);
  });

  // Imposter game events
  socket.on('submit_word', (data) => {
    lobbyManager.handleImposterWord(socket, data);
  });

  socket.on('cast_vote', (data) => {
    lobbyManager.handleImposterVote(socket, data);
  });

  socket.on('imposter_cursor_move', (data) => {
    lobbyManager.handleImposterCursor(socket, data);
  });

  // Connections game events
  socket.on('cursor_move', (data) => {
    lobbyManager.handleConnectionsCursor(socket, data);
  });

  socket.on('select_word', (data) => {
    lobbyManager.handleConnectionsSelection(socket, data);
  });

  // Lobby cursor events
  socket.on('lobby_cursor_move', (data) => {
    lobbyManager.handleLobbyCursor(socket, data);
  });

  socket.on('submit_group', (data) => {
    lobbyManager.handleConnectionsSubmit(socket, data);
  });

  socket.on('use_hint', () => {
    lobbyManager.handleConnectionsHint(socket);
  });

  socket.on('shuffle_words', () => {
    lobbyManager.handleConnectionsShuffle(socket);
  });

  socket.on('update_player_color', (data) => {
    lobbyManager.updatePlayerColor(socket, data);
  });

  // Disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    lobbyManager.handleDisconnect(socket);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🎮 Arcade server running on port ${PORT}`);
});
