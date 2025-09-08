# Song Fight Battle (sfb)

TikTok-controlled Spotify-powered Song Battle Arena hosted on GitHub Pages.

Repository: https://github.com/belisario-afk/sfb  
GitHub Pages URL (production): https://belisario-afk.github.io/sfb/

## Overview

Viewers on TikTok Live submit songs using `!battle <song name or Spotify link>` which populates a queue. The system pairs songs head-to-head:

1. Two songs enter the arena with animated 3D album covers.
2. Round 1: 10 seconds preview of each (A then B initially).
3. Round 2: 20 seconds each (winner of Round 1 plays first).
4. Total per track: 30 seconds of 30s Spotify `preview_url` audio (no full playback required).
5. Live votes via `!vote A` / `!vote B`. Health bars animate relative to votes.
6. Winner announced with victory animation; loser shatters/fades. Immediately loads next pair if queue has songs.

Supports:
- Client-only mode (simulated or future TikTok in-browser capability).
- Optional relay server mode using `tiktok-live-connector` (Node.js on Render/Vercel/Fly/etc.).
- Spotify Auth via Authorization Code with PKCE (NO client secret stored).
- Demo / Simulation mode for local testing.

## Features

- React + Vite, Three.js (3D arena), Framer Motion + GSAP styled animations.
- PKCE-based Spotify OAuth (client side).
- Track search + queue management.
- Vote parsing from chat or simulation.
- Optional WebSocket relay for TikTok chat ingestion.
- GitHub Pages deployment (homepage + base path `/sfb/`).
- GitHub Action auto-deploy on push to `main`.
- Settings panel for switching chat source (Simulation / Direct / Relay).
- Fallback simulation mode for offline demo.
- Responsive, keyboard accessible controls (developer shortcuts).

## Technology Stack

| Layer      | Tech |
|------------|------|
| UI         | React 18, Vite |
| 3D         | Three.js |
| Animations | Framer Motion, GSAP |
| Auth       | Spotify PKCE |
| Chat Relay | Node.js, Express, WebSocket (`tiktok-live-connector`) |
| Deployment | GitHub Pages + Actions; optional Render for relay |

## Spotify Application Setup

1. Go to https://developer.spotify.com/dashboard
2. Create (or open) an app.
3. Set (Add) Redirect URIs (both of these):
   - `https://belisario-afk.github.io/sfb/callback`
   - `https://belisario-afk.github.io/sfb/`
4. Note the **Client ID** (already provided):  
   `927fda6918514f96903e828fcd6bb576`
5. No client secret is embedded; PKCE handles secure auth.
6. Ensure your app is in "Development" mode; for >25 users you must request production access.

## How PKCE Flow Works Here

1. User clicks "Login with Spotify".
2. We generate `code_verifier` + `code_challenge` (stored in `localStorage`).
3. Browser redirects to Spotify authorize endpoint.
4. Spotify redirects to `/sfb/callback` with `code`.
5. App exchanges `code` + `code_verifier` directly with `https://accounts.spotify.com/api/token`.
6. Access token + expiry stored in `localStorage`.
7. We only request scopes needed for search/playback of previews (no secret operations).

## Running Locally

Prerequisites: Node.js 18+ (Node 20 recommended), npm.

```bash
git clone https://github.com/belisario-afk/sfb
cd sfb
npm install
npm run dev
```

Local Dev URL: http://localhost:5173/sfb/  
(Note: Vite dev server may not automatically prefix; we set `base` in config. If issues, open root path.)

### Local Spotify Redirect During Dev

Add an additional redirect URI in Spotify dashboard for local testing if desired:

```
http://localhost:5173/sfb/callback
```

