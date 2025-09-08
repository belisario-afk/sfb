/**
 * TikTok relay using tiktok-live-connector (GitHub dependency).
 * Defensive load + optional disable switch.
 */
let WebcastPushConnection = null;

function safeLoadConnector() {
  try {
    const lib = require('tiktok-live-connector');
    if (lib.WebcastPushConnection) {
      WebcastPushConnection = lib.WebcastPushConnection;
      return true;
    }
    console.error('[Relay] tiktok-live-connector loaded but WebcastPushConnection missing.');
    return false;
  } catch (e) {
    console.error('[Relay] Failed to load tiktok-live-connector:', e.message);
    return false;
  }
}

function initTikTokRelay({ username, onChat, logLevel = 'info', onUnavailable }) {
  if (process.env.TIKTOK_DISABLE) {
    console.warn('[Relay] TIKTOK_DISABLE set. Skipping TikTok connection.');
    onUnavailable && onUnavailable();
    return null;
  }
  if (!username) {
    console.error('[Relay] No username provided; set TIKTOK_USERNAME env variable.');
    onUnavailable && onUnavailable();
    return null;
  }
  if (!safeLoadConnector()) {
    console.warn('[Relay] TikTok connector unavailable. Relay will NOT stream live chat.');
    onUnavailable && onUnavailable();
    return null;
  }

  const connection = new WebcastPushConnection(username, {
    processInitialData: true,
    enableExtendedGiftInfo: false,
    requestOptions: { timeout: 15000 }
  });

  function connect() {
    console.log('[Relay] Connecting to TikTok live for', username);
    connection.connect()
      .then(state => {
        console.log('[Relay] Connected. Room ID:', state.roomId);
      })
      .catch(err => {
        console.error('[Relay] Initial connect failed:', err.message);
        setTimeout(connect, 20000);
      });
  }

  connection.on('chat', data => {
    if (logLevel === 'debug') {
      console.log('[Relay][chat]', data.userUniqueId, ':', data.comment);
    }
    try {
      onChat && onChat(data);
    } catch (e) {
      console.error('[Relay] onChat handler error:', e);
    }
  });

  connection.on('disconnected', () => {
    console.warn('[Relay] Disconnected. Reconnecting in 12s...');
    setTimeout(connect, 12000);
  });

  connection.on('error', (err) => {
    console.error('[Relay] Error event:', err?.message || err);
  });

  connect();
  return connection;
}

module.exports = { initTikTokRelay };