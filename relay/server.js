/* TikTok Live Relay WebSocket Server
   - Connects to TikTok Live chat using tiktok-live-connector
   - Serves WebSocket clients; clients subscribe by {type:'subscribe', platform:'tiktok', room: '<username>'}
   - Broadcasts normalized chat messages with name, avatar, text
*/
import 'dotenv/config.js';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import express from 'express';

// Dependency: tiktok-live-connector
import TikTokLiveConnection from 'tiktok-live-connector';

const PORT = process.env.PORT || 8080;
const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/** Rooms: username -> { conn: TikTokLiveConnection, clients: Set<WebSocket>, refCount: number } */
const rooms = new Map();

function ensureRoom(username) {
  const key = username.toLowerCase();
  if (rooms.has(key)) return rooms.get(key);

  const conn = new TikTokLiveConnection(key, {
    requestOptions: {
      // May need proxy or custom headers in some environments
    },
    enableWebsocketUpgrade: true
  });

  conn.on('streamEnd', () => {
    console.log('[Relay] Stream ended for', key);
  });

  conn.on('disconnected', () => {
    console.log('[Relay] Disconnected for', key);
  });

  // Main chat handler
  conn.on('chat', data => {
    const msg = {
      type: 'chat',
      platform: 'tiktok',
      userId: data?.userId?.toString?.() || data?.user?.userId?.toString?.() || '',
      username: data?.uniqueId || data?.user?.uniqueId || '',
      displayName: data?.nickname || data?.user?.nickname || data?.uniqueId || 'viewer',
      avatarUrl: data?.profilePictureUrl || data?.user?.profilePictureUrl || '',
      text: data?.comment || '',
      ts: Date.now()
    };
    const room = rooms.get(key);
    if (!room) return;
    for (const ws of room.clients) {
      try { ws.send(JSON.stringify(msg)); } catch {}
    }
  });

  // Start connection (connect on first subscriber)
  const room = { conn, clients: new Set(), refCount: 0 };
  rooms.set(key, room);
  return room;
}

wss.on('connection', (ws) => {
  let subscribedRoom = null;

  ws.on('message', async (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    if (data?.type === 'subscribe' && data?.platform === 'tiktok' && data?.room) {
      const username = String(data.room).trim();
      if (!username) return;
      const room = ensureRoom(username);
      room.clients.add(ws);
      subscribedRoom = room;
      room.refCount += 1;
      // connect if not connected
      try {
        if (!room.conn?.state || room.conn.state === 'disconnected') {
          console.log('[Relay] Connecting to TikTok room:', username);
          await room.conn.connect();
        }
      } catch (e) {
        console.error('[Relay] Connect error for', username, e?.message);
      }
    }
  });

  ws.on('close', () => {
    if (subscribedRoom) {
      subscribedRoom.clients.delete(ws);
      subscribedRoom.refCount -= 1;
      if (subscribedRoom.refCount <= 0) {
        // Optionally close connection after idle timeout
        setTimeout(() => {
          if (subscribedRoom.refCount <= 0) {
            try { subscribedRoom.conn.disconnect(); } catch {}
          }
        }, 15000);
      }
    }
  });
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok', ws: '/ws' });
});

server.listen(PORT, () => {
  console.log('TikTok Relay listening on :', PORT, ' ws path /ws');
});