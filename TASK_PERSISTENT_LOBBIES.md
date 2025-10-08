# Task Document: Cursor Tracking Fix + Persistent Lobbies + Lobby Browser

**Date:** 2025-10-08
**Status:** Awaiting Approval
**Complexity:** High (Multi-domain: Server, Client, UI/UX)

---

## Overview

Implement three major features to improve multiplayer experience:
1. Fix cursor tracking bugs in Connections game
2. Add cursor tracking to Lobby screen (fun feature)
3. Implement persistent lobbies where players return after games to select new gamemodes
4. Add lobby browser to Home screen (no more manual code entry)

---

## Problem Analysis

### Current Issues

**Cursor Tracking (Connections Game):**
- Server broadcasts cursor updates to sender (should exclude them)
- No data validation on coordinates
- No cleanup when players disconnect
- No bounds checking (cursors can go negative or >100%)
- Potential memory leak from stale cursors

**Lobby Flow:**
- Games end but don't return players to lobby
- Lobbies are destroyed when empty
- No gamemode selection after lobby creation
- No way to play multiple games with same group
- Players must manually create new lobbies each time

**Lobby Discovery:**
- No lobby list/browser
- Players must manually share 6-digit codes
- No way to see available lobbies

---

## Proposed Solution

### Phase 1: Fix Cursor Tracking (HIGH PRIORITY)

**Files to Modify:**
- `server/src/games/ConnectionsGame.js`
- `client/src/pages/ConnectionsGame.jsx`

**Changes:**

**1.1 Server-Side Fixes (ConnectionsGame.js:102-115)**

Current Code:
```javascript
updateCursor(playerId, data) {
  const { x, y } = data;
  this.playerCursors.set(playerId, { x, y });

  const player = this.lobby.players.get(playerId);

  // Broadcast to all other players in the room
  this.io.to(this.lobbyCode).emit('cursor_update', {
    playerId,
    playerName: player?.name || 'Unknown',
    x,
    y
  });
}
```

Fixed Code:
```javascript
updateCursor(playerId, data) {
  // Validate coordinates
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
```

**1.2 Add Cursor Cleanup on Disconnect**

Add to ConnectionsGame.js:
```javascript
removePlayer(playerId) {
  this.playerCursors.delete(playerId);
  this.playerSelections.delete(playerId);

  // Notify other players cursor is gone
  this.io.to(this.lobbyCode).emit('cursor_remove', { playerId });
}
```

Hook up in LobbyManager.js leaveLobby():
```javascript
leaveLobby(socket) {
  const lobbyCode = this.socketToLobby.get(socket.id);
  if (!lobbyCode) return;

  const lobby = this.lobbies.get(lobbyCode);
  if (!lobby) return;

  // NEW: Notify game instance about player leaving
  if (lobby.game && typeof lobby.game.removePlayer === 'function') {
    lobby.game.removePlayer(socket.id);
  }

  // ... rest of existing code ...
}
```

**1.3 Client-Side Cleanup (ConnectionsGame.jsx)**

Add listener for cursor removal:
```javascript
socket.on('cursor_remove', (data) => {
  setCursors(prev => {
    const newCursors = new Map(prev);
    newCursors.delete(data.playerId);
    return newCursors;
  });
});
```

Add data validation:
```javascript
socket.on('cursor_update', (data) => {
  if (data.playerId !== socket.id &&
      typeof data.x === 'number' &&
      typeof data.y === 'number' &&
      typeof data.playerName === 'string') {
    setCursors(prev => new Map(prev).set(data.playerId, {
      x: data.x,
      y: data.y,
      name: data.playerName
    }));
  }
});
```

**1.4 Add Bounds Checking to Mouse Movement**

Fix ConnectionsGame.jsx:87-114:
```javascript
const handleMouseMove = (e) => {
  if (!throttleTimeout) {
    const rect = boardRef.current.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;

    // Clamp to 0-100 range
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    socket.emit('cursor_move', { x, y });

    throttleTimeout = setTimeout(() => {
      throttleTimeout = null;
    }, 50);
  }
};
```

---

### Phase 2: Add Cursors to Lobby Screen (FUN FEATURE)

