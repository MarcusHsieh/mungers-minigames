export class ImposterGame {
  constructor(io, lobby, lobbyManager) {
    this.io = io;
    this.lobby = lobby;
    this.lobbyManager = lobbyManager;
    this.lobbyCode = lobby.code;

    // Game settings with defaults
    this.settings = {
      imposterCount: lobby.settings.imposterCount || 1,
      turnTimeLimit: lobby.settings.turnTimeLimit || 30,
      votingTimeLimit: lobby.settings.votingTimeLimit || 30,
      maxRounds: lobby.settings.maxRounds || 5,
      giveHintWord: lobby.settings.giveHintWord || false,
      randomEliminationOnTie: lobby.settings.randomEliminationOnTie || true,
      winnerOnMaxRounds: lobby.settings.winnerOnMaxRounds || 'innocents'
    };

    // Game state
    this.targetWord = '';
    this.hintWord = '';
    this.imposters = new Set();
    this.innocents = new Set();
    this.currentRound = 0;
    this.currentTurnIndex = 0;
    this.turnOrder = [];
    this.submittedWords = new Map(); // playerId -> word
    this.votes = new Map(); // playerId -> targetPlayerId
    this.eliminatedPlayers = new Set();
    this.phase = 'starting'; // starting, turn, voting, roundEnd, gameEnd
    this.turnTimer = null;
    this.votingTimer = null;
  }

  start() {
    console.log(`Starting Imposter game in lobby ${this.lobbyCode}`);

    // Assign roles
    this.assignRoles();

    // Select words
    this.selectWords();

    // Send role information to each player
    this.sendRoleInfo();

    // Start first round
    setTimeout(() => this.startRound(), 2000);
  }

  assignRoles() {
    const playerIds = Array.from(this.lobby.players.keys());
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);

    for (let i = 0; i < this.settings.imposterCount && i < shuffled.length; i++) {
      this.imposters.add(shuffled[i]);
    }

    for (const id of playerIds) {
      if (!this.imposters.has(id)) {
        this.innocents.add(id);
      }
    }
  }

  selectWords() {
    // TODO: Load from word database
    // For now, use hardcoded examples
    const wordPairs = [
      { target: 'PIZZA', hint: 'PASTA' },
      { target: 'BASKETBALL', hint: 'FOOTBALL' },
      { target: 'GUITAR', hint: 'PIANO' },
      { target: 'SUMMER', hint: 'WINTER' },
      { target: 'OCEAN', hint: 'LAKE' }
    ];

    const pair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
    this.targetWord = pair.target;
    this.hintWord = pair.hint;
  }

  sendRoleInfo() {
    for (const [playerId, player] of this.lobby.players) {
      const isSpectator = player.isSpectator;
      const isImposter = this.imposters.has(playerId);

      this.io.to(playerId).emit('game_start', {
        role: isSpectator ? 'spectator' : (isImposter ? 'imposter' : 'innocent'),
        word: isSpectator ? null : (isImposter ? (this.settings.giveHintWord ? this.hintWord : null) : this.targetWord),
        imposterCount: this.settings.imposterCount,
        isSpectator: isSpectator,
        players: Array.from(this.lobby.players.values())
      });
    }
  }

  startRound() {
    this.currentRound++;
    this.currentTurnIndex = 0;
    this.submittedWords.clear();
    this.votes.clear();
    this.phase = 'turn';

    // Create turn order (exclude eliminated players and spectators)
    this.turnOrder = Array.from(this.lobby.players.entries())
      .filter(([id, player]) => !this.eliminatedPlayers.has(id) && !player.isSpectator)
      .map(([id]) => id)
      .sort(() => Math.random() - 0.5);

    this.io.to(this.lobbyCode).emit('round_start', {
      round: this.currentRound,
      totalRounds: this.settings.maxRounds
    });

    setTimeout(() => this.startNextTurn(), 1000);
  }

  startNextTurn() {
    if (this.currentTurnIndex >= this.turnOrder.length) {
      // All players submitted, move to voting
      return this.startVoting();
    }

    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    const player = this.lobby.players.get(currentPlayerId);

    this.io.to(this.lobbyCode).emit('turn_start', {
      playerId: currentPlayerId,
      playerName: player.name,
      timeLimit: this.settings.turnTimeLimit
    });

    // Set turn timer
    this.turnTimer = setTimeout(() => {
      // Auto-skip if no word submitted
      if (!this.submittedWords.has(currentPlayerId)) {
        this.submittedWords.set(currentPlayerId, '[No word]');
        this.currentTurnIndex++;
        this.startNextTurn();
      }
    }, this.settings.turnTimeLimit * 1000);
  }

  submitWord(playerId, word) {
    const currentPlayerId = this.turnOrder[this.currentTurnIndex];

    if (playerId !== currentPlayerId || this.phase !== 'turn') {
      return;
    }

    clearTimeout(this.turnTimer);
    this.submittedWords.set(playerId, word);

    this.io.to(this.lobbyCode).emit('word_submitted', {
      playerId,
      word
    });

    this.currentTurnIndex++;
    setTimeout(() => this.startNextTurn(), 1500);
  }

  startVoting() {
    this.phase = 'voting';

    const wordsList = Array.from(this.submittedWords.entries()).map(([id, word]) => ({
      playerId: id,
      playerName: this.lobby.players.get(id).name,
      word
    }));

    this.io.to(this.lobbyCode).emit('voting_start', {
      words: wordsList,
      timeLimit: this.settings.votingTimeLimit
    });

    this.votingTimer = setTimeout(() => {
      this.endVoting();
    }, this.settings.votingTimeLimit * 1000);
  }

  castVote(playerId, targetId) {
    const player = this.lobby.players.get(playerId);

    // Spectators and eliminated players cannot vote
    if (this.phase !== 'voting' || this.eliminatedPlayers.has(playerId) || player?.isSpectator) {
      return;
    }

    this.votes.set(playerId, targetId);

    // Check if all active (non-spectator, non-eliminated) players voted
    const activePlayers = this.turnOrder.filter(id => !this.eliminatedPlayers.has(id));
    if (this.votes.size >= activePlayers.length) {
      clearTimeout(this.votingTimer);
      this.endVoting();
    }
  }

  endVoting() {
    this.phase = 'roundEnd';

    // Tally votes
    const voteCounts = new Map();
    for (const targetId of this.votes.values()) {
      if (targetId) {
        voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
      }
    }

    // Find player(s) with most votes
    let maxVotes = 0;
    let playersWithMaxVotes = [];

    for (const [playerId, count] of voteCounts.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        playersWithMaxVotes = [playerId];
      } else if (count === maxVotes) {
        playersWithMaxVotes.push(playerId);
      }
    }

    // Determine elimination
    let eliminatedId = null;
    if (playersWithMaxVotes.length === 1) {
      eliminatedId = playersWithMaxVotes[0];
    } else if (playersWithMaxVotes.length > 1 && this.settings.randomEliminationOnTie) {
      eliminatedId = playersWithMaxVotes[Math.floor(Math.random() * playersWithMaxVotes.length)];
    }

    if (eliminatedId) {
      this.eliminatedPlayers.add(eliminatedId);
    }

    const voteResults = Array.from(voteCounts.entries()).map(([id, count]) => ({
      playerId: id,
      playerName: this.lobby.players.get(id).name,
      votes: count
    }));

    this.io.to(this.lobbyCode).emit('voting_result', {
      votes: voteResults,
      eliminated: eliminatedId ? {
        playerId: eliminatedId,
        playerName: this.lobby.players.get(eliminatedId).name,
        wasImposter: this.imposters.has(eliminatedId)
      } : null
    });

    // Check win conditions
    setTimeout(() => this.checkWinCondition(), 3000);
  }

  checkWinCondition() {
    const activeImposters = Array.from(this.imposters).filter(id => !this.eliminatedPlayers.has(id));
    const activeInnocents = Array.from(this.innocents).filter(id => !this.eliminatedPlayers.has(id));

    let winner = null;

    if (activeImposters.length === 0) {
      winner = 'innocents';
    } else if (activeImposters.length >= activeInnocents.length) {
      winner = 'imposters';
    } else if (this.currentRound >= this.settings.maxRounds) {
      winner = this.settings.winnerOnMaxRounds;
    }

    if (winner) {
      this.endGame(winner);
    } else {
      this.startRound();
    }
  }

  endGame(winner) {
    this.phase = 'gameEnd';

    this.io.to(this.lobbyCode).emit('game_end', {
      winner,
      targetWord: this.targetWord,
      imposters: Array.from(this.imposters).map(id => ({
        playerId: id,
        playerName: this.lobby.players.get(id).name
      })),
      innocents: Array.from(this.innocents).map(id => ({
        playerId: id,
        playerName: this.lobby.players.get(id).name
      }))
    });

    // Return lobby to gamemode selection after delay
    setTimeout(() => {
      // Check if lobby still exists
      if (!this.lobbyManager.lobbies.has(this.lobbyCode)) {
        return;
      }

      // Clear spectator flags for all players
      for (const [playerId, player] of this.lobby.players) {
        player.isSpectator = false;
      }

      this.lobby.state = 'selecting';
      this.lobby.gameType = null;
      this.lobby.game = null;

      console.log(`Lobby ${this.lobbyCode} returning to gamemode selection`);
      this.lobbyManager.broadcastLobbyUpdate(this.lobbyCode);
    }, 5000);
  }

  updateCursor(socket, data) {
    // Validate and clamp coordinates to 0-100 range
    const x = Math.max(0, Math.min(100, parseFloat(data.x) || 0));
    const y = Math.max(0, Math.min(100, parseFloat(data.y) || 0));

    const player = this.lobby.players.get(socket.id);
    if (!player) return; // Player not in lobby

    // Broadcast to others in lobby (exclude sender)
    socket.broadcast.to(this.lobbyCode).emit('imposter_cursor_update', {
      playerId: socket.id,
      playerName: player.name,
      x,
      y
    });
  }

  addPlayer(playerId) {
    // Initialize state for new spectator joining mid-game
    const player = this.lobby.players.get(playerId);

    if (!player) return;

    // Mark as spectator
    player.isSpectator = true;

    // Send game start info to spectator
    this.io.to(playerId).emit('game_start', {
      role: 'spectator',
      word: null,
      imposterCount: this.settings.imposterCount,
      isSpectator: true,
      players: Array.from(this.lobby.players.values())
    });

    // If game has started, send current round info
    if (this.currentRound > 0) {
      this.io.to(playerId).emit('round_start', {
        round: this.currentRound,
        totalRounds: this.settings.maxRounds
      });
    }

    // If currently in a turn, send turn info
    if (this.phase === 'turn' && this.currentTurnIndex < this.turnOrder.length) {
      const currentPlayerId = this.turnOrder[this.currentTurnIndex];
      const currentPlayer = this.lobby.players.get(currentPlayerId);

      this.io.to(playerId).emit('turn_start', {
        playerId: currentPlayerId,
        playerName: currentPlayer?.name || 'Unknown',
        timeLimit: this.settings.turnTimeLimit
      });
    }

    // Send already submitted words
    if (this.submittedWords.size > 0) {
      const wordsList = Array.from(this.submittedWords.entries()).map(([id, word]) => ({
        playerId: id,
        playerName: this.lobby.players.get(id)?.name || 'Unknown',
        word
      }));

      for (const wordData of wordsList) {
        this.io.to(playerId).emit('word_submitted', wordData);
      }
    }

    // If in voting phase, send voting info
    if (this.phase === 'voting') {
      const wordsList = Array.from(this.submittedWords.entries()).map(([id, word]) => ({
        playerId: id,
        playerName: this.lobby.players.get(id)?.name || 'Unknown',
        word
      }));

      this.io.to(playerId).emit('voting_start', {
        words: wordsList,
        timeLimit: this.settings.votingTimeLimit
      });
    }

    console.log(`Player ${playerId} joined Imposter game as spectator`);
  }

  removePlayer(playerId) {
    // Notify other players that cursor is gone
    this.io.to(this.lobbyCode).emit('imposter_cursor_remove', { playerId });
  }
}
