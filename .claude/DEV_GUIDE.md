# AI Agent Development Guide - Munger's Minigames

This guide helps AI agents quickly understand and work with this codebase.

## Project Overview

**Munger's Minigames** is a real-time multiplayer arcade featuring two games:
1. **Imposter** - Social deduction word game (like Among Us meets word association)
2. **Connections** - Collaborative NYT-style puzzle with live cursors

**Tech Stack:**
- Backend: Node.js + Express + Socket.IO
- Frontend: React + Vite + Socket.IO Client
- Deployment: Render (backend) + Vercel (frontend)

## Project Structure

```
mungers-minigames/
├── server/                    # Backend
│   ├── src/
│   │   ├── index.js          # Main server entry, Socket.IO setup
│   │   ├── lobby/
│   │   │   └── LobbyManager.js   # Handles lobby creation, joining, game start
│   │   ├── games/
│   │   │   ├── ImposterGame.js   # Imposter game logic
│   │   │   └── ConnectionsGame.js # Connections game logic
│   │   └── data/
│   │       └── connections-archive.json  # NYT puzzle data
│   └── package.json
│
├── client/                    # Frontend
│   ├── src/
│   │   ├── main.jsx          # React entry point
│   │   ├── App.jsx           # Main app, screen routing
│   │   ├── context/
│   │   │   └── SocketContext.jsx  # Socket.IO client setup
│   │   └── pages/
│   │       ├── Home.jsx      # Game selection, lobby join/create
│   │       ├── Lobby.jsx     # Waiting room, settings
│   │       ├── ImposterGame.jsx   # Imposter UI
│   │       └── ConnectionsGame.jsx # Connections UI
│   └── package.json
│
└── .claude/
    └── DEV_GUIDE.md          # You are here!
```

## Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Run both server and client
npm run dev

# Or separately:
npm run dev:server  # http://localhost:3000
npm run dev:client  # http://localhost:5173
```

## Architecture Patterns

### Socket.IO Event Flow

**Critical timing issue to be aware of:**
The server must broadcast `lobby_update` BEFORE emitting game-specific events, otherwise clients won't have mounted the game component yet.

```javascript
// ✅ CORRECT (in LobbyManager.js)
lobby.state = 'playing';
this.broadcastLobbyUpdate(lobbyCode);  // Clients transition screens
setTimeout(() => {
  lobby.game = new ConnectionsGame(this.io, lobby);
  lobby.game.start();  // Now emits connections_start
}, 100);

// ❌ WRONG
lobby.game.start();  // Event fires before client is ready
this.broadcastLobbyUpdate(lobbyCode);
```

### Lobby System

**Server-side (LobbyManager.js):**
- Lobbies are stored in a `Map` with 6-character codes (nanoid)
- Each lobby tracks: code, gameType, host, players, settings, game instance, state
- Socket.IO rooms are used for lobby isolation (all events scoped to lobby)

**Client-side:**
- `Home.jsx` - Creates/joins lobbies via `create_lobby` and `join_lobby` events
- `Lobby.jsx` - Displays players, settings, transitions to game on `lobby_update` with state='playing'
- Each game component subscribes to its own events after mounting

### Game Patterns

**Imposter (Turn-based):**
- Server manages: role assignment, turn order, timers, voting, win conditions
- State: waiting → turn → voting → roundEnd → (repeat or gameEnd)
- Uses `setTimeout` for turn/vote timers (clear on unmount!)

**Connections (Real-time collaborative):**
- Server manages: puzzle loading, selection state, validation, mistakes
- Client sends: cursor positions (throttled to 20/sec), word selections, group submissions
- Puzzle merging checks for duplicate words to prevent ambiguity

## Color Scheme

```css
--primary: #8A8BDF     /* Light purple - buttons, accents */
--text: #E7CFCD        /* Soft pink/beige - main text */
--dark: #343434        /* Dark gray - cards */
--bg-start: #2F3061    /* Dark blue - gradient start */
--bg-end: #0E34A0      /* Bright blue - gradient end, highlights */
```

Apply consistently across all components.

## Common Issues & Solutions

### 1. CORS Errors
**Symptom:** `Access-Control-Allow-Origin` errors in console

**Fix:**
- Server strips trailing slashes from `CLIENT_URL` in `server/src/index.js`
- Render env var must match Vercel URL exactly (no trailing slash!)

### 2. Blank Screens / "Loading..." Forever
**Causes:**
- Socket.IO event timing (see Architecture Patterns above)
- Component unmounted before receiving event
- Event listener not properly set up

**Debug:**
- Add `console.log` in Socket event handlers
- Check server logs for event emissions
- Verify `socket.on()` listeners exist before events fire

### 3. WebSocket Connection Failures
**Symptoms:**
- Stuck on "Connecting to server..."
- `ERR_CONNECTION_REFUSED` in console

**Common Causes:**
- Missing `VITE_SERVER_URL` env var in Vercel
- `CLIENT_URL` mismatch in Render
- Render server sleeping (free tier spins down after inactivity)

**Debug:**
```javascript
// In SocketContext.jsx - always log connection attempts
console.log('Attempting to connect to:', serverUrl);
socket.on('connect_error', (err) => console.error('Error:', err));
```

### 4. Players Not Seeing Each Other
**Causes:**
- Not in same Socket.IO room
- Server not broadcasting to correct room
- Event handler missing `socket.id` check (might be overwriting own state)

**Fix:**
```javascript
// ✅ Always check if event is from another player
socket.on('cursor_update', (data) => {
  if (data.playerId !== socket.id) {  // Important!
    updateCursor(data);
  }
});
```

## Deployment Checklist

### Backend (Render)
- [ ] Root Directory: `server`
- [ ] Build Command: `npm install`
- [ ] Start Command: `node src/index.js`
- [ ] Environment Variables:
  - `NODE_ENV=production`
  - `CLIENT_URL=https://mungers-minigames.vercel.app` (NO trailing slash!)
