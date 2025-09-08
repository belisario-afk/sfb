/**
 * Relay WebSocket client
 */

export function connectRelay(url, pushMessage) {
  let ws;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    console.error('Relay connect error', e);
    return null;
  }
  ws.onopen = () => {
    console.log('[Relay] Connected');
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
    } catch(e) {
      /* ignore */
    }
  };
  ws.onclose = () => {
    console.log('[Relay] Disconnected');
  };
  return ws;
}

export function disconnectRelay(ws) {
  if (ws) {
    try { ws.close(); } catch(e) {}
  }
}