**Files to Modify:**
- `client/src/pages/Lobby.jsx`
- `client/src/pages/Lobby.css`
- `server/src/lobby/LobbyManager.js`

**Implementation:**

**2.1 Add Cursor State to Lobby.jsx**

Add after line 12:
```javascript
const [lobbyCursors, setLobbyCursors] = useState(new Map());
const lobbyAreaRef = useRef(null);
```

**2.2 Add Socket Listeners**

Add in useEffect:
```javascript
socket.on('lobby_cursor_update', (data) => {
  if (data.playerId !== socket.id) {
    setLobbyCursors(prev => new Map(prev).set(data.playerId, {
      x: data.x,
      y: data.y,
      name: data.playerName
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
```

**2.3 Add Mouse Tracking**

Add useEffect:
```javascript
useEffect(() => {
  if (!lobbyAreaRef.current || !socket) return;

  let throttleTimeout = null;

  const handleMouseMove = (e) => {
    if (!throttleTimeout) {
      const rect = lobbyAreaRef.current.getBoundingClientRect();
      let x = ((e.clientX - rect.left) / rect.width) * 100;
      let y = ((e.clientY - rect.top) / rect.height) * 100;

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
```

**2.4 Render Cursors**

Wrap lobby content in trackable area and render cursors:
```jsx
<div ref={lobbyAreaRef} className="lobby-area">
  {/* Existing lobby content */}

  {/* Render cursors */}
  {Array.from(lobbyCursors.entries()).map(([playerId, cursor]) => (
    <div
      key={playerId}
      className="lobby-cursor"
      style={{
        left: `${cursor.x}%`,
        top: `${cursor.y}%`
      }}
    >
      <div className="cursor-pointer">▲</div>
      <div className="cursor-name">{cursor.name}</div>
    </div>
  ))}
</div>
```

**2.5 Add CSS Styles (Lobby.css)**

```css
.lobby-area {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.lobby-cursor {
  position: absolute;
  pointer-events: none;
  z-index: 100;
  transition: left 0.05s linear, top 0.05s linear;
}

.lobby-cursor .cursor-pointer {
  color: #8A8BDF; /* primary color */
  font-size: 20px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.lobby-cursor .cursor-name {
  background: rgba(0, 0, 0, 0.8);
  color: #8A8BDF;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  margin-top: 4px;
}
```

**2.6 Server-Side Handler (LobbyManager.js)**

Add new method:
```javascript
handleLobbyCursor(socket, data) {
  const lobby = this.getLobbyForSocket(socket.id);
  if (!lobby) return;

  const player = lobby.players.get(socket.id);
  if (!player) return;

  // Validate and clamp coordinates
  const x = Math.max(0, Math.min(100, parseFloat(data.x) || 0));
  const y = Math.max(0, Math.min(100, parseFloat(data.y) || 0));

  // Broadcast to others in lobby
  socket.broadcast.to(lobby.code).emit('lobby_cursor_update', {
    playerId: socket.id,
    playerName: player.name,
    x,
    y
  });
}
```

Hook up in server/src/index.js:
```javascript
socket.on('lobby_cursor_move', (data) => {
  lobbyManager.handleLobbyCursor(socket, data);
});
```

Add cleanup to leaveLobby():
```javascript
socket.broadcast.to(lobby.code).emit('lobby_cursor_remove', {
  playerId: socket.id
});
```

---

### Phase 3: Persistent Lobbies with Gamemode Selection

**Files to Modify:**
- `server/src/lobby/LobbyManager.js`
- `server/src/games/ImposterGame.js`
- `server/src/games/ConnectionsGame.js`
- `client/src/App.jsx`
- `client/src/pages/Lobby.jsx`
- `client/src/pages/Home.jsx`
- `client/src/pages/ImposterGame.jsx`
- `client/src/pages/ConnectionsGame.jsx`

**Changes:**

**3.1 Update Lobby State Machine**

Current states: `waiting`, `playing`
New states: `waiting`, `selecting`, `playing`

**3.2 Modify Lobby Creation (LobbyManager.js:14-36)**

Change:
```javascript
const lobby = {
  code: lobbyCode,
  gameType: null, // NOW: null until selected
  host: socket.id,
  players: new Map([[socket.id, { id: socket.id, name: playerName, isHost: true }]]),
  settings: {},
  game: null,
  state: 'selecting' // Start in gamemode selection
};
```

