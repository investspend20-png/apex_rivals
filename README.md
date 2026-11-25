# Apex Rivals Online

Render deployment package for the Apex Rivals 2.2.1 Android APK. It serves the Metro Sprint game screen and runs the two-player race simulation, including the analog steering wheel, pedals, drift, and nitro.

## Deploy to Render

1. Extract the ZIP. Put its contents at the root of a Git repository and push it to a Git provider connected to Render.
2. In the Render dashboard, choose **New > Blueprint**, connect that repository, and deploy. The included `render.yaml` selects a single free Node web service and configures its health check.
3. Once the service is live, open its assigned HTTPS address. You should see the Apex Rivals screen. The `/health` path should return `ok`.

[Render Blueprint documentation](https://render.com/docs/infrastructure-as-code)

For an existing Render service, set the Build Command to `node --check server.mjs` and the Start Command to `node server.mjs`. Set Root Directory to the folder in the linked repository containing `server.mjs`, or leave it blank if the file is in the repository root.

For an existing deployment, replace the old server files with the contents of this ZIP, commit the changes to the branch Render deploys, and redeploy the same service. Its existing HTTPS address can be reused.

## Play from different networks

1. On the host phone, open Apex Rivals 2.2.1 and tap **Open invite**. Paste the Render HTTPS address with no room code and tap **Join**. The hosted game screen opens in the APK.
2. Tap **Create race**, then **Share**. Send that HTTPS room link to the other player.
3. The second player opens the APK, taps **Open invite**, and pastes the full room link. Tap **Join**, then **Join race** when the room screen opens. Both players tap **Ready**.

Start each hosted session through the Render address. The APK's **Home** button returns to the local phone-hosted game.

## Local development and free-tier behavior

Run `node server.mjs` with Node 22. The server has no npm dependencies. The server listens on `PORT`, or 3000 locally. It requires no database or application secrets. Rooms live in the process and disappear when both clients leave, after disconnect timeouts, or when the service restarts. Keep the service at one instance.

Render's free service may take about a minute to wake. The Render dashboard shows outbound usage. [Render free limits](https://render.com/docs/free)



