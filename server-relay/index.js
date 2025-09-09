/**
 * Hardened TikTok -> WebSocket relay
 * - Normalizes identity and event shape
 * - Prevents process crash on connector edge cases
 */
import 'dotenv/config';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { WebcastPushConnection } from 'tiktok-live-connector';

const PORT = Number(process.env.PORT || 10000);
const DEFAULT_ROOM = process.env.TIKTOK_ROOM || 'lmohss';

// Global hardening
process.on('uncaughtException', (err) => console.error('[Relay] UncaughtException:', err?.stack || err));
process.on('unhandledRejection', (reason) => console.error('[Relay] UnhandledRejection:', reason));

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('TikTok Relay');
  }
});

const wss = new WebSocketServer({ noServer: true });

const rooms = new Map(); // roomName -> { conn, clients:Set<ws> }

function normalizeUser(u = {}) {
  const base = u || {};
  return {
    userId: base.userId || base.user_id || base.id || base.uid || '',
    username: base.uniqueId || base.username || base.displayId || base.handle || '',
    displayName: base.nickname || base.displayName || base.uniqueId || base.username || '',
    avatarUrl:
      base.avatarThumb ||
      base.avatarThumbUrl ||
      base.profilePictureUrl ||
      (base.avatar && (base.avatar.thumbUrl || base.avatar.thumb_url)) ||
      base.avatarUrl ||
      ''
  };
}

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

function normalizeChat(ev = {}) {
  const user = normalizeUser(ev.user || ev.userInfo || ev);
  const text = ev.comment || ev.commentText || ev.text || ev.message || '';
  return {
    type: 'chat',
    platform: 'tiktok',
    ...user,
    text,
    ts: Date.now()
  };
}

function normalizeGift(ev = {}) {
  const user = normalizeUser(ev.user || ev.userInfo || ev);
  const details = ev.gift || ev.giftDetails || ev.gift_info || {};
  const repeatEnd = Boolean(ev.repeatEnd ?? ev.isRepeatEnd ?? ev.data?.repeatEnd ?? true);
  const coins = Number(
    ev.value ??
    ev.coins ??
    ev.diamondCount ??
    ev.count ??
    details.diamond_count ??
    details.diamondCount ??
    0
  ) || 0;
  const giftName = String(ev.giftName || details.name || details.gift_name || '');
  return {
    type: 'gift',
    platform: 'tiktok',
    ...user,
    giftId: details.gift_id || details.id || ev.giftId || '',
    giftName,
    value: coins,
    repeatEnd,
    ts: Date.now()
  };
}

async function ensureRoom(roomName) {
  if (rooms.has(roomName)) return rooms.get(roomName);
  const conn = new WebcastPushConnection(roomName);
  console.log('[Relay] Connecting to TikTok room:', roomName);

  conn
    .connect()
    .then(() => {
      console.log('[Relay] Connected:', roomName);
      broadcast(roomName, { type: 'connected', platform: 'tiktok', room: roomName, ts: Date.now() });
    })
    .catch((err) => {
      console.error('[Relay] Connect error for', roomName, err?.message || err);
      broadcast(roomName, { type: 'error', platform: 'tiktok', room: roomName, error: err?.message || String(err), ts: Date.now() });
    });

  conn.on('chat', (ev) => {
    try { broadcast(roomName, normalizeChat(ev)); }
    catch (e) { console.error('[Relay] chat normalize error:', e?.message || e); }
  });

  conn.on('gift', (ev) => {
    try { broadcast(roomName, normalizeGift(ev)); }
    catch (e) { console.error('[Relay] gift normalize error:', e?.message || e); }
  });

  conn.on('follow', (ev) => {
    const user = normalizeUser(ev?.user || {});
    broadcast(roomName, { type: 'follow', platform: 'tiktok', ...user, ts: Date.now() });
  });

  conn.on('roomUser', (ev) => {
    broadcast(roomName, { type: 'roomUser', platform: 'tiktok', viewerCount: ev?.viewerCount ?? ev?.data?.viewerCount ?? 0, ts: Date.now() });
  });

  conn.on('disconnected', () => {
    console.warn('[Relay] Disconnected from', roomName);
    broadcast(roomName, { type: 'disconnected', platform: 'tiktok', room: roomName, ts: Date.now() });
    // auto-reconnect
    setTimeout(() => conn.connect().catch(() => {}), 1500);
  });

  const bucket = { conn, clients: new Set() };
  rooms.set(roomName, bucket);
  return bucket;
}

server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let room = url.searchParams.get('room') || DEFAULT_ROOM;

    await ensureRoom(room);

    wss.handleUpgrade(req, socket, head, (ws) => {
      const bucket = rooms.get(room);
      bucket.clients.add(ws);
      ws.send(JSON.stringify({ type: 'subscribed', platform: 'tiktok', room, ts: Date.now() }));

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString('utf8'));
          if (msg?.type === 'subscribe' && msg?.room && typeof msg.room === 'string') {
            // Allow dynamic subscription change per client
            bucket.clients.delete(ws);
            room = msg.room;
            ensureRoom(room).then((b) => {
              b.clients.add(ws);
              ws.send(JSON.stringify({ type: 'subscribed', platform: 'tiktok', room, ts: Date.now() }));
            });
          }
        } catch {}
      });

      ws.on('close', () => {
        const b = rooms.get(room);
        b?.clients?.delete(ws);
      });
    });
  } catch (e) {
    console.error('[Relay] Upgrade error:', e?.message || e);
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log('[Relay] Listening on port', PORT);
  console.log('[Relay] Default room:', DEFAULT_ROOM);
});