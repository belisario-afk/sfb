import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * useChat
 * Modes:
 *  - simulation: local ticker, no network (for dev)
 *  - relay: WebSocket to your Node relay that streams TikTok chat
 *
 * Relay protocol:
 *  Client sends on open:
 *    { type: 'subscribe', platform: 'tiktok', room: <tiktokUsername> }
 *  Server broadcasts messages:
 *    {
 *      type: 'chat',
 *      platform: 'tiktok',
 *      userId, username, displayName, avatarUrl, text, ts
 *    }
 */
export default function useChat({ mode = 'simulation', relayUrl, tiktokUsername }) {
  const listenersRef = useRef(new Set());
  const wsRef = useRef(null);
  const [status, setStatus] = useState('idle');

  // Public API: subscribe to incoming messages
  const api = useMemo(() => ({
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listenersRef.current.add(fn);
      return () => listenersRef.current.delete(fn);
    },
    status
  }), [status]);

  useEffect(() => {
    if (mode !== 'relay') {
      setStatus('simulation');
      return;
    }
    if (!relayUrl) {
      setStatus('error:no-relay');
      return;
    }
    if (!tiktokUsername) {
      setStatus('error:no-username');
      return;
    }

    let closed = false;
    let retryTimer = null;

    function connect() {
      setStatus('connecting');
      try {
        const ws = new WebSocket(relayUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('connected');
          ws.send(JSON.stringify({
            type: 'subscribe',
            platform: 'tiktok',
            room: tiktokUsername
          }));
        };

        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data?.type === 'chat' && data?.text) {
              const msg = normalizeMessage(data);
              for (const fn of listenersRef.current) {
                try { fn(msg); } catch {}
              }
            }
          } catch {}
        };

        ws.onclose = () => {
          if (closed) return;
          setStatus('disconnected');
          retryTimer = setTimeout(connect, 1500);
        };
        ws.onerror = () => {
          // will trigger close
        };
      } catch {
        setStatus('error');
        retryTimer = setTimeout(connect, 2000);
      }
    }

    connect();
    return () => {
      closed = true;
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [mode, relayUrl, tiktokUsername]);

  // Simulation messages (dev)
  useEffect(() => {
    if (mode !== 'simulation') return;
    let i = 0;
    setStatus('simulation');
    const names = ['Ava', 'Ben', 'Chloe', 'Dre', 'Eve', 'Finn', 'Gia', 'Hank'];
    const timer = setInterval(() => {
      const name = names[i++ % names.length];
      const text = i % 3 === 0 ? '!vote a' : (i % 5 === 0 ? '!battle daft punk' : 'hello!');
      const msg = {
        platform: 'sim',
        userId: 'sim_' + name.toLowerCase(),
        username: name.toLowerCase(),
        displayName: name,
        avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
        text,
        ts: Date.now()
      };
      for (const fn of listenersRef.current) {
        try { fn(msg); } catch {}
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [mode]);

  return api;
}

function normalizeMessage(data) {
  return {
    platform: data.platform || 'tiktok',
    userId: data.userId || data.uniqueId || '',
    username: data.username || data.uniqueId || '',
    displayName: data.displayName || data.nickname || data.username || 'viewer',
    avatarUrl: data.avatarUrl || data.profilePictureUrl || '',
    text: data.text || '',
    ts: data.ts || Date.now()
  };
}