# Apex Rivals Online

Render deployment package for the Apex Rivals 2.7.0 Android APK. It serves the Metro Sprint game screen and runs the two-player race simulation, including the analog steering wheel, pedals, drift, and nitro.

## Deploy to Render

1. Extract the ZIP. Put its contents at the root of a Git repository and push it to a Git provider connected to Render.
2. In the Render dashboard, choose **New > Blueprint**, connect that repository, and deploy. The included `render.yaml` selects a single free Node web service and configures its health check.
3. Once the service is live, open its assigned HTTPS address. You should see the Apex Rivals screen. The `/health` path should return `ok`.

[Render Blueprint documentation](https://render.com/docs/infrastructure-as-code)

For an existing Render service, set the Build Command to `npm ci --omit=dev && node --check server.mjs` and the Start Command to `node server.mjs`. Set Root Directory to the folder in the linked repository containing `server.mjs`, or leave it blank if the file is in the repository root.

For an existing deployment, replace the old server files with the contents of this ZIP, commit the changes to the branch Render deploys, and redeploy the same service. Its existing HTTPS address can be reused.

## Play from different networks

1. On the host phone, open Apex Rivals 2.7.0 and tap **Open invite**. Paste the Render HTTPS address with no room code and tap **Join**. The hosted game screen opens in the APK.
2. Tap **Create race**, then **Share**. Send that HTTPS room link to the other player.
3. The second player opens the APK, taps **Open invite**, and pastes the full room link. Tap **Join**, then **Join race** when the room screen opens. Both players tap **Ready**.

Start each hosted session through the Render address. The APK's **Home** button returns to the local phone-hosted game.

## Local development and free-tier behavior

Run `node server.mjs` with Node 22. Install dependencies with `npm ci --omit=dev` before starting the server. The server listens on `PORT`, or 3000 locally. It requires no database or application secrets. Rooms live in the process and disappear when both clients leave, after disconnect timeouts, or when the service restarts. Keep the service at one instance.

Render's free service may take about a minute to wake. The Render dashboard shows outbound usage. [Render free limits](https://render.com/docs/free)









## Room voice chat

Install Apex Rivals 2.7.0 on both phones and redeploy this package to Render. Enter the hosted HTTPS game, join the same two-player room, then tap **Mic off · tap to talk** on each phone. Allow Android microphone access. **Voice connected** confirms the audio connection. Tap the mic button again to mute. Leaving the room, navigating away, or backgrounding the app stops local microphone capture. Each player starts with the mic off.

The lobby and race use the same voice connection. Solo practice and the phone-hosted HTTP game show no usable microphone control. Voice audio is exchanged through WebRTC. Render exchanges connection metadata for authenticated players in the same room.

The default STUN configuration may establish a direct connection on your networks. For networks requiring a relay, configure these environment variables on the Render service, then redeploy:

- `TURN_URL` contains one or more comma-separated `turn:` or `turns:` URLs supplied by your relay provider.
- `TURN_USERNAME` contains the relay username.
- `TURN_CREDENTIAL` contains the relay password.

Set all three values together. These credentials are supplied to authenticated room members for WebRTC connection setup. Use a limited relay credential appropriate for client use. TURN hosting is provided separately from this Render service. If **Voice blocked by network** appears, try the configured relay and toggle both microphones off and on.

Signaling and cleanup were tested automatically. Voice quality across two physical phones requires a live test on your networks after deployment.

## Online players and direct invitations

Version 2.7.0 adds an online lobby. Open **Online players**, enter a display name, and tap **Go online**. The button in the phone-hosted game opens your configured Render address. In the hosted game it opens the online panel. Players who have previously signed in reconnect automatically when opening the hosted game.

Choose your track and car before sending an invitation. Available players have an **Invite** button. The receiver sees the sender, track, and a 30-second countdown with **Accept** and **Reject**. The sender can cancel. Acceptance assigns both private race seats and loads the selected track. A race begins after both devices report that their race screen is loaded.

Each player uses a signed device credential saved in the hosted game's local storage. The server shows a short player ID alongside the display name. Names can repeat. Clearing app/browser storage creates a new identity. Active presence, recent players, requests, and matches live in memory. Recent Offline entries are retained for approximately two minutes. Restarting the server ends pending requests and active matches.

### Render settings for this update

- **Build Command** must be `npm ci --omit=dev && node --check server.mjs`. Upload `package-lock.json` with the other files so the new WebSocket dependency installs.
- **Start Command** stays `node server.mjs`.
- **PLAYER_SECRET** must be a long, randomly generated private value kept stable between deployments. The Blueprint generates it automatically. For an existing manually configured service, add it in Render's Environment settings. A random process-only fallback allows testing, but changes saved player IDs after a restart.
- Keep one service instance. The current lobby uses process memory for live state.

The lobby reconnects after network interruptions. Players go Offline when their connection closes, or after missing heartbeats. Pending requests expire after 30 seconds. Existing matches can resume after a brief reconnect while both room seats still exist. Backgrounding the app disconnects the lobby, and returning reconnects it. Notifications are shown inside the open game.

Two-client WebSocket tests cover availability, private seat assignment, unauthorized acceptance, rejection, cancellation, expiry, duplicate acceptance, and identity/match recovery. A live Render test across two phones remains necessary after deployment.