**3.3 Add Gamemode Selection Handler (LobbyManager.js)**

```javascript
selectGamemode(socket, data) {
  const lobbyCode = this.socketToLobby.get(socket.id);
  const lobby = this.lobbies.get(lobbyCode);

  if (!lobby || lobby.host !== socket.id) {
    return; // Only host can select gamemode
  }

  const { gameType, settings } = data;

  if (!['imposter', 'connections'].includes(gameType)) {
    return;
  }

  lobby.gameType = gameType;
  lobby.settings = settings || {};
  lobby.state = 'waiting'; // Move to waiting state

  this.broadcastLobbyUpdate(lobbyCode);
}
```

**3.4 Fix Game End to Return to Selection (ImposterGame.js:268-289)**

Replace:
```javascript
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

  // Reset lobby for next game
  setTimeout(() => {
    this.lobby.state = 'selecting'; // Return to gamemode selection
    this.lobby.gameType = null;
    this.lobby.game = null;

    // Get LobbyManager instance and broadcast update
    // (This requires passing lobbyManager to game constructor)
    this.lobbyManager.broadcastLobbyUpdate(this.lobbyCode);
  }, 5000);
}
```

**3.5 Fix Game End for Connections (ConnectionsGame.js:194-205)**

Replace:
```javascript
endGame(won) {
  this.phase = won ? 'won' : 'lost';

  this.io.to(this.lobbyCode).emit('connections_end', {
    won,
    categories: this.categories,
    solvedCategories: this.solvedCategories
  });

  // Return lobby to selection after 5 seconds
  setTimeout(() => {
    this.lobby.state = 'selecting';
    this.lobby.gameType = null;
    this.lobby.game = null;

    this.lobbyManager.broadcastLobbyUpdate(this.lobbyCode);
  }, 5000);
}
```

**3.6 Pass LobbyManager to Games**

Modify game constructors to receive lobbyManager:

ImposterGame.js:
```javascript
constructor(io, lobby, lobbyManager) {
  this.io = io;
  this.lobby = lobby;
  this.lobbyManager = lobbyManager; // NEW
  this.lobbyCode = lobby.code;
  // ... rest ...
}
```

Update calls in LobbyManager.startGame():
```javascript
if (lobby.gameType === 'imposter') {
  lobby.game = new ImposterGame(this.io, lobby, this);
  lobby.game.start();
} else if (lobby.gameType === 'connections') {
  lobby.game = new ConnectionsGame(this.io, lobby, this);
  lobby.game.start();
}
```

**3.7 Update Client Routing (App.jsx)**

Change:
```javascript
const [screen, setScreen] = useState('home');
const [lobbyData, setLobbyData] = useState(null);

const goToLobby = (data) => {
  setLobbyData(data);
  setScreen('lobby');
};

const startGame = (gameType) => {
  setScreen(gameType);
};

const returnToLobby = (data) => {
  // Return to lobby after game ends
  setLobbyData(data);
  setScreen('lobby');
};

const goHome = () => {
  setScreen('home');
  setLobbyData(null);
};
```

Update game components:
```javascript
{screen === 'imposter' && <ImposterGame onEnd={returnToLobby} lobbyData={lobbyData} />}
{screen === 'connections' && <ConnectionsGame onEnd={returnToLobby} lobbyData={lobbyData} />}
```

**3.8 Update Lobby.jsx for Gamemode Selection**

Add gamemode selection UI when state is 'selecting':
```jsx
{lobby.state === 'selecting' && isHost && (
  <div className="gamemode-selection">
    <h2>Select Game Mode</h2>
    <div className="gamemode-buttons">
      <button onClick={() => selectGamemode('imposter')}>
        Imposter
      </button>
      <button onClick={() => selectGamemode('connections')}>
        Connections
      </button>
    </div>
  </div>
)}

{lobby.state === 'selecting' && !isHost && (
  <div className="waiting-for-host">
    Waiting for host to select game mode...
  </div>
)}
```

Add handler:
```javascript
const selectGamemode = (gameType) => {
  socket.emit('select_gamemode', { gameType, settings: {} });
};
```

