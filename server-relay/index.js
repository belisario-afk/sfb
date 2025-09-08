/* SFB TikTok Relay (CJS)
   - Works with tiktok-live-connector v1.x (TikTokLiveConnection default) and v2.x (WebcastPushConnection named).
   - WS path: /ws
   - Client subscribe payload:
       { "type":"subscribe", "platform":"tiktok", "room":"<tiktok_username>" }
   - Broadcast shape:
       { type:'chat', platform:'tiktok', userId, username, displayName, avatarUrl, text, ts }
*/

const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 10000;
const DEFAULT_ROOM = (process.env.TIKTOK_USERNAME || '').trim();
const SERVICE_NAME = process.env.SERVICE_NAME || 'sfb-relay';

let ConnectorCtor = null;
let connectorVersion = 'unknown';
let connectorName = 'unknown';
try {
  const mod = require('tiktok-live-connector');
  // v1: module is a constructor; v1 ESM: default is constructor;
  // v2: named export WebcastPushConnection
  if (typeof mod === 'function') {
    ConnectorCtor = mod;
    connectorName = 'TikTokLiveConnection(default)';
  } else if (mod && typeof mod.default === 'function') {
    ConnectorCtor = mod.default;
    connectorName = 'TikTokLiveConnection(default)';
  } else if (mod && typeof mod.WebcastPushConnection === 'function') {
    ConnectorCtor = mod.WebcastPushConnection;
    connectorName = 'WebcastPushConnection';
  } else if (mod && typeof mod.TikTokLiveConnection === 'function') {
    ConnectorCtor = mod.TikTokLiveConnection;
    connectorName = 'TikTokLiveConnection(named)';
  }
  try {
    connectorVersion = require('tiktok-live-connector/package.json').version || 'unknown';
  } catch {}
  if (ConnectorCtor) {
    console.log(`[Relay] Loaded tiktok-live-connector v${connectorVersion} (${connectorName})`);
  } else {
    console.warn('[Relay] tiktok-live-connector loaded but no compatible constructor export was found.');
  }
} catch (e) {
  console.error('[Relay] Failed to load tiktok-live-connector:', e?.message || e);
  console.warn('[Relay] TikTok connector unavailable. Relay will NOT stream live chat.');
}

const app = express();
app.use(cors());
app.disable('x-powered-by');

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** username -> { conn, clients:Set<WebSocket>, refCount:number } */
const rooms = new Map();

function getStatus() {
  const active = Array.from(rooms.entries()).map(([k, v]) => ({
    room: k,
    clients: v.clients.size,
    state: v.conn?.state || 'n/a'
  }));
  return {
    status: 'ok',
    service: SERVICE_NAME,
    tiktok: DEFAULT_ROOM || '',
    disabled: !ConnectorCtor,
    connector_version: connectorVersion,
    connector_name: connectorName,
    uptime_sec: Math.round(process.uptime()),
    activeRooms: active
  };
}

app.get('/', (_req, res) => {
  res.json(getStatus());
});

function ensureRoom(username) {
  const key = String(username || '').trim().toLowerCase();
  if (!key) return null;
  if (rooms.has(key)) return rooms.get(key);

  if (!ConnectorCtor) {
    console.warn('[Relay] TikTok module unavailable; cannot create room:', key);
    const placeholder = { conn: null, clients: new Set(), refCount: 0 };
    rooms.set(key, placeholder);
    return placeholder;
  }

  // Options are forward-compatible; unknown keys are ignored in v2.
  const conn = new ConnectorCtor(key, {
    enableWebsocketUpgrade: true
  });

  conn.on('connected', () => console.log('[Relay] Connected to TikTok room:', key));
  conn.on('disconnected', () => console.log('[Relay] Disconnected for', key));
  conn.on('streamEnd', () => console.log('[Relay] Stream ended for', key));
  conn.on('error', (err) => console.warn('[Relay] TikTok error for', key, err?.message || err));

  // Chat events (v1 and v2 both emit "chat" with similar fields)
  conn.on('chat', (data) => {
    const msg = normalizeChat(data);
    const room = rooms.get(key);
    if (!room) return;
    for (const ws of room.clients) {
      try { ws.send(JSON.stringify(msg)); } catch {}
    }
  });

  const room = { conn, clients: new Set(), refCount: 0 };
  rooms.set(key, room);
  return room;
}

function normalizeChat(d) {
  const userId = toStr(d?.userId || d?.user?.userId || '');
  const username = d?.uniqueId || d?.user?.uniqueId || '';
  const displayName = d?.nickname || d?.user?.nickname || username || 'viewer';
  const avatarUrl = d?.profilePictureUrl || d?.user?.profilePictureUrl || '';
  const text = d?.comment || d?.text || d?.message || '';
  return {
    type: 'chat',
    platform: 'tiktok',
    userId,
    username,
    displayName,
    avatarUrl,
    text,
    ts: Date.now()
  };
}
function toStr(v) { return (v === undefined || v === null) ? '' : String(v); }

wss.on('connection', (ws) => {
  let subscribedRoom = null;

  // Optional auto-bind default room
  if (DEFAULT_ROOM) {
    subscribedRoom = ensureRoom(DEFAULT_ROOM);
    if (subscribedRoom) {
      subscribedRoom.clients.add(ws);
      subscribedRoom.refCount += 1;
      if (subscribedRoom.conn && subscribedRoom.conn.state === 'disconnected') {
        subscribedRoom.conn.connect().catch((e) => {
          console.error('[Relay] Autoconnect error for', DEFAULT_ROOM, e?.message || e);
        });
      }
    }
  }

  ws.on('message', async (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }

    if (data?.type === 'ping' || data?.op === 'ping') {
      try { ws.send(JSON.stringify({ type: 'pong', ts: Date.now() })); } catch {}
      return;
    }

    if (data?.type === 'subscribe' && data?.platform === 'tiktok' && data?.room) {
      const username = String(data.room).trim();
      if (!username) return;
      const room = ensureRoom(username);
      if (!room) return;

      if (subscribedRoom && subscribedRoom !== room) {
        try {
          subscribedRoom.clients.delete(ws);
          subscribedRoom.refCount = Math.max(0, subscribedRoom.refCount - 1);
        } catch {}
      }

      room.clients.add(ws);
      subscribedRoom = room;
      room.refCount += 1;

      if (room.conn && room.conn.state === 'disconnected') {
        try {
          console.log('[Relay] Connecting to TikTok room:', username);
          await room.conn.connect();
        } catch (e) {
          console.error('[Relay] Connect error for', username, e?.message || e);
        }
      }
      return;
    }
  });

  ws.on('close', () => {
    if (subscribedRoom) {
      subscribedRoom.clients.delete(ws);
      subscribedRoom.refCount = Math.max(0, subscribedRoom.refCount - 1);
      scheduleRoomDisconnect(subscribedRoom);
    }
  });
});

function scheduleRoomDisconnect(room) {
  setTimeout(() => {
    if (room.refCount <= 0 && room.conn && room.conn.state !== 'disconnected') {
      try { room.conn.disconnect(); } catch {}
    }
  }, 15000);
}

server.listen(PORT, () => {
  if (!ConnectorCtor) {
    console.warn('[Relay] TikTok connector unavailable. Relay will NOT stream live chat.');
  }
  console.log(`[Relay] Listening on port ${PORT}`);
});