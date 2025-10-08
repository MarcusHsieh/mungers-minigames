# Quick Start Guide 🚀

Get your arcade up and running in 5 minutes!

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment files
cp server/.env.example server/.env
cp client/.env.example client/.env

# 3. Start everything
npm run dev
```

That's it! Open http://localhost:5173 in your browser.

## Testing Locally

To test multiplayer features on your local machine:

1. Open http://localhost:5173 in your browser
2. Create a lobby and copy the 6-character code
3. Open a new incognito/private window at http://localhost:5173
4. Join the lobby using the code
5. Play!

## Testing with Friends on Your Network

If you want friends on the same WiFi to join:

1. Find your local IP address:
   - **Windows**: `ipconfig` (look for IPv4 Address)
   - **Mac/Linux**: `ifconfig` or `ip addr` (look for inet)

2. Update `client/.env`:
   ```env
   VITE_SERVER_URL=http://YOUR_LOCAL_IP:3000
   ```

3. Update `server/.env`:
   ```env
   CLIENT_URL=http://YOUR_LOCAL_IP:5173
   ```

4. Restart the dev server (`npm run dev`)

5. Share this URL with friends: `http://YOUR_LOCAL_IP:5173`

## Common Issues

### Port Already in Use

If you see "Port 3000 is already in use":
```bash
# Change the port in server/.env
PORT=3001

# And update client/.env
VITE_SERVER_URL=http://localhost:3001
```

### Can't Connect to Server

Make sure both server and client are running. Check the terminal for errors.

### Players Not Seeing Each Other

Make sure you're all in the same lobby (same 6-character code).

## Next Steps

- Read the full [README.md](./README.md) for deployment instructions
- Check out the code in `/server/src` and `/client/src`
- Add your own puzzles and word lists!

Enjoy! 🎮
