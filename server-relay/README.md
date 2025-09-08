# Song Fight Battle - TikTok Relay Server

Optional Node.js WebSocket relay that listens to TikTok Live chat and forwards messages to the browser client.

## How It Works

1. Uses `tiktok-live-connector` to connect to a TikTok live stream by username.
2. Listens to `chat` events and broadcasts minimized JSON objects:
   ```json
   {
     "type": "chat",
     "username": "viewer123",
     "message": "!vote A",
     "timestamp": 1736372622
   }
   ```
3. Browser connects via `ws(s)://<relay-host>/ws` and consumes these messages.

## Environment Variables

| Name | Required | Description |
|------|----------|-------------|
| `TIKTOK_USERNAME` | Yes | TikTok live username (`lmohss`) |
| `LOG_LEVEL` | No | `info` or `debug` |

## Local Run

```bash
cd server-relay
npm install
npm start
```

Server listens on `http://localhost:4000/`  
WebSocket endpoint: `ws://localhost:4000/ws`

## Render Deployment

1. Ensure this folder exists in your main repo.
2. Create new Web Service in Render.
3. Root Directory: `server-relay`
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Environment Variables:
   - `TIKTOK_USERNAME=lmohss`
   - `LOG_LEVEL=info`
7. Deploy.

Alternatively, `render.yaml` included for infra-as-code.

## Message Filtering

Currently all chat events are forwarded. You may adapt logic to:
- Filter duplicates
- Rate limit
- Add spam detection

## Error Handling

If disconnected, relay attempts to reconnect automatically in 10 seconds.

## Disclaimer

This is a prototype. TikTok's platform behavior or library APIs may change. Always test with a real stream.