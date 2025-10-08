# Deployment Guide - Munger's Arcade

This guide will help you deploy your arcade online so friends can play from anywhere!

## Overview

You need to deploy two parts:
1. **Backend** (Node.js server) - needs WebSocket support
2. **Frontend** (React app) - static site deployment

## Option 1: Render + Vercel (Recommended - Easiest)

### Step 1: Deploy Backend to Render

1. **Sign up** at [render.com](https://render.com)

2. **Create a new Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `mungers-arcade-server` (or any name)
     - **Region**: Choose closest to your location
     - **Branch**: `main`
     - **Root Directory**: `server`
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `node src/index.js`

3. **Add Environment Variables**:
   - `PORT`: `3000` (optional, Render auto-assigns)
   - `CLIENT_URL`: (leave blank for now, we'll add it after deploying frontend)
   - `NODE_ENV`: `production`

4. **Deploy!** Click "Create Web Service"
   - Wait for deployment (takes 2-3 minutes)
   - Copy your backend URL (looks like `https://mungers-arcade-server.onrender.com`)

### Step 2: Deploy Frontend to Vercel

1. **Sign up** at [vercel.com](https://vercel.com)

2. **Import Project**:
   - Click "Add New..." → "Project"
   - Import your GitHub repository
   - Configure:
     - **Framework Preset**: Vite
     - **Root Directory**: `client`
     - **Build Command**: `npm run build`
     - **Output Directory**: `dist`

3. **Add Environment Variable**:
   - Click "Environment Variables"
   - Add: `VITE_SERVER_URL` = `https://your-backend-url.onrender.com` (from Step 1)

4. **Deploy!** Click "Deploy"
   - Wait for deployment (takes 1-2 minutes)
   - Copy your frontend URL (looks like `https://mungers-arcade.vercel.app`)

### Step 3: Update Backend Environment

1. Go back to Render dashboard
2. Go to your Web Service → Environment
3. Update `CLIENT_URL` to your Vercel URL
4. Click "Save Changes" (this will redeploy automatically)

✅ **Done!** Share your Vercel URL with friends!

---

## Option 2: Fly.io (Best for Low Latency)

Fly.io deploys your apps close to users for ultra-low latency.

### Prerequisites
- Install [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/)
- Sign up: `fly auth signup`

### Deploy Backend

1. **Navigate to server directory**:
```bash
cd server
```

2. **Create Fly.io app**:
```bash
fly launch
```
- Choose app name (e.g., `mungers-arcade-server`)
- Choose region closest to your users
- Don't deploy yet (say 'N' when asked)

3. **Create `fly.toml`** in server directory:
```toml
app = "mungers-arcade-server"

[build]
  builder = "heroku/buildpacks:20"

[env]
  PORT = "8080"
  NODE_ENV = "production"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

4. **Set environment variables**:
```bash
fly secrets set CLIENT_URL=https://your-frontend-url.vercel.app
```

5. **Deploy**:
```bash
fly deploy
```

6. **Get your URL**:
```bash
fly info
```

### Deploy Frontend

Use Vercel (same as Option 1, Step 2) but use your Fly.io backend URL.

---

## Option 3: Railway (All-in-One)

Railway can host both frontend and backend.

1. **Sign up** at [railway.app](https://railway.app)

2. **Deploy from GitHub**:
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

3. **Add Two Services**:

   **Backend Service:**
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `node src/index.js`
   - Add environment variables:
     - `CLIENT_URL`: (add after frontend deployment)

   **Frontend Service:**
   - Root Directory: `client`
   - Build Command: `npm run build && npm install -g serve`
   - Start Command: `serve -s dist -l $PORT`
   - Add environment variable:
     - `VITE_SERVER_URL`: (your backend Railway URL)

4. **Generate Domains** for both services

5. **Update Environment Variables** with the respective URLs

---

## Option 4: Self-Hosted (Advanced)

If you have your own VPS (DigitalOcean, AWS EC2, etc.):

### Backend Setup

```bash
# On your server
git clone <your-repo-url>
cd "mungers minigames/server"

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
PORT=3000
CLIENT_URL=https://your-frontend-url.com
NODE_ENV=production
EOF

# Install PM2 (process manager)
npm install -g pm2

# Start server
pm2 start src/index.js --name arcade-server

# Save PM2 config
pm2 save
pm2 startup
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Frontend Setup

Deploy to Vercel/Netlify (easiest) or serve with Nginx:

```bash
cd client
npm run build

# Copy dist folder to /var/www/html or serve with nginx
```

---

## Post-Deployment Checklist

- [ ] Backend is running and accessible
- [ ] Frontend is running and accessible
- [ ] Frontend can connect to backend (check browser console)
- [ ] CORS is configured correctly (CLIENT_URL matches frontend)
- [ ] WebSocket connections work (test by creating a lobby)
- [ ] Players can join lobbies from different networks
- [ ] Games start and run correctly

## Troubleshooting

### "Failed to connect to server"
- Check `VITE_SERVER_URL` in frontend environment variables
- Make sure backend is running
- Check browser console for errors

### "CORS error"
- Make sure `CLIENT_URL` in backend matches your frontend URL exactly
- Don't include trailing slash in URLs

### "WebSocket connection failed"
- Make sure your hosting provider supports WebSockets
- Render, Fly.io, and Railway all support WebSockets
- Traditional serverless (AWS Lambda, etc.) do NOT support WebSockets

### "Players can't see each other"
- Check that both players are using the same lobby code
- Verify backend is broadcasting events correctly (check server logs)

## Monitoring

### Render
- View logs in dashboard → Logs tab
- Set up alerts for downtime

### Fly.io
```bash
fly logs
fly status
```

### Railway
- View logs in dashboard
- Railway auto-restarts on crashes

## Costs

**Free Tier Options:**
- **Vercel**: 100GB bandwidth/month (plenty for friends)
- **Render**: 750 hours/month free (always-on)
- **Fly.io**: Free tier includes 3 shared VMs
- **Railway**: $5 free credit/month

For a small friend group, everything should fit in free tiers!

## Scaling Up

If your arcade gets popular:
- Enable Redis for lobby persistence (optional)
- Add database for game history (optional)
- Use load balancer for multiple server instances
- Enable CDN for frontend assets
- Add analytics (Plausible, Umami)

---

## Need Help?

- Check server logs for errors
- Test locally first: `npm run dev`
- Verify environment variables are set correctly
- Make sure all URLs use `https://` (not `http://`)

Happy deploying! 🚀
