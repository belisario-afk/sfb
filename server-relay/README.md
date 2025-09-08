# Song Fight Battle - TikTok Relay Server (Auto-Build Edition)

This version attempts to build `tiktok-live-connector` from its GitHub source if the prebuilt `dist/index.js` is absent.

## If You Just Want It to Work (No TikTok Right Now)

Set environment variable `TIKTOK_DISABLE=1` (Render or local).  
Use Simulation mode in the client.  
You can enable TikTok later by unsetting that variable.

## Install & Run

```bash
cd server-relay
npm install
npm start
```

The `postinstall` script tries to:
1. Detect absence of `node_modules/tiktok-live-connector/dist/index.js`
2. Run `npm install` and `npm run build` (or `compile`) inside that dependency.

## Environment Variables

| Name | Required | Description |
|------|----------|-------------|
| `TIKTOK_USERNAME` | Yes (unless disabled) | TikTok username (no @) |
| `LOG_LEVEL` | No | `info` or `debug` |
| `PORT` | No | Default 4000 |
| `TIKTOK_DISABLE` | No | Skip TikTok connection entirely |

## Routes

| Path | Method | Purpose |
|------|--------|---------|
| `/` | GET | Health/status JSON |
| `/ws` | WS | Chat stream |
| `/inject` | POST | Manually inject a chat message (payload: `{ "username": "...", "message": "!vote A" }`) |

## WebSocket Chat Message Format

```json
{
  "type": "chat",
  "username": "viewer123",
  "message": "!vote A",
  "timestamp": 1736372622000
}
```

Injected messages include `"injected": true`.

## Troubleshooting

| Problem | Action |
|---------|--------|
| Build fails inside dependency | Set `TIKTOK_DISABLE=1` to keep relay alive; investigate logs |
| No dist/index.js produced | Upstream changed build scripts; fork repo and prebuild or vendor minimal code |
| Reconnect loops | Stream offline or network instability |
| Long build time | Expected (building dependency). Consider caching or a fork with prebuilt dist |

## Strategy If Auto-Build Fails Repeatedly

1. Fork the TikTok connector repo.
2. Run its build locally; commit the built `dist/` into your fork.
3. Point dependency to your fork: `"tiktok-live-connector": "github:<you>/TikTok-Live-Connector#stable-prebuilt"`
4. Remove the postinstall script if no longer needed.

## License

MIT (inherits parent project).