**3.9 Listen for Return to Lobby (Lobby.jsx)**

Add to useEffect:
```javascript
socket.on('lobby_update', (updatedLobby) => {
  setLobby(updatedLobby);
  setIsHost(socket.id === updatedLobby.host);

  // Transition to game when state is 'playing'
  if (updatedLobby.state === 'playing' && lobby?.state !== 'playing') {
    onStartGame(updatedLobby.gameType);
  }

  // If state changed from 'playing' back to 'selecting', we're back in lobby
  // (Already on lobby screen, just update UI)
});
```

**3.10 Update Game End Screens**

ImposterGame.jsx - Change button:
```jsx
<button onClick={() => onEnd(lobbyData)}>Return to Lobby</button>
```

ConnectionsGame.jsx - Change button:
```jsx
<button onClick={() => onEnd(lobbyData)}>Return to Lobby</button>
```

**3.11 Remove Gamemode from Home.jsx Creation**

Simplify lobby creation (remove gameType selection):
```javascript
const createLobby = () => {
  if (!playerName.trim()) {
    setError('Please enter your name');
    return;
  }

  socket.emit('create_lobby', {
    playerName: playerName.trim()
  }, (response) => {
    if (response.success) {
      onJoinLobby(response.lobby);
    } else {
      setError(response.error);
    }
  });
};
```

Update server handler:
```javascript
createLobby(socket, data, callback) {
  const { playerName, settings } = data;
  const lobbyCode = nanoid();

  const lobby = {
    code: lobbyCode,
    gameType: null, // No gameType at creation
    host: socket.id,
    players: new Map([[socket.id, { id: socket.id, name: playerName, isHost: true }]]),
    settings: settings || {},
    game: null,
    state: 'selecting' // Start in selection mode
  };

  // ... rest of creation logic ...
}
```

---

### Phase 4: Lobby Browser / Lobby List

**Files to Modify:**
- `server/src/lobby/LobbyManager.js`
- `server/src/index.js`
- `client/src/pages/Home.jsx`
- `client/src/pages/Home.css`

**Implementation:**

**4.1 Add Lobby List Endpoint (LobbyManager.js)**

```javascript
getPublicLobbies() {
  const publicLobbies = [];

  for (const [code, lobby] of this.lobbies.entries()) {
    // Only show lobbies in 'selecting' or 'waiting' state
    if (lobby.state === 'selecting' || lobby.state === 'waiting') {
      publicLobbies.push({
        code: lobby.code,
        playerCount: lobby.players.size,
        state: lobby.state,
        gameType: lobby.gameType,
        hostName: lobby.players.get(lobby.host)?.name || 'Unknown'
      });
    }
  }

  return publicLobbies;
}
```

**4.2 Add Socket Event (index.js)**

```javascript
socket.on('get_lobby_list', (callback) => {
  const lobbies = lobbyManager.getPublicLobbies();
  callback({ success: true, lobbies });
});
```

**4.3 Update Home.jsx UI**

Add state:
```javascript
const [lobbyList, setLobbyList] = useState([]);
const [showLobbyList, setShowLobbyList] = useState(false);
```

Add polling for lobby list:
```javascript
useEffect(() => {
  if (!socket || !showLobbyList) return;

  const fetchLobbies = () => {
    socket.emit('get_lobby_list', (response) => {
      if (response.success) {
        setLobbyList(response.lobbies);
      }
    });
  };

  fetchLobbies();
  const interval = setInterval(fetchLobbies, 2000); // Poll every 2 seconds

  return () => clearInterval(interval);
}, [socket, showLobbyList]);
```