- [ ] Health check path: `/health`

### Frontend (Vercel)
- [ ] Root Directory: `client`
- [ ] Framework: Vite
- [ ] Build Command: `npm run build`
- [ ] Output Directory: `dist`
- [ ] Environment Variables:
  - `VITE_SERVER_URL=https://mungers-minigames-server.onrender.com` (NO trailing slash!)

### After Deployment
- [ ] Test `/health` endpoint: `curl https://mungers-minigames-server.onrender.com/health`
- [ ] Check browser console for Socket.IO connection success
- [ ] Create test lobby and verify both players can join
- [ ] Test game start for both game types

## Adding New Games

To add a new game:

1. **Create game class** in `server/src/games/YourGame.js`
   - Constructor receives `(io, lobby)`
   - Implement `start()` method
   - Use `this.io.to(this.lobbyCode).emit()` for broadcasts

2. **Add to LobbyManager** in `server/src/lobby/LobbyManager.js`:
   ```javascript
   if (lobby.gameType === 'yourgame') {
     lobby.game = new YourGame(this.io, lobby);
     lobby.game.start();
   }
   ```

3. **Create UI component** in `client/src/pages/YourGame.jsx`
   - Use `useSocket()` hook for socket access
   - Set up event listeners in `useEffect`
   - Clean up listeners on unmount

4. **Add to Home.jsx** game selector

5. **Add to App.jsx** screen routing

## File Modification Guidelines

### When Editing Socket.IO Events

**Always:**
- Document the event in this guide if adding new ones
- Use TypeScript-style comments for event payloads:
  ```javascript
  // @event connections_start
  // @payload { words: string[], maxMistakes: number, isMegaMode: boolean }
  socket.on('connections_start', (data) => { ... });
  ```
- Clean up listeners in `useEffect` return function
- Check for `!socket` before setting up listeners

### When Editing Server Logic

**Always:**
- Add `console.log` for debugging (especially event emissions)
- Validate socket exists: `const lobby = this.getLobbyForSocket(socket.id); if (!lobby) return;`
- Use `.to(lobbyCode)` for room-scoped broadcasts
- Handle edge cases (player disconnects mid-game, etc.)

### When Editing UI Components

**Always:**
- Match color scheme (see Color Scheme section)
- Add loading states for async operations
- Show user-friendly error messages
- Use semantic HTML and accessible elements

## Testing Checklist

Before committing:

- [ ] Local server starts without errors: `npm run dev:server`
- [ ] Local client connects successfully: `npm run dev:client`
- [ ] Can create and join lobbies
- [ ] Both games start and play through
- [ ] Multiple players can join same lobby
- [ ] No console errors (check browser DevTools)
- [ ] No server errors (check terminal)

## Git Workflow

