import express from 'express';
import http from 'http';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { initTikTokRelay } from './tiktokRelay.js';

const PORT = process.env.PORT || 4000;
const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.json({ status:'ok', service:'sfb-relay', tiktok: process.env.TIKTOK_USERNAME });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Set();

wss.on('connection', (socket) => {
  clients.add(socket);
  console.log('[Relay] client connected, total:', clients.size);
  socket.on('close', () => {
    clients.delete(socket);
    console.log('[Relay] client disconnected, total:', clients.size);
  });
});

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const c of clients) {
    if (c.readyState === 1) {
      c.send(data);
    }
  }
}

// Initialize TikTok ingestion
initTikTokRelay({
  username: process.env.TIKTOK_USERNAME || 'lmohss',
  logLevel: process.env.LOG_LEVEL || 'info',
  onChat: (msg) => {
    broadcast({
      type: 'chat',
      username: msg.userUniqueId || msg.nickname || 'unknown',
      message: msg.comment || '',
      timestamp: Date.now()
    });
  }
});

server.listen(PORT, () => {
  console.log('[Relay] Listening on', PORT);
});