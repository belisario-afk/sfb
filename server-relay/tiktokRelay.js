import TikTokLiveConnection from 'tiktok-live-connector';

/**
 * TikTok relay setup
 * NOTE: tiktok-live-connector may require adaptation based on upstream changes.
 * This is a simplified example that listens for chat messages.
 */
export function initTikTokRelay({ username, onChat, logLevel }) {
  if (!username) {
    console.error('[Relay] No TIKTOK_USERNAME provided.');
    return;
  }

  const connection = new TikTokLiveConnection(username, {
    requestOptions: {
      timeout: 10000
    },
    websocketOptions: {
      skipAliveCheck: false
    }
  });

  connection
    .connect()
    .then(state => {
      console.log(`[Relay] Connected to roomId: ${state.roomId}`);
    })
    .catch(err => {
      console.error('[Relay] Failed to connect', err);
    });

  connection.on('chat', data => {
    if (logLevel === 'debug') {
      console.log('[Relay] chat:', data);
    }
    onChat && onChat(data);
  });

  connection.on('disconnected', () => {
    console.log('[Relay] Disconnected - attempting reconnect in 10s.');
    setTimeout(() => {
      connection.connect().catch(()=>{});
    }, 10000);
  });

  connection.on('error', err => {
    console.error('[Relay] error:', err);
  });
}