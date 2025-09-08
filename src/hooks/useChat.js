/**
 * Unified useChat hook
 * Modes:
 *  - simulation: generates fake chat messages with commands
 *  - relay: connects to a WebSocket URL (expects JSON { user, text } or plain text)
 *  - direct: passive
 *
 * Returns:
 * {
 *   mode, relayUrl, status,
 *   messages, send(text, user?),
 *   subscribe(fn), unsubscribe(fn)
 * }
 */
import { useEffect, useRef, useState } from 'react';

const MAX_MESSAGES = 400;
let globalMsgId = 0;
const nextId = () => 'm' + (++globalMsgId).toString(36);

export default function useChat({ mode = 'simulation', relayUrl } = {}) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle'); // idle|connecting|open|closed|error
  const wsRef = useRef(null);
  const simRef = useRef(null);
  const listeners = useRef(new Set());

  function emit(msg) {
    listeners.current.forEach(fn => {
      try { fn(msg); } catch {}
    });
  }

  function pushMessage(user, text) {
    if (!text) return;
    const msg = { id: nextId(), user: user || 'anon', text: text.toString(), ts: Date.now() };
    setMessages(prev => {
      const next = [...prev, msg];
      if (next.length > MAX_MESSAGES) next.splice(0, next.length - MAX_MESSAGES);
      return next;
    });
    emit(msg);
  }

  function send(text, user = 'you') {
    pushMessage(user, text);
    if (mode === 'relay' && wsRef.current && wsRef.current.readyState === 1) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'chat', user, text }));
      } catch {}
    }
  }

  // Simulation
  useEffect(() => {
    if (mode !== 'simulation') return;
    setStatus('open');
    if (messages.length === 0) pushMessage('system', 'Simulation started.');
    simRef.current = setInterval(() => {
      const users = ['ada', 'linus', 'grace', 'hopper', 'turing', 'lovelace'];
      const verbs = ['queues', 'likes', 'pings', 'votes', 'adds', 'requests'];
      const u = users[Math.random() * users.length | 0];
      const r = Math.random();
      let text;
      if (r < 0.25) text = '!vote ' + (Math.random() > 0.5 ? 'A' : 'B');
      else if (r < 0.47) {
        const q = ['orbit', 'neon', 'pulse', 'groove', 'sunset', 'drift'][Math.random() * 6 | 0];
        text = '!battle ' + q;
      } else {
        text = verbs[Math.random() * verbs.length | 0] + ' something';
      }
      pushMessage(u, text);
    }, 3500 + Math.random() * 3000);
    return () => clearInterval(simRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Relay
  useEffect(() => {
    if (mode !== 'relay') {
      if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
      return;
    }
    if (!relayUrl) {
      setStatus('error');
      pushMessage('system', 'Relay URL missing.');
      return;
    }
    setStatus('connecting');
    const ws = new WebSocket(relayUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      pushMessage('system', 'Relay connected.');
    };
    ws.onerror = () => {
      setStatus('error');
      pushMessage('system', 'Relay error.');
    };
    ws.onclose = () => {
      setStatus('closed');
      pushMessage('system', 'Relay closed.');
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data && (data.text || data.message)) {
          pushMessage(data.user || data.username || 'anon', data.text || data.message);
        } else {
          pushMessage('relay', ev.data);
        }
      } catch {
        pushMessage('relay', ev.data);
      }
    };

    return () => {
      try { ws.close(); } catch {}
      wsRef.current = null;
    };
  }, [mode, relayUrl]);

  // Direct
  useEffect(() => {
    if (mode === 'direct') {
      setStatus('open');
      if (messages.length === 0) pushMessage('system', 'Direct chat ready.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.current.add(fn);
    return () => unsubscribe(fn);
  }
  function unsubscribe(fn) {
    listeners.current.delete(fn);
  }

  return {
    mode,
    relayUrl,
    status,
    messages,
    send,
    subscribe,
    unsubscribe
  };
}