```bash
# Stage changes
git add -A

# Commit with descriptive message
git commit -m "Fix: [brief description of what was fixed]"

# Push to trigger auto-deploy
git push origin main
```

Both Render and Vercel auto-deploy on push to `main`.

## Useful Commands

```bash
# View server logs (if using PM2 locally)
pm2 logs arcade-server

# Test WebSocket connection
curl https://mungers-minigames-server.onrender.com/health

# Check Socket.IO events in browser console
# In DevTools Console:
socket.onAny((event, ...args) => console.log(event, args));
```

## Socket.IO Event Reference

### Lobby Events
- `create_lobby` (client → server): Create new lobby
- `join_lobby` (client → server): Join existing lobby
- `leave_lobby` (client → server): Leave current lobby
- `lobby_update` (server → clients): Lobby state changed
- `start_game` (client → server): Host starts game

### Imposter Events
- `game_start` (server → clients): Game starting, role reveal
- `round_start` (server → clients): New round beginning
- `turn_start` (server → clients): Player's turn to submit word
- `submit_word` (client → server): Submit word for current turn
- `word_submitted` (server → clients): Word was submitted
- `voting_start` (server → clients): Voting phase begins
- `cast_vote` (client → server): Vote for a player
- `voting_result` (server → clients): Voting results, elimination
- `game_end` (server → clients): Game over, winner revealed

### Connections Events
- `connections_start` (server → clients): Game starting with puzzle data
- `cursor_move` (client → server): Player moved cursor
- `cursor_update` (server → clients): Other player's cursor position
- `select_word` (client → server): Player selected/deselected word
- `selection_update` (server → clients): Other player's selection changed
- `submit_group` (client → server): Submit 4 words as group
- `category_solved` (server → clients): Category was correct
- `mistake_made` (server → clients): Wrong category submitted
- `connections_end` (server → clients): Game over (won/lost)

## Known Limitations

1. **Free Tier Cold Starts**: Render free tier spins down after 15 min inactivity. First request takes ~30 seconds.
2. **No Persistence**: Game state lost on server restart. No database = no game history.
3. **No Reconnection Logic**: If player disconnects mid-game, they can't rejoin.
4. **Imposter Word Database**: Currently hardcoded. Could be expanded with external API or larger dataset.
5. **Connections Puzzles**: Only 10 puzzles in archive. Need more for replayability.

## Future Enhancement Ideas

- [ ] Add player reconnection logic
- [ ] Persistent game history with database
- [ ] More Connections puzzles (scrape NYT archive)
- [ ] Spectator mode
- [ ] In-game chat
- [ ] Sound effects
- [ ] Mobile-optimized UI
- [ ] Custom word packs for Imposter
- [ ] Leaderboards/stats
- [ ] More games!

## Debugging Production Issues

**Render Logs:**
```
Dashboard → Your Service → Logs tab
```
Look for:
- Connection attempts
- Event emissions
- Error stack traces

**Vercel Logs:**
```
Dashboard → Project → Deployments → Click deployment → Runtime Logs
```
(Note: Most issues are client-side, use browser DevTools)

**Browser DevTools:**
- Console: Connection status, errors
- Network tab: WebSocket connection (ws:// or wss://)
- Application tab → Storage → Local Storage (check for cached data)

## Emergency Fixes

**If server is crashing:**
1. Check Render logs for error
2. Rollback to previous deployment in Render dashboard
3. Fix issue locally
4. Test thoroughly
5. Push fix

**If client won't connect:**
1. Verify `VITE_SERVER_URL` in Vercel settings
2. Redeploy Vercel (env vars require redeploy)
3. Check CORS settings in Render

**If game logic is broken:**
1. Check server logs for event emissions
2. Check browser console for received events
3. Add debug logging to trace event flow
4. Test locally to reproduce

---

## Quick Reference

**Local URLs:**
- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Health: http://localhost:3000/health

**Production URLs:**
- Frontend: https://mungers-minigames.vercel.app
- Backend: https://mungers-minigames-server.onrender.com
- Health: https://mungers-minigames-server.onrender.com/health

**Important Files:**
- Socket setup: `client/src/context/SocketContext.jsx`
- Lobby logic: `server/src/lobby/LobbyManager.js`
- CORS config: `server/src/index.js` (line 15-22)
- Screen routing: `client/src/App.jsx`

---

**Last Updated:** 2025-10-08
**Maintainer:** Claude Code + Marcus Hsieh
