const express = require('express');
const http = require('http');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { initTikTokRelay } = require('./tiktokRelay');

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'sfb-relay',
    tiktok: process.env.TIKTOK_USERNAME || 'NOT_SET',
    uptime_sec: process.uptime()
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Set();

wss.on('connection', (socket) => {
  clients.add(socket);
  console.log('[Relay] Client connected. Total:', clients.size);

  socket.on('close', () => {
    clients.delete(socket);
    console.log('[Relay] Client disconnected. Total:', clients.size);
  });
});

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const c of clients) {
    if (c.readyState === 1) {
      try {
        c.send(data);
      } catch (e) {
        console.warn('[Relay] Send error:', e.message);
      }
    }
  }
}

initTikTokRelay({
  username: process.env.TIKTOK_USERNAME || 'lmohss',
  logLevel: process.env.LOG_LEVEL || 'info',
  onChat: (msg) => {
    if (!msg?.comment) return;
    broadcast({
      type: 'chat',
      username: msg.userUniqueId || msg.nickname || 'unknown',
      message: msg.comment,
      timestamp: Date.now()
    });
  }
});

server.listen(PORT, () => {
  console.log('[Relay] Listening on port', PORT);
});