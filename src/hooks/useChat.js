import { useEffect, useMemo, useRef, useState } from 'react';

// Normalize user identity from various payload shapes
function normalizeUser(u = {}) {
  const top = u || {};
  // Many relays send user under "user" or "userInfo"
  const base = top.user || top.userInfo || top;

  const userId =
    base.userId ||
    base.user_id ||
    base.id ||
    base.uid ||
    '';

  const username =
    base.uniqueId ||
    base.username ||
    base.displayId ||
    base.handle ||
    base.name ||
    '';

  const displayName =
    base.nickname ||
    base.displayName ||
    base.uniqueId ||
    base.username ||
    username ||
    'viewer';

  const avatarUrl =
    base.avatarUrl ||
    base.profilePictureUrl ||
    base.avatarThumbUrl ||
    base.avatarThumb ||
    (base.avatar && (base.avatar.thumbUrl || base.avatar.thumb_url)) ||
    top.avatarUrl || // fallback if already flattened
    '';

  return { userId, username, displayName, avatarUrl };
}

// Extract a chat text from various fields
function normalizeText(d = {}) {
  return (
    d.text ||
    d.comment ||
    d.commentText ||
    d.message ||
    ''
  );
}

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
          if (data?.type === 'subscribed' || data?.status === 'ok' || data?.type === 'ping') {
            console.log('[Chat] Relay message:', data);
            return;
          }

          // Normalize chat messages
          const isChat =
            data?.type === 'chat' ||
            data?.event === 'chat' ||
            data?.kind === 'chat' ||
            !!normalizeText(data);

          if (isChat) {
            const u = normalizeUser(data);
            const text = normalizeText(data);
            const out = {
              type: 'chat',
              platform: data.platform || 'tiktok',
              ...u,
              text,
              ts: data.ts || Date.now(),
              raw: data
            };
            for (const fn of listenersRef.current) {
              try { fn(out); } catch {}
            }
            return;
          }

          // Normalize gift messages and forward identity (used by hype/mega gifts)
          const isGift =
            data?.type === 'gift' ||
            data?.event === 'gift' ||
            data?.kind === 'gift' ||
            !!data?.gift || !!data?.giftDetails || !!data?.gift_info;

          if (isGift) {
            const u = normalizeUser(data);
            const out = {
              type: 'gift',
              platform: data.platform || 'tiktok',
              ...u,
              // Pass through useful raw fields; AppContext has parsers for value/name/repeatEnd
              giftName: data.giftName || data?.gift?.name || data?.giftDetails?.name || '',
              value: data.value || data.coins || data.diamondCount || 0,
              repeatEnd: data.repeatEnd ?? data.isRepeatEnd ?? true,
              data,
              ts: data.ts || Date.now(),
              raw: data
            };
            for (const fn of listenersRef.current) {
              try { fn(out); } catch {}
            }
            return;
          }

          if (!unknownLoggedRef.current) {
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

  // Simple simulation mode (optional identity)
  useEffect(() => {
    if (mode !== 'simulation') return;
    setStatus('simulation');
    const names = ['Ava','Ben','Chloe','Dre'];
    let i = 0;
    const t = setInterval(() => {
      const name = names[i++ % names.length];
      const msg = {
        type: 'chat',
        platform: 'simulation',
        userId: 'sim-' + name.toLowerCase(),
        username: name.toLowerCase(),
        displayName: name,
        avatarUrl: '',
        text: `!battle demo ${name}`,
        ts: Date.now()
      };
      for (const fn of listenersRef.current) fn(msg);
    }, 15000);
    return () => clearInterval(t);
  }, [mode]);

  return api;
}