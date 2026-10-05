# Bluff Battle deployment

Bluff Battle uses two services:

- Netlify hosts the Vite frontend.
- Render hosts the persistent Express and Socket.IO backend.

## Deploy the backend to Render

1. Push the repository to GitHub.
2. In Render, choose **New > Blueprint**.
3. Select the `HaRiThA1130/Bluff_battle` repository.
4. Render detects `render.yaml`.
5. Create the service.
6. After the service is created, copy its public URL.
7. Set the Render environment variable:

   ```text
   CLIENT_ORIGIN=https://your-site-name.netlify.app
   ```

8. Confirm the backend is healthy at:

   ```text
   https://your-backend-name.onrender.com/health
   ```

## Deploy the frontend to Netlify

1. In Netlify, choose **Add new site > Import an existing project**.
2. Select the GitHub repository.
3. Netlify detects `netlify.toml`.
4. Add this environment variable before deploying:

   ```text
   VITE_SERVER_URL=https://your-backend-name.onrender.com
   ```

5. Deploy the site.
6. Copy the final Netlify URL.
7. Update Render's `CLIENT_ORIGIN` with that exact URL.
8. Redeploy the Render service.

## Verify public multiplayer

1. Open the Netlify URL in two separate browsers or devices.
2. Create a room in the first browser.
3. Join with the room code in the second browser.
4. Start the game.
5. Submit explanations and votes from both clients.
6. Confirm the results and final winner screens.

## Local verification

```powershell
npm install
npm run check
node server.cjs
```

For local frontend development, use a separate terminal:

```powershell
npm run dev
```

When `CLIENT_ORIGIN` is not set, the backend allows local and development origins.