Add UI:
```jsx
<div className="home-options">
  <button onClick={() => setShowLobbyList(!showLobbyList)}>
    {showLobbyList ? 'Hide Lobby List' : 'Browse Lobbies'}
  </button>
  <button onClick={createLobby}>Create New Lobby</button>
</div>

{showLobbyList && (
  <div className="lobby-list">
    <h2>Available Lobbies</h2>
    {lobbyList.length === 0 ? (
      <p>No lobbies available. Create one!</p>
    ) : (
      <div className="lobbies">
        {lobbyList.map(lobby => (
          <div key={lobby.code} className="lobby-item">
            <div className="lobby-info">
              <span className="lobby-code">{lobby.code}</span>
              <span className="lobby-host">Host: {lobby.hostName}</span>
              <span className="lobby-players">{lobby.playerCount} players</span>
              <span className="lobby-gamemode">
                {lobby.gameType || 'Selecting gamemode'}
              </span>
            </div>
            <button onClick={() => quickJoinLobby(lobby.code)}>
              Join
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

Add quick join handler:
```javascript
const quickJoinLobby = (code) => {
  if (!playerName.trim()) {
    setError('Please enter your name first');
    return;
  }

  socket.emit('join_lobby', {
    lobbyCode: code,
    playerName: playerName.trim()
  }, (response) => {
    if (response.success) {
      onJoinLobby(response.lobby);
    } else {
      setError(response.error);
    }
  });
};
```

**4.4 Add CSS Styles**

```css
.lobby-list {
  margin-top: 20px;
  width: 100%;
  max-width: 600px;
}

.lobbies {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.lobby-item {
  background: var(--dark);
  padding: 15px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lobby-info {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.lobby-code {
  font-size: 18px;
  font-weight: bold;
  color: var(--primary);
}

.lobby-host,
.lobby-players,
.lobby-gamemode {
  font-size: 14px;
  color: var(--text);
}
```

---

## Implementation Order

1. **Phase 1** (Critical Bugs): Fix cursor tracking issues
2. **Phase 2** (Fun Feature): Add lobby cursors
3. **Phase 3** (Core Feature): Persistent lobbies with gamemode selection
4. **Phase 4** (UX Enhancement): Lobby browser

---

## Testing Plan

**Phase 1 Testing:**
- [ ] Create Connections game with 2+ players
- [ ] Verify cursors don't show duplicate for sender
- [ ] Move cursor outside board bounds, verify it clamps to 0-100%
- [ ] Have player disconnect mid-game, verify cursor disappears for others
- [ ] Check console for validation errors with malformed data

**Phase 2 Testing:**
- [ ] Create lobby with 2+ players
- [ ] Verify cursors appear in lobby screen
- [ ] Move cursor around, verify smooth tracking
- [ ] Have player leave, verify cursor disappears

**Phase 3 Testing:**
- [ ] Create lobby, verify gamemode selection screen appears
- [ ] Select gamemode as host, verify game starts
- [ ] Complete game, verify return to lobby with gamemode selection
- [ ] Play multiple games in same lobby
- [ ] Have all players leave after game, verify lobby persists briefly

**Phase 4 Testing:**
- [ ] Create multiple lobbies
- [ ] Browse lobby list, verify all appear
- [ ] Join lobby from list
- [ ] Verify lobbies in 'playing' state don't appear in list
- [ ] Verify lobby list updates in real-time

---

## Risk Assessment

**Low Risk:**
- Cursor tracking fixes (isolated changes)
- Lobby cursor feature (additive, doesn't break existing flow)

**Medium Risk:**
- Game end flow changes (must ensure lobby_update broadcasts work)
- Lobby state machine changes (affects routing logic)

**High Risk:**
- Removing gameType from lobby creation (breaks existing contract)
- Game component prop changes (requires careful coordination)

---

## Rollback Plan

If issues arise:
1. Phase 1: Revert ConnectionsGame.js and ConnectionsGame.jsx cursor changes
2. Phase 2: Remove lobby cursor event handlers, no impact on existing features
3. Phase 3: Revert to game-ends-go-home flow
4. Phase 4: Remove lobby list UI, keep manual code entry

---

## Questions for Clarification

1. Should lobbies persist indefinitely if players stay, or timeout after X minutes?
2. Should there be a "ready" system for players before starting games?
3. Should non-host players be able to suggest gamemodes (voting system)?
4. Should lobby list show in-progress games as spectatable?
5. Maximum lobby capacity? (Currently no limit)

---

## Estimated Implementation Time

- Phase 1: 30 minutes
- Phase 2: 45 minutes
- Phase 3: 90 minutes
- Phase 4: 60 minutes

**Total: ~3.5 hours**

---

**Next Steps:** Awaiting approval to proceed with implementation.
