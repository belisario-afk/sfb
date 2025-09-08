# Song Fight Battle - TikTok Relay Server (Updated)

This optional Node.js WebSocket relay listens to a TikTok Live chat and forwards chat messages to browser clients.

## Why Was It Updated?

- Previous config used `tiktok-live-connector@^1.7.0` which does not exist on npm, causing Render build failures.
- Converted to CommonJS for compatibility because the library publishes CJS.
- Correctly uses the `WebcastPushConnection` API.

## Install & Run Locally

```bash
cd server-relay
npm install
npm start
```

Endpoint:
- Health: `http://localhost:4000/`
- WebSocket: `ws://localhost:4000/ws`

## Environment Variables

| Name | Required | Description |
|------|----------|-------------|
| `TIKTOK_USERNAME` | Yes | TikTok username to connect to (no @) |
| `LOG_LEVEL` | No | `info` (default) or `debug` for verbose chat logging |
| `PORT` | No | Override port (default 4000) |

## Render Deployment

1. In Render, create new Web Service.
2. Root Directory: `server-relay`
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add Environment Variables:
   - `TIKTOK_USERNAME=lmohss`
   - `LOG_LEVEL=info`
6. (Optional) Add `NODE_VERSION=20` to force Node 20.

`render.yaml` included does this automatically.

## WebSocket Message Format

Each forwarded chat line:

```json
{
  "type": "chat",
  "username": "viewer123",
  "message": "!vote A",
  "timestamp": 1736372622000
}
```

## Client Integration

In the main app settings:
- Set Chat Mode: Relay
- Relay URL example: `wss://your-render-service.onrender.com/ws`

## Reconnect Logic

If TikTok disconnects:
- Automatic reconnect after 10s.
- If initial connect fails, retry after 15s.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails: version not found | Adjust `tiktok-live-connector` version (run `npm view tiktok-live-connector versions`) |
| No messages | Confirm the TikTok account is actually live |
| CORS issues | Relay only serves WS + a JSON status; no complex CORS needed |
| Node version mismatch | Ensure `.nvmrc` or `NODE_VERSION=20` in environment |

## License

MIT (inherits from parent repo).