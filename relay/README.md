# TikTok Live Relay

A tiny WebSocket relay that connects to TikTok Live chat (via `tiktok-live-connector`) and broadcasts normalized chat messages (name, avatar, text) to your web client.

## Run locally

1. Install deps:
   ```bash
   cd relay
   npm i
   ```
2. Start:
   ```bash
   npm run start
   ```
   The server listens on `http://localhost:8080` and `ws://localhost:8080/ws`.

## Client subscribe protocol

- Client connects to WebSocket (e.g., `ws://localhost:8080/ws`).
- On open, client sends:
  ```json
  { "type": "subscribe", "platform": "tiktok", "room": "<tiktok_username>" }
  ```
- The server broadcasts messages:
  ```json
  {
    "type": "chat",
    "platform": "tiktok",
    "userId": "123456789",
    "username": "user_uniqueid",
    "displayName": "Nice Viewer",
    "avatarUrl": "https://p16-sign-va.tiktokcdn.com/....jpeg",
    "text": "hello world",
    "ts": 1736112345123
  }
  ```

## Deploy

- Any Node host (Render, Railway, Fly.io, etc.)
- Ensure `/ws` WebSocket upgrades are allowed.
- Optionally set `PORT` via environment.

## Notes

- This relay maintains one `tiktok-live-connector` per TikTok username that has at least one subscriber. When no clients are subscribed for ~15s, the connector disconnects.
- `tiktok-live-connector` uses TikTok's public endpoints and can be subject to site changes. Keep the version up to date.