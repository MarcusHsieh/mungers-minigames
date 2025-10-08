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

  updateCursor(playerId, data) {
    // Validate and clamp coordinates to 0-100 range
    const x = Math.max(0, Math.min(100, parseFloat(data.x) || 0));
    const y = Math.max(0, Math.min(100, parseFloat(data.y) || 0));

    this.playerCursors.set(playerId, { x, y });

    const player = this.lobby.players.get(playerId);
    if (!player) return; // Player not in lobby

    // Get sender's socket to exclude from broadcast
    const senderSocket = this.io.sockets.sockets.get(playerId);
    if (senderSocket) {
      senderSocket.broadcast.to(this.lobbyCode).emit('cursor_update', {
        playerId,
        playerName: player.name,
        x,
        y
      });
    }
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

      // Clear selections for this player
      this.playerSelections.set(playerId, new Set());

      this.io.to(this.lobbyCode).emit('category_solved', {
        category: matchedCategory,
        solvedBy: player?.name || 'Unknown',
        playerId
      });

      // Check if all categories solved
      if (this.solvedCategories.length === this.categories.length) {
        this.endGame(true);
      }
    } else {
      // Incorrect
      this.mistakeCount++;

      this.io.to(this.lobbyCode).emit('mistake_made', {
        playerId,
        playerName: player?.name || 'Unknown',
        mistakeCount: this.mistakeCount,
        maxMistakes: this.maxMistakes
      });

      // Check if too many mistakes
      if (this.mistakeCount >= this.maxMistakes) {
        this.endGame(false);
      }
    }
  }

  endGame(won) {
    this.phase = won ? 'won' : 'lost';

    this.io.to(this.lobbyCode).emit('connections_end', {
      won,
      categories: this.categories,
      solvedCategories: this.solvedCategories
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

  removePlayer(playerId) {
    // Clean up player's cursor and selections
    this.playerCursors.delete(playerId);
    this.playerSelections.delete(playerId);

    // Notify other players that cursor is gone
    this.io.to(this.lobbyCode).emit('cursor_remove', { playerId });
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
