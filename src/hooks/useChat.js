/**
 * useChat
 * Provides a uniform chat interface across three modes:
 *  - simulation: generates fake messages
 *  - relay: connects to a WebSocket relay (expects JSON messages with { user, text })
 *  - direct: placeholder (no messages unless sent manually)
 *
 * Returned shape:
 *  {
 *    mode,
 *    relayUrl,
 *    status: 'idle' | 'connecting' | 'open' | 'closed' | 'error',
 *    messages: Array<{ id, user, text, ts }>,
 *    send(text, user='you'),
 *    subscribe(fn),
 *    unsubscribe(fn)
 *  }
 *
 * Subscribers receive each new message object.
 */
import { useEffect, useRef, useState } from 'react';

const MAX_MESSAGES = 300;

let globalIdCounter = 0;
function makeId() {
  globalIdCounter += 1;
  return 'm' + globalIdCounter.toString(36);
}

export default function useChat({ mode = 'simulation', relayUrl } = {}) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle');
  const wsRef = useRef(null);
  const simTimerRef = useRef(null);
  const listenersRef = useRef(new Set());

  // Helper: broadcast to subscribers
  function emit(msg) {
    listenersRef.current.forEach(fn => {
      try { fn(msg); } catch (e) { /* ignore */ }
    });
  }

  // Safe add message
  function pushMessage(user, text) {
    if (!text) return;
    const msg = {
      id: makeId(),
      user: user || 'anon',
      text: text.toString(),
      ts: Date.now()
    };
    setMessages(prev => {
      const next = [...prev, msg];
      if (next.length > MAX_MESSAGES) next.splice(0, next.length - MAX_MESSAGES);
      return next;
    });
    emit(msg);
  }

  // Public send
  function send(text, user = 'you') {
    pushMessage(user, text);
    // Optionally send over relay if open
    if (mode === 'relay' && wsRef.current && wsRef.current.readyState === 1) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'chat', user, text }));
      } catch { /* ignore */ }
    }
  }

  // Simulation mode
  useEffect(() => {
    if (mode !== 'simulation') return;
    setStatus('open');
    // Boot a small initial set
    if (messages.length === 0) {
      pushMessage('system', 'Simulation chat started.');
    }
    simTimerRef.current = setInterval(() => {
      const picks = ['neo', 'trinity', 'morpheus', 'oracle', 'smith'];
      const verbs = ['votes', 'requests', 'adds', 'likes', 'queues'];
      const pick = picks[Math.floor(Math.random() * picks.length)];
      const verb = verbs[Math.floor(Math.random() * verbs.length)];
      const coin = Math.random();
      let text;
      if (coin < 0.25) {
        text = '!vote ' + (Math.random() > 0.5 ? 'A' : 'B');
      } else if (coin < 0.45) {
        text = '!battle ' + ['orbit', 'neon', 'groove', 'sunset', 'rain'].sort(()=>0.5-Math.random())[0];
      } else {
        text = `${verb} something cool`;
      }
      pushMessage(pick, text);
    }, 4000 + Math.random() * 3000);
    return () => clearInterval(simTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Relay mode (WebSocket)
  useEffect(() => {
    if (mode !== 'relay') {
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      return;
    }
    if (!relayUrl) {
      setStatus('error');
      pushMessage('system', 'Relay URL not set.');
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
        }
      } catch {
        // Non-JSON fallback
        pushMessage('relay', ev.data);
      }
    };

    return () => {
      try { ws.close(); } catch {}
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, relayUrl]);

  // Direct mode simply sets status open
  useEffect(() => {
    if (mode === 'direct') {
      setStatus('open');
      if (messages.length === 0) {
        pushMessage('system', 'Direct chat ready.');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Public subscription API
  function subscribe(fn) {
    if (typeof fn === 'function') {
      listenersRef.current.add(fn);
    }
    return () => unsubscribe(fn);
  }
  function unsubscribe(fn) {
    listenersRef.current.delete(fn);
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