# Troubleshooting "Connecting to server..."

If you're stuck on "Connecting to server...", follow these steps:

## 1. Check Vercel Environment Variable

Your frontend needs to know where your backend is!

1. Go to https://vercel.com/dashboard
2. Click on your project (`mungers-minigames`)
3. Go to **Settings** → **Environment Variables**
4. Check if `VITE_SERVER_URL` exists
5. It should be set to: `https://mungers-minigames-server.onrender.com` (your Render URL)

**Important:**
- ✅ Must start with `https://` (not `http://`)
- ✅ Must be your exact Render URL
- ❌ No trailing slash `/`

If you need to add/edit it:
1. Add/Edit environment variable
2. Key: `VITE_SERVER_URL`
3. Value: `https://mungers-minigames-server.onrender.com`
4. Click **Save**
5. Go to **Deployments** tab
6. Click the 3 dots (...) on the latest deployment
7. Click **Redeploy**

## 2. Check Browser Console

1. Open your Vercel site
2. Press **F12** (or right-click → Inspect)
3. Go to **Console** tab
4. You should see one of these:

### ✅ Success:
```
Attempting to connect to: https://mungers-minigames-server.onrender.com
✅ Connected to server: https://mungers-minigames-server.onrender.com
```

### ❌ Error:
```
Attempting to connect to: undefined
❌ Connection error: ...
```

If you see `undefined`, the environment variable isn't set in Vercel!

## 3. Check Render Server is Running

1. Go to https://dashboard.render.com
2. Click on your web service
3. Check the status badge at the top
4. Should say: **Live** 🟢

If it says anything else:
- Click **Manual Deploy** → **Deploy latest commit**
- Wait 2-3 minutes

## 4. Verify CORS Settings

In Render dashboard:
1. Click your web service
2. Go to **Environment** tab
3. Check `CLIENT_URL` variable
4. Should be: `https://mungers-minigames.vercel.app` (your Vercel URL)
5. **No trailing slash!**

If you edit it:
- Click **Save Changes**
- Wait for auto-redeploy (~2 min)

## 5. Test Render Server Directly

Open this URL in your browser:
```
https://mungers-minigames-server.onrender.com/health
```

You should see:
```json
{"status":"ok","lobbies":{"totalLobbies":0,"activeGames":0}}
```

If you get an error or timeout, your Render server isn't running properly.

## Quick Fix Checklist

- [ ] Vercel has `VITE_SERVER_URL` set correctly
- [ ] Render server shows "Live" status
- [ ] Render has `CLIENT_URL` set correctly
- [ ] Both URLs use `https://` (not `http://`)
- [ ] No trailing slashes on either URL
- [ ] Redeploy Vercel after changing environment variables
- [ ] Browser console shows "Connected to server"

## Still Not Working?

Check Render logs:
1. Render dashboard → Your service
2. Click **Logs** tab
3. Look for errors

Check browser console for CORS errors:
- If you see "blocked by CORS policy", double-check `CLIENT_URL` in Render matches your Vercel URL exactly

## Local Testing

To test everything works locally:

```bash
cd "/mnt/c/_Projects/mungers minigames"
npm run dev
```

Open http://localhost:5173 - it should connect immediately to the local server.

If local works but production doesn't, it's definitely an environment variable issue!
