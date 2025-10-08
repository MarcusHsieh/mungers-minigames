# Munger's Arcade 🎮

A real-time multiplayer arcade featuring social deduction and puzzle games for friends!

## Games

### 🕵️ Imposter
A social deduction word game where players try to identify the imposters among them.

- **Players**: 3+ (recommended 4-8)
- **Roles**: Innocents receive a secret word, Imposters must blend in without knowing it
- **Gameplay**: Each round, players submit words related to the secret word. Then vote to eliminate suspected imposters!
- **Features**: Configurable game settings, turn timers, voting system

### 🧩 Connections
A collaborative word puzzle game inspired by NYT Connections.

- **Players**: 1+ (works great with 2-4 friends)
- **Goal**: Find groups of four words that share a common theme
- **Features**:
  - **Real-time cursor tracking** - see your friends' mouse movements
  - **Shared selections** - see what words others are considering
  - **Mega Mode** - combine multiple puzzles for extra challenge (auto-detects duplicate words)
  - **Persistent lobby** - players can join and leave anytime

## Tech Stack

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: React + Vite + Socket.IO Client
- **Real-time Communication**: WebSockets via Socket.IO

## Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone <your-repo-url>
cd "mungers minigames"
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables

For the server:
```bash
cp server/.env.example server/.env
```

For the client:
```bash
cp client/.env.example client/.env
```

4. Run in development mode
```bash
# Run both client and server concurrently
npm run dev

# Or run them separately:
npm run dev:server  # Server runs on http://localhost:3000
npm run dev:client  # Client runs on http://localhost:5173
```

5. Open your browser to `http://localhost:5173`

## How to Play

1. **Create a lobby**: Choose a game and enter your name
2. **Share the code**: Give the 6-character lobby code to your friends
3. **Start playing**: Once everyone joins, the host can start the game!

## Project Structure

```
mungers-minigames/
├── server/               # Backend server
│   ├── src/
│   │   ├── index.js     # Server entry point
│   │   ├── lobby/       # Lobby management
│   │   └── games/       # Game logic (Imposter, Connections)
│   └── package.json
│
├── client/              # Frontend React app
│   ├── src/
│   │   ├── pages/       # Game UI components
│   │   ├── context/     # Socket.IO context
│   │   └── main.jsx     # App entry point
│   └── package.json
│
└── package.json         # Workspace root
```

## Deployment

**Want to play with friends online?** See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

**Quick deployment options:**
1. **Render (Backend) + Vercel (Frontend)** - Easiest, both have free tiers
2. **Fly.io** - Best for low latency gaming
3. **Railway** - All-in-one solution
4. **Self-hosted** - VPS with Docker

All platforms support the WebSocket connections needed for real-time multiplayer.

## Roadmap

- [ ] Add more puzzles for Connections
- [ ] Create custom word packs for Imposter
- [ ] Add spectator mode
- [ ] Implement game statistics and leaderboards
- [ ] Add chat functionality
- [ ] Create more game modes

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

---

Built with ❤️ for game nights with friends
