/**
 * Relay WebSocket client with auto /ws path handling and retry.
 */
export function connectRelay(url, pushMessage) {
  if (!url) return null;

  // Ensure ws(s) scheme
  if (!/^wss?:/i.test(url)) {
    // Allow user to just paste host
    if (/^[a-z0-9.-]+$/i.test(url)) {
      url = 'wss://' + url;
    } else if (url.startsWith('//')) {
      url = 'wss:' + url;
    } else {
      // fallback, attempt wss
      url = 'wss://' + url.replace(/^\/+/, '');
    }
  }

  // Ensure path /ws (server expects it)
  try {
    const u = new URL(url);
    if (!u.pathname || u.pathname === '/' || u.pathname === '') {
      u.pathname = '/ws';
    }
    // If user typed a trailing slash but not /ws
    if (u.pathname !== '/ws' && !u.pathname.endsWith('/ws')) {
      // Only append if not already something meaningful
      if (!u.pathname.includes('/ws')) {
        if (u.pathname.endsWith('/')) u.pathname += 'ws';
        else u.pathname += '/ws';
      }
    }
    url = u.toString();
  } catch (e) {
    console.warn('[Relay] Invalid URL provided, cannot normalize:', e.message);
  }

  let ws;
  let closedByUser = false;
  let retries = 0;
  const maxRetries = 10;

  function scheduleReconnect() {
    if (closedByUser) return;
    if (retries >= maxRetries) {
      console.warn('[Relay] Max reconnect attempts reached.');
      return;
    }
    const delay = Math.min(5000, 500 + retries * 500);
    setTimeout(() => {
      retries++;
      connectInternal();
    }, delay);
  }

  function connectInternal() {
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error('[Relay] Immediate connection error:', e.message);
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      retries = 0;
      console.log('[Relay] Connected to', url);
    };
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'chat') {
          pushMessage({
            username: data.username,
            message: data.message,
            timestamp: data.timestamp || Date.now()
          });
        }
      } catch (e) {
        /* ignore */
      }
    };
    ws.onclose = () => {
      console.log('[Relay] Disconnected');
      scheduleReconnect();
    };
    ws.onerror = () => {
      // Let onclose handle reconnect
    };
  }

  connectInternal();

  return {
    close() {
      closedByUser = true;
      if (ws && ws.readyState === 1) ws.close();
    }
  };
}

export function disconnectRelay(handle) {
  if (handle && typeof handle.close === 'function') {
    handle.close();
  }
}