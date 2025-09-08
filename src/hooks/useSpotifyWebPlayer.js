/**
 * useSpotifyWebPlayer
 * Encapsulates loading and managing the Spotify Web Playback SDK.
 *
 * Returns:
 * {
 *   player,
 *   status: 'idle' | 'loading-script' | 'initializing' | 'ready' | 'error',
 *   deviceId,
 *   error,
 *   ready,
 *   transferPlayback(),
 *   reconnect(),
 *   disconnect()
 * }
 *
 * Build error fix:
 *  - Removed invalid optional‑chaining assignment (playerRef.current?._options?.getOAuthToken = ...)
 *    because you cannot assign via an optional chain. Replaced with a guarded if block.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

export default function useSpotifyWebPlayer({
  getAccessToken,
  name = 'Battle Player',
  volume = 0.8,
  autoTransfer = true
}) {
  const [status, setStatus] = useState('idle');
  const [deviceId, setDeviceId] = useState(null);
  const [error, setError] = useState(null);

  const playerRef = useRef(null);
  const initializedRef = useRef(false);
  const transferPendingRef = useRef(false);
  const scriptTagRef = useRef(null);

  // --------------------------------------------------
  // Load the SDK script (once)
  // --------------------------------------------------
  const ensureScript = useCallback(() => {
    if (window.Spotify) return Promise.resolve();

    const existing = document.getElementById('spotify-player-sdk');
    if (existing) {
      return new Promise((resolve) => {
        const check = () => {
          if (window.Spotify) resolve();
          else setTimeout(check, 40);
        };
        check();
      });
    }

    return new Promise((resolve, reject) => {
      setStatus('loading-script');
      const tag = document.createElement('script');
      tag.id = 'spotify-player-sdk';
      tag.src = SDK_URL;
      tag.async = true;
      tag.onload = () => {
        const check = () => {
          if (window.Spotify) resolve();
          else setTimeout(check, 25);
        };
        check();
      };
      tag.onerror = (e) => {
        setError('Failed to load Spotify SDK');
        reject(e);
      };
      document.head.appendChild(tag);
      scriptTagRef.current = tag;
    });
  }, []);

  // --------------------------------------------------
  // Cleanly disconnect / teardown
  // --------------------------------------------------
  const disconnect = useCallback(() => {
    try {
      if (playerRef.current && playerRef.current._options) {
        // Overwrite token getter with noop to cease refresh attempts
        playerRef.current._options.getOAuthToken = () => {};
      }
      playerRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    playerRef.current = null;
    setDeviceId(null);
    setStatus('idle');
    initializedRef.current = false;
  }, []);

  // --------------------------------------------------
  // Transfer playback to this device
  // --------------------------------------------------
  const transferPlayback = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setError('Cannot transfer: no token');
      return;
    }
    if (!deviceId) {
      setError('Cannot transfer: no deviceId');
      return;
    }
    try {
      transferPendingRef.current = true;
      const res = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ device_ids: [deviceId], play: false })
      });
      if (res.status !== 204) {
        const txt = await res.text();
        console.warn('[SpotifyPlayer] Transfer failed', res.status, txt);
        setError('Transfer failed: ' + res.status);
      } else {
        setError(null);
      }
    } catch (e) {
      console.warn('[SpotifyPlayer] Transfer error', e);
      setError('Transfer error');
    } finally {
      transferPendingRef.current = false;
    }
  }, [deviceId, getAccessToken]);

  // --------------------------------------------------
  // Initialize player instance
  // --------------------------------------------------
  const initPlayerInstance = useCallback(async () => {
    if (playerRef.current) return playerRef.current;

    const token = await getAccessToken();
    if (!token) {
      setError('Missing access token for player init');
      return null;
    }

    setStatus('initializing');

    const player = new window.Spotify.Player({
      name,
      volume,
      getOAuthToken: async (cb) => {
        try {
            const refreshed = await getAccessToken();
            if (refreshed) cb(refreshed);
            else cb(token);
        } catch {
            cb(token);
        }
      }
    });

    player.addListener('initialization_error', ({ message }) => {
      console.error('[SpotifyPlayer] initialization_error', message);
      setError(message);
      setStatus('error');
    });

    player.addListener('authentication_error', ({ message }) => {
      console.error('[SpotifyPlayer] authentication_error', message);
      setError(message);
      setStatus('error');
    });

    player.addListener('account_error', ({ message }) => {
      console.error('[SpotifyPlayer] account_error', message);
      setError(message);
      setStatus('error');
    });

    player.addListener('playback_error', ({ message }) => {
      console.warn('[SpotifyPlayer] playback_error', message);
      setError(message);
    });

    player.addListener('ready', ({ device_id }) => {
      console.log('[SpotifyPlayer] Ready. Device ID:', device_id);
      setDeviceId(device_id);
      setStatus('ready');
      setError(null);
      if (autoTransfer) {
        transferPlayback(); // async fire-and-forget
      }
    });

    player.addListener('not_ready', ({ device_id }) => {
      console.warn('[SpotifyPlayer] Device went offline', device_id);
      if (deviceId === device_id) setDeviceId(null);
    });

    const ok = await player.connect();
    if (!ok) {
      setStatus('error');
      setError('Could not connect player');
      return null;
    }

    playerRef.current = player;
    return player;
  }, [autoTransfer, deviceId, getAccessToken, name, transferPlayback, volume]);

  // --------------------------------------------------
  // Public reconnect (teardown + fresh init)
  // --------------------------------------------------
  const reconnect = useCallback(async () => {
    disconnect();
    await init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disconnect, getAccessToken]);

  // --------------------------------------------------
  // High-level init (only once)
  // --------------------------------------------------
  const init = useCallback(async () => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    try {
      await ensureScript();
      await initPlayerInstance();
    } catch (e) {
      console.error('[SpotifyPlayer] init failed', e);
      setError(e?.message || 'Unknown init error');
      setStatus('error');
    }
  }, [ensureScript, initPlayerInstance]);

  useEffect(() => {
    init();
    return () => {
      disconnect();
      // Keep script tag for page lifetime; removing is optional
    };
  }, [init, disconnect]);

  return {
    player: playerRef.current,
    status,
    deviceId,
    error,
    ready: status === 'ready' && !!deviceId,
    transferPlayback,
    reconnect,
    disconnect
  };
}

/* Utility: ensure the SDK script is present */
async function ensureScript() {
  if (window.Spotify) return;
  const existing = document.getElementById('spotify-player-sdk');
  if (existing) {
    await new Promise(resolve => {
      const check = () => {
        if (window.Spotify) resolve();
        else setTimeout(check, 40);
      };
      check();
    });
    return;
  }
  await new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.id = 'spotify-player-sdk';
    tag.src = 'https://sdk.scdn.co/spotify-player.js';
    tag.async = true;
    tag.onload = () => {
      const check = () => {
        if (window.Spotify) resolve();
        else setTimeout(check, 30);
      };
      check();
    };
    tag.onerror = reject;
    document.head.appendChild(tag);
  });
}