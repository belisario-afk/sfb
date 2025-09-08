import { useEffect, useMemo, useRef, useState } from 'react';

// Minimal flexible chat hook that works with your relay output
export default function useChat({ mode = 'simulation', relayUrl, tiktokUsername }) {
  const listenersRef = useRef(new Set());
  const wsRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const unknownLoggedRef = useRef(false);

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

    let closed = false;
    let retryTimer = null;

    function connect() {
      setStatus('connecting');
      try {
        const ws = new WebSocket(relayUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus('connected');
          // Send subscribe (your relay expects this)
          if (tiktokUsername) {
            try {
              ws.send(JSON.stringify({ type: 'subscribe', platform: 'tiktok', room: tiktokUsername }));
              console.log('[Chat] Sent subscribe for', tiktokUsername);
            } catch {}
          }
        };

        ws.onmessage = (ev) => {
          let data;
          try { data = JSON.parse(ev.data); } catch {
            return;
          }

          // Ignore ACKs and service messages
          if (data?.type === 'subscribed' || data?.status === 'ok') {
            console.log('[Chat] Relay message:', data);
            return;
          }
          if (data?.type === 'ping') return;

          // Your relay already sends normalized messages
          // {type:'chat', platform:'tiktok', text, userId, username, displayName, avatarUrl, ts}
          if (data?.type === 'chat' && (data?.text || data?.comment || data?.message)) {
            const msg = {
              platform: data.platform || 'tiktok',
              userId: data.userId || '',
              username: data.username || '',
              displayName: data.displayName || data.username || 'viewer',
              avatarUrl: data.avatarUrl || '',
              text: data.text || data.comment || data.message || '',
              ts: data.ts || Date.now()
            };
            for (const fn of listenersRef.current) {
              try { fn(msg); } catch {}
            }
          } else if (!unknownLoggedRef.current) {
            unknownLoggedRef.current = true;
            console.warn('[Chat] Unknown message shape (once):', data);
          }
        };

        ws.onclose = () => {
          if (closed) return;
          setStatus('disconnected');
          retryTimer = setTimeout(connect, 1500);
        };
        ws.onerror = () => {};
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

  // Simple simulation
  useEffect(() => {
    if (mode !== 'simulation') return;
    setStatus('simulation');
    const names = ['Ava','Ben','Chloe','Dre'];
    let i = 0;
    const t = setInterval(() => {
      const name = names[i++ % names.length];
      const msg = {
        platform: 'sim',
        userId: 'sim_' + name,
        username: name.toLowerCase(),
        displayName: name,
        avatarUrl: '',
        text: i % 2 ? '!battle One More Time Daft Punk' : '!vote a',
        ts: Date.now()
      };
      for (const fn of listenersRef.current) { try { fn(msg); } catch {} }
    }, 3000);
    return () => clearInterval(t);
  }, [mode]);

  return api;
}