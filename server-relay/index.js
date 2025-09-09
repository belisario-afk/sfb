/**
 * Hardened TikTok -> WebSocket relay
 * - Prevents process crash on connector edge cases
 * - Normalizes gift events
 * - Logs connection lifecycle
 */
import 'dotenv/config';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { WebcastPushConnection } from 'tiktok-live-connector';

const PORT = Number(process.env.PORT || 10000);
const TIKTOK_ROOM = process.env.TIKTOK_ROOM || 'lmohss';

// Global hardening: never crash the process
process.on('uncaughtException', (err) => {
  console.error('[Relay] UncaughtException:', err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Relay] UnhandledRejection:', reason);
});

console.log('[Relay] Loaded tiktok-live-connector', process.env.npm_package_dependencies?.['tiktok-live-connector'], '(WebcastPushConnection)');

// HTTP server (for Render/health)
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200).end('ok');
  } else {
    res.writeHead(200).end('TikTok Relay');
  }
});

const wss = new WebSocketServer({ noServer: true });
const rooms = new Map(); // roomId -> { conn, clients:Set<ws> }

function broadcast(room, data) {
  const bucket = rooms.get(room);
  if (!bucket) return;
  const payload = JSON.stringify(data);
  for (const ws of bucket.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function normalizeUser(u = {}) {
  return {
    userId: u.userId || u.user_id || u.id || '',
    username: u.uniqueId || u.username || u.displayId || '',
    displayName: u.nickname || u.displayName || u.uniqueId || '',
    avatarUrl:
      u.avatarThumb ||
      u.avatarThumbUrl ||
      u.profilePictureUrl ||
      (u.avatar && (u.avatar?.thumb_url || u.avatar?.thumbUrl)) ||
      ''
  };
}

function normalizeGift(e) {
  const data = e || {};
  const user = normalizeUser(data.user || data.userInfo || data);
  const details = data.gift || data.giftDetails || data.gift_info || {};
  const repeatEnd = Boolean(
    data.repeatEnd ??
    data.isRepeatEnd ??
    data.data?.repeatEnd ??
    true
  );
  const coins = Number(
    data.value ??
    data.coins ??
    data.diamondCount ??
    data.count ??
    details.diamond_count ??
    details.diamondCount ??
    0
  ) || 0;
  const giftName = String(
    data.giftName ||
    details.name ||
    details.gift_name ||
    ''
  );

  return {
    type: 'gift',
    platform: 'tiktok',
    ...user,
    giftId: details.gift_id || details.id || data.giftId || '',
    giftName,
    value: coins,
    repeatEnd,
    ts: Date.now()
  };
}

async function connectRoom(roomName) {
  if (rooms.has(roomName)) return rooms.get(roomName);

  // Connector options: keep defaults; rely on our postinstall patch for legacy guard
  const tiktok = new WebcastPushConnection(roomName, {
    // If you see throttling or need different behavior, options can go here.
    // enableExtendedGiftInfo: true,
  });

  console.log('[Relay] Connecting to TikTok room:', roomName);

  // Lifecycle
  tiktok
    .connect()
    .then(state => {
      console.log('[Relay] Connected to TikTok room:', roomName);
      broadcast(roomName, { type: 'connected', platform: 'tiktok', room: roomName, state });
    })
    .catch(err => {
      console.error('[Relay] TikTok connect error for', roomName, err);
      broadcast(roomName, { type: 'error', platform: 'tiktok', room: roomName, error: err?.message || String(err) });
    });

  // Events
  tiktok.on('gift', (ev) => {
    try {
      broadcast(roomName, normalizeGift(ev));
    } catch (e) {
      console.error('[Relay] gift normalize error:', e?.message || e);
    }
  });

  tiktok.on('chat', (msg) => {
    try {
      const user = normalizeUser(msg?.user || {});
      const text = msg?.comment || msg?.commentText || msg?.text || '';
      broadcast(roomName, {
        type: 'chat',
        platform: 'tiktok',
        ...user,
        text,
        ts: Date.now()
      });
    } catch (e) {
      console.error('[Relay] chat normalize error:', e?.message || e);
    }
  });

  tiktok.on('follow', (ev) => {
    const user = normalizeUser(ev?.user || {});
    broadcast(roomName, { type: 'follow', platform: 'tiktok', ...user, ts: Date.now() });
  });

  tiktok.on('roomUser', (ev) => {
    broadcast(roomName, { type: 'roomUser', platform: 'tiktok', viewerCount: ev?.viewerCount ?? ev?.data?.viewerCount ?? 0, ts: Date.now() });
  });

  tiktok.on('disconnected', (ev) => {
    console.warn('[Relay] Disconnected from TikTok room:', roomName, ev || '');
    broadcast(roomName, { type: 'disconnected', platform: 'tiktok', room: roomName, ts: Date.now() });
    // Auto-reconnect
    setTimeout(() => {
      try {
        tiktok.connect().catch(() => {});
      } catch {}
    }, 2000);
  });

  const bucket = { conn: tiktok, clients: new Set() };
  rooms.set(roomName, bucket);
  return bucket;
}

// Upgrade HTTP -> WS
server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const room = url.searchParams.get('room') || TIKTOK_ROOM;
    await connectRoom(room);

    wss.handleUpgrade(req, socket, head, (ws) => {
      const bucket = rooms.get(room);
      bucket.clients.add(ws);
      console.log('[Relay] WS subscribe request for room "%s" from %s', room, req.socket.remoteAddress);
      ws.send(JSON.stringify({ type: 'subscribed', platform: 'tiktok', room, ts: Date.now() }));

      ws.on('close', () => {
        bucket.clients.delete(ws);
      });
    });
  } catch (e) {
    console.error('[Relay] Upgrade error:', e?.message || e);
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log('[Relay] Listening on port', PORT);
  console.log('[Relay] Created room:', TIKTOK_ROOM, '(WebcastPushConnection)');
});