(Then update the app's allowed URIs; optional but recommended.)

### Build & Deploy (Local Manual)

```bash
npm run build
npm run deploy
```

The `deploy` script publishes `dist` to `gh-pages` branch via `gh-pages` npm utility.

## GitHub Pages Deployment (CI)

Already configured with `.github/workflows/deploy.yml`.  
On push to `main`, the workflow:

1. Installs dependencies
2. Builds static site
3. Publishes `dist` to `gh-pages` branch
4. Set GitHub Pages to serve from: `gh-pages` (root)

In repository settings:
- Settings > Pages
- Source: Deploy from a branch
- Branch: `gh-pages` / root
- Save.

Ensure `homepage` in `package.json` is `https://belisario-afk.github.io/sfb/`

## Commands

| Script          | Purpose |
|-----------------|---------|
| `npm run dev`   | Local dev (Vite) |
| `npm run build` | Production build (`dist/`) |
| `npm run preview` | Preview production build |
| `npm run deploy` | Publish to `gh-pages` |
| `npm run format` | (Optional future) |

## Chat Modes

1. Simulation Mode:
   - Generates randomized `!battle` and `!vote` events.
   - Use for testing without TikTok.

2. Relay Mode:
   - Connects to a deployed Node server (`server-relay`) via WebSocket (wss://).
   - The relay listens to TikTok Live and forwards standardized JSON events.

3. Direct (Placeholder / Future):
   - Placeholder for potential future in-browser only solutions.
   - Currently behaves similar to Simulation but without random injection unless toggled.

## Optional TikTok Relay Server (Render)

A subproject: `server-relay/`

### Deploy to Render (One-Click Flow)

1. Push this repository (or fork) so Render can access it.
2. On Render dashboard Click "New Web Service".
3. Select your repo.
4. Set root directory to `server-relay`.
5. Runtime: Node 20
6. Build Command: `npm install`
7. Start Command: `node index.js`
8. Environment Variables:
   - `PORT` (Render sets automatically)
   - `TIKTOK_USERNAME=lmohss`
   - (Optional) `LOG_LEVEL=info`
9. Deploy.

Or use `render.yaml` (Infrastructure-as-code). If root repo is connected, Render will detect and allow multi-service (only one here).

### Relay Protocol

- WebSocket path: `/ws`
- Messages to clients: JSON objects:
  ```json
  {
    "type": "chat",
    "username": "viewer123",
    "message": "!vote A",
    "timestamp": 1736372622
  }
  ```
- Server filters only meaningful messages to reduce noise (basic example included).
- Heartbeat pings every 30s.

### Local Relay Test

```bash
cd server-relay
npm install
npm start
```

Connect client settings to: `ws://localhost:4000/ws`

## Security Notes

- No Spotify client secret is included or required.
- Tokens stored in `localStorage` (acceptable for this prototype). Consider a short-living ephemeral store for production with refresh token rotation if expanding scopes.
- We only use preview URLs (30s) to stay within simple usage patterns.

## Game Flow Details (Spec Implementation)

Commands:
- `!battle <query or spotify track url>`
  - If `spotify:track:` or `https://open.spotify.com/track/` parse ID directly.
  - Else perform `type=track` search (limit=1).
- `!vote A` / `!vote B` (case-insensitive)

Stages:
1. `intro`
2. `round1A` (play A 10s)
3. `round1B` (play B 10s)
4. Determine round1 leader
5. `round2A` (leader 20s)
6. `round2B` (other 20s)
7. `finished` (winner animation)
8. Auto `nextBattle()` if queue length >= 2 else wait.

Votes accumulate continuously; health bars reflect ratio.

## Keyboard Shortcuts (Dev)

| Key | Action |
|-----|--------|
| `n` | Force next battle (if queue >= 2) |
| `p` | Pause/resume playback |
| `s` | Skip current stage |
| `r` | Reset votes (current battle) |
| `q` | Add a demo track pair |

## Configuration Storage

- `localStorage.spotifyClientId`
- `localStorage.spotifyTokens` (access_token, expires_at)
- `localStorage.chatMode`
- `localStorage.relayUrl`

## Simulated Tracks

Use the "Add Demo Tracks" button or simulation toggles to quickly populate queue.

## File Structure Recap

See tree at top of repository.

## Future Improvements (Not Implemented Yet but Structured For)

- Persist queue across reloads
- Multi-round tournaments / bracket visualization
- Real-time presence (viewer count, duplicate vote prevention)
- Anti-spam per-user cooldown

## License

MIT (see LICENSE file)

## Acknowledgements

- Spotify Web API
- tiktok-live-connector
- Three.js + Framer Motion communities

Enjoy the battles!