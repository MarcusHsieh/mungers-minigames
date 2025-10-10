import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ConnectionsGame {
  constructor(io, lobby, lobbyManager) {
    this.io = io;
    this.lobby = lobby;
    this.lobbyManager = lobbyManager;
    this.lobbyCode = lobby.code;

    // Game settings
    this.isMegaMode = lobby.settings.megaMode || false;
    this.puzzleCount = lobby.settings.puzzleCount || (this.isMegaMode ? 2 : 1);

    // Game state
    this.words = [];
    this.categories = [];
    this.solvedCategories = [];
    this.mistakeCount = 0;
    this.maxMistakes = this.isMegaMode ? 8 : 4; // Double mistakes for mega mode
    this.hintsUsed = 0;
    this.maxHints = this.isMegaMode ? 4 : 2; // More hints for mega mode
    this.revealedHints = []; // Track which category names were revealed as hints
    this.playerCursors = new Map(); // playerId -> { x, y }
    this.playerSelections = new Map(); // playerId -> Set of words
    this.playerScores = new Map(); // playerId -> score
    this.phase = 'playing'; // playing, won, lost
  }

  start() {
    console.log(`Starting Connections game in lobby ${this.lobbyCode}`);

    // Load and merge puzzles
    this.loadPuzzles();

    console.log(`Loaded ${this.words.length} words for Connections game`);

    // Send initial game state
    this.io.to(this.lobbyCode).emit('connections_start', {
      words: this.words,
      maxMistakes: this.maxMistakes,
      maxHints: this.maxHints,
      isMegaMode: this.isMegaMode,
      players: Array.from(this.lobby.players.values())
    });

    console.log(`Emitted connections_start to lobby ${this.lobbyCode}`);
  }

  loadPuzzles() {
    // Load from archive
    const archivePath = join(__dirname, '../data/connections-archive.json');
    const archiveData = readFileSync(archivePath, 'utf-8');
    const allPuzzles = JSON.parse(archiveData);

    // Select random puzzles
    const selectedPuzzles = [];
    const shuffled = [...allPuzzles].sort(() => Math.random() - 0.5);

    for (let i = 0; i < this.puzzleCount && i < shuffled.length; i++) {
      selectedPuzzles.push(shuffled[i]);
    }

    // Merge puzzles
    if (this.isMegaMode && selectedPuzzles.length > 1) {
      this.mergePuzzles(selectedPuzzles);
    } else {
      this.categories = selectedPuzzles[0].categories;
      this.words = this.categories.flatMap(cat => cat.words);
    }

    // Shuffle words
    this.words = this.words.sort(() => Math.random() - 0.5);
  }

  mergePuzzles(puzzles) {
    const allWords = new Set();
    const mergedCategories = [];

    for (const puzzle of puzzles) {
      for (const category of puzzle.categories) {
        // Check for duplicate words
        const categoryWords = category.words.filter(word => {
          if (allWords.has(word)) {
            console.warn(`Duplicate word detected: ${word}. Skipping category.`);
            return false;
          }
          return true;
        });

        // Only add category if all words are unique
        if (categoryWords.length === category.words.length) {
          categoryWords.forEach(w => allWords.add(w));
          mergedCategories.push({ ...category, words: categoryWords });
        }
      }
    }

    this.categories = mergedCategories;
    this.words = Array.from(allWords);

    console.log(`Mega mode: Merged ${puzzles.length} puzzles into ${this.categories.length} categories`);
  }

  updateCursor(socket, data) {
    // Validate and clamp coordinates to 0-100 range
    const x = Math.max(0, Math.min(100, parseFloat(data.x) || 0));
    const y = Math.max(0, Math.min(100, parseFloat(data.y) || 0));

    this.playerCursors.set(socket.id, { x, y });

    const player = this.lobby.players.get(socket.id);
    if (!player) return; // Player not in lobby

    // Broadcast to others in lobby (exclude sender)
    socket.broadcast.to(this.lobbyCode).emit('cursor_update', {
      playerId: socket.id,
      playerName: player.name,
      playerColor: player.color || '#888',
      x,
      y
    });
  }

  selectWord(playerId, word) {
    if (!this.playerSelections.has(playerId)) {
      this.playerSelections.set(playerId, new Set());
    }

    const selections = this.playerSelections.get(playerId);

    // Toggle selection
    if (selections.has(word)) {
      selections.delete(word);
    } else {
      // Limit to 4 selections
      if (selections.size < 4) {
        selections.add(word);
      } else {
        return; // Can't select more than 4
      }
    }

    // Broadcast selection update
    this.io.to(this.lobbyCode).emit('selection_update', {
      playerId,
      selections: Array.from(selections)
    });
  }

  submitGroup(playerId, words) {
    if (this.phase !== 'playing' || words.length !== 4) {
      return;
    }

    const player = this.lobby.players.get(playerId);
    const wordSet = new Set(words);

    // Check if this matches any category
    const matchedCategory = this.categories.find(cat => {
      if (this.solvedCategories.includes(cat.name)) {
        return false;
      }
      return cat.words.every(w => wordSet.has(w));
    });

    if (matchedCategory) {
      // Correct!
      this.solvedCategories.push(matchedCategory.name);

      // Award points
      const currentScore = this.playerScores.get(playerId) || 0;
      this.playerScores.set(playerId, currentScore + 100);

      // Clear selections for this player
      this.playerSelections.set(playerId, new Set());

      this.io.to(this.lobbyCode).emit('category_solved', {
        category: matchedCategory,
        solvedBy: player?.name || 'Unknown',
        playerId
      });

      // Broadcast score update
      this.io.to(this.lobbyCode).emit('score_update', {
        playerId,
        score: this.playerScores.get(playerId),
        playerName: player?.name || 'Unknown'
      });

      // Check if all categories solved
      if (this.solvedCategories.length === this.categories.length) {
        this.endGame(true);
      }
    } else {
      // Incorrect - deduct points
      const currentScore = this.playerScores.get(playerId) || 0;
      this.playerScores.set(playerId, Math.max(0, currentScore - 25)); // Don't go below 0

      this.mistakeCount++;

      this.io.to(this.lobbyCode).emit('mistake_made', {
        playerId,
        playerName: player?.name || 'Unknown',
        mistakeCount: this.mistakeCount,
        maxMistakes: this.maxMistakes
      });

      // Broadcast score update
      this.io.to(this.lobbyCode).emit('score_update', {
        playerId,
        score: this.playerScores.get(playerId),
        playerName: player?.name || 'Unknown'
      });

      // Check if too many mistakes
      if (this.mistakeCount >= this.maxMistakes) {
        this.endGame(false);
      }
    }
  }

  endGame(won) {
    this.phase = won ? 'won' : 'lost';

    // Prepare scores array with player info
    const scores = Array.from(this.playerScores.entries()).map(([playerId, score]) => {
      const player = this.lobby.players.get(playerId);
      return {
        playerId,
        playerName: player?.name || 'Unknown',
        score
      };
    }).sort((a, b) => b.score - a.score); // Sort by score descending

    this.io.to(this.lobbyCode).emit('connections_end', {
      won,
      categories: this.categories,
      solvedCategories: this.solvedCategories,
      scores
    });

    // Return lobby to gamemode selection after delay
    setTimeout(() => {
      // Check if lobby still exists
      if (!this.lobbyManager.lobbies.has(this.lobbyCode)) {
        return;
      }

      this.lobby.state = 'selecting';
      this.lobby.gameType = null;
      this.lobby.game = null;

      console.log(`Lobby ${this.lobbyCode} returning to gamemode selection`);
      this.lobbyManager.broadcastLobbyUpdate(this.lobbyCode);
    }, 5000);
  }

  addPlayer(playerId) {
    // Initialize state for new player joining mid-game
    this.playerCursors.set(playerId, { x: 50, y: 50 });
    this.playerSelections.set(playerId, new Set());
    this.playerScores.set(playerId, 0); // Initialize score for new player

    // Send current game state to new player
    this.io.to(playerId).emit('connections_start', {
      words: this.words,
      maxMistakes: this.maxMistakes,
      maxHints: this.maxHints,
      isMegaMode: this.isMegaMode,
      players: Array.from(this.lobby.players.values())
    });

    // Send already solved categories
    for (const categoryName of this.solvedCategories) {
      const category = this.categories.find(c => c.name === categoryName);
      if (category) {
        this.io.to(playerId).emit('category_solved', {
          category,
          solvedBy: 'Previous players',
          playerId: 'system'
        });
      }
    }

    // Send current hint count and any revealed hints
    if (this.revealedHints.length > 0) {
      this.io.to(playerId).emit('sync_hints', {
        hintsUsed: this.hintsUsed,
        maxHints: this.maxHints,
        revealedHints: this.revealedHints
      });
    }

    // Send current mistake count
    if (this.mistakeCount > 0) {
      this.io.to(playerId).emit('mistake_made', {
        playerId: 'system',
        playerName: 'System',
        mistakeCount: this.mistakeCount,
        maxMistakes: this.maxMistakes
      });
    }

    // Send current scores for all players
    for (const [scorePlayerId, score] of this.playerScores.entries()) {
      const player = this.lobby.players.get(scorePlayerId);
      this.io.to(playerId).emit('score_update', {
        playerId: scorePlayerId,
        score,
        playerName: player?.name || 'Unknown'
      });
    }

    console.log(`Player ${playerId} joined Connections game mid-session`);
  }

  useHint(playerId) {
    if (this.phase !== 'playing' || this.hintsUsed >= this.maxHints) {
      return;
    }

    const player = this.lobby.players.get(playerId);

    // Find an unsolved category that hasn't been revealed as a hint
    const unsolvedCategories = this.categories.filter(
      cat => !this.solvedCategories.includes(cat.name) && !this.revealedHints.includes(cat.name)
    );

    if (unsolvedCategories.length === 0) return;

    // Pick a random unsolved category
    const categoryIndex = Math.floor(Math.random() * unsolvedCategories.length);
    const hintCategory = unsolvedCategories[categoryIndex];

    this.hintsUsed++;
    this.revealedHints.push(hintCategory.name);

    // Send hint to all players
    this.io.to(this.lobbyCode).emit('hint_revealed', {
      categoryName: hintCategory.name,
      hintsUsed: this.hintsUsed,
      maxHints: this.maxHints,
      usedBy: player?.name || 'Unknown'
    });

    console.log(`Hint used in lobby ${this.lobbyCode}: ${hintCategory.name}`);
  }

  shuffleWords(playerId) {
    if (this.phase !== 'playing') {
      return;
    }

    const player = this.lobby.players.get(playerId);

    // Shuffle the words array
    this.words = this.words.sort(() => Math.random() - 0.5);

    // Broadcast the new word order to all players
    this.io.to(this.lobbyCode).emit('words_shuffled', {
      words: this.words,
      shuffledBy: player?.name || 'Unknown'
    });

    console.log(`Words shuffled by ${player?.name || 'Unknown'} in lobby ${this.lobbyCode}`);
  }

  removePlayer(playerId) {
    // Clean up player's cursor and selections
    this.playerCursors.delete(playerId);
    this.playerSelections.delete(playerId);

    // Notify other players that cursor is gone
    this.io.to(this.lobbyCode).emit('cursor_remove', { playerId });
  }

  handlePlayerLeave(playerId) {
    console.log(`[ConnectionsGame] Player ${playerId} is leaving the game`);

    // Remove from game state
    this.playerCursors.delete(playerId);
    this.playerSelections.delete(playerId);
    this.playerScores.delete(playerId);

    // Notify other players cursor is gone
    this.io.to(this.lobbyCode).emit('cursor_remove', { playerId });

    // Connections is collaborative, so game can continue with remaining players
    // No minimum player count required
    const remainingPlayers = Array.from(this.lobby.players.values()).length;
    console.log(`  - Game continues with ${remainingPlayers} player(s)`);
  }

  playerDisconnected(playerId) {
    // Called when player temporarily disconnects (before grace period expires)
    // Remove their cursor from other players' views, but keep their selections/state
    console.log(`[ConnectionsGame] Player ${playerId} disconnected - removing cursor`);
    this.io.to(this.lobbyCode).emit('cursor_remove', { playerId });
  }

  restorePlayer(oldSocketId, newSocketId) {
    console.log(`[ConnectionsGame] Restoring player: ${oldSocketId} -> ${newSocketId}`);

    // Remove old cursor immediately to prevent duplicate cursors
    this.io.to(this.lobbyCode).emit('cursor_remove', { playerId: oldSocketId });

    // Restore selections
    if (this.playerSelections.has(oldSocketId)) {
      const selections = this.playerSelections.get(oldSocketId);
      this.playerSelections.delete(oldSocketId);
      this.playerSelections.set(newSocketId, selections);
      console.log('  - Restored selections:', selections.size);
    }

    // Restore score
    if (this.playerScores.has(oldSocketId)) {
      const score = this.playerScores.get(oldSocketId);
      this.playerScores.delete(oldSocketId);
      this.playerScores.set(newSocketId, score);
      console.log('  - Restored score:', score);
    }

    // Restore cursor position (optional, will be updated on next mouse move)
    if (this.playerCursors.has(oldSocketId)) {
      const cursor = this.playerCursors.get(oldSocketId);
      this.playerCursors.delete(oldSocketId);
      this.playerCursors.set(newSocketId, cursor);
    }

    // Wait for client to mount component and set up listeners before sending state
    setTimeout(() => {
      // Resend game state to reconnected player
      const player = this.lobby.players.get(newSocketId);

      // Send game start event
      this.io.to(newSocketId).emit('connections_start', {
        words: this.words,
        maxMistakes: this.maxMistakes,
        maxHints: this.maxHints,
        players: Array.from(this.lobby.players.values())
      });

      // Send current mistake count
      if (this.mistakeCount > 0) {
        this.io.to(newSocketId).emit('mistake_made', {
          playerName: 'System',
          mistakeCount: this.mistakeCount,
          maxMistakes: this.maxMistakes
        });
      }

      // Send solved categories
      for (const category of this.solvedCategories) {
        this.io.to(newSocketId).emit('category_solved', {
          category,
          solvedBy: 'Previously solved'
        });
      }

      // Send revealed hints
      if (this.hintsUsed > 0 && this.revealedHints.length > 0) {
        this.io.to(newSocketId).emit('sync_hints', {
          hintsUsed: this.hintsUsed,
          revealedHints: this.revealedHints
        });
      }

      // Send current scores
      this.io.to(newSocketId).emit('score_update', {
        scores: Array.from(this.playerScores.entries()).map(([id, score]) => ({
          playerId: id,
          playerName: this.lobby.players.get(id)?.name || 'Unknown',
          score
        }))
      });

      console.log(`[ConnectionsGame] Player state fully restored`);
    }, 500); // 500ms delay to ensure client is ready
  }

  // Allow restarting the game with a new puzzle
  restart() {
    this.words = [];
    this.categories = [];
    this.solvedCategories = [];
    this.mistakeCount = 0;
    this.playerCursors.clear();
    this.playerSelections.clear();
    this.phase = 'playing';

    this.start();
  }
}
