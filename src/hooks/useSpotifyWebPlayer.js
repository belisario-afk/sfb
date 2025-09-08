/**
 * useSpotifyWebPlayer (Singleton)
 *
 * Fixes:
 *  - Ensures onSpotifyWebPlaybackSDKReady is defined before script load
 *  - Prevents multiple player instances (singleton stored on window)
 *  - Avoids repeated "Ready" device spam & 429 device registration storms
 *  - Delays initialization until token & streaming scopes are present
 *  - Adds verbose diagnostics to help track state changes
 *
 * Usage:
 *  const playerCtl = useSpotifyWebPlayer({ getAccessToken, hasStreamingScopes, name });
 *
 * Returned object:
 * {
 *   player,        // Spotify.Player or null
 *   status,        // 'idle' | 'loading' | 'initializing' | 'ready' | 'error' | 'blocked'
 *   deviceId,
 *   error,
 *   ready,
 *   transferPlayback(),
 *   reconnect(),   // forces a teardown + re-init (if conditions ok)
 *   disconnect()
 * }
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSpotifySDK } from '../lib/spotifySdkLoader.js';

const log = (...args) => console.log('[SpotifyWebPlayer]', ...args);
const warn = (...args) => console.warn('[SpotifyWebPlayer]', ...args);
const errLog = (...args) => console.error('[SpotifyWebPlayer]', ...args);

const PLAYER_KEY = '__BATTLE_SPOTIFY_PLAYER_SINGLETON__';
const DEFAULT_NAME = 'Battle Arena Player';

export default function useSpotifyWebPlayer({
  getAccessToken,
  hasStreamingScopes,
  name = DEFAULT_NAME,
  volume = 0.8,
  autoTransfer = true
}) {
  const [status, setStatus] = useState('idle');
  const [deviceId, setDeviceId] = useState(null);
  const [error, setError] = useState(null);

  const playerRef = useRef(null);
  const autoTransferredRef = useRef(false);
  const initAttemptedRef = useRef(false);
  const reconnectTokenRef = useRef(0);

  // Guard: do we have everything we need to even try?
  const canInitialize = useCallback(async () => {
    const token = await getAccessToken?.();
    if (!token) {
      setStatus('blocked');
      setError('No access token yet');
      return false;
    }
    if (!hasStreamingScopes) {
      setStatus('blocked');
      setError('Missing required streaming scopes');
      return false;
    }
    return true;
  }, [getAccessToken, hasStreamingScopes]);

  const disconnect = useCallback(() => {
    try {
      const existing = window[PLAYER_KEY];
      if (existing?.player) {
        existing.player.disconnect();
      }
    } catch {}
    window[PLAYER_KEY] = null;
    playerRef.current = null;
    setDeviceId(null);
    setStatus('idle');
    setError(null);
    autoTransferredRef.current = false;
    initAttemptedRef.current = false;
  }, []);

  const transferPlayback = useCallback(async () => {
    const token = await getAccessToken?.();
    if (!token) {
      setError('Cannot transfer: missing token');
      return;
    }
    if (!deviceId) {
      setError('Cannot transfer: no deviceId');
      return;
    }
    try {
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
        warn('Transfer failed', res.status, txt);
        setError('Transfer failed: ' + res.status);
      } else {
        log('Transfer success');
        setError(null);
      }
    } catch (e) {
      warn('Transfer error', e);
      setError('Transfer error');
    }
  }, [deviceId, getAccessToken]);

  const initPlayer = useCallback(async () => {
    if (initAttemptedRef.current) {
      // Reuse existing singleton if present
      const existing = window[PLAYER_KEY];
      if (existing?.player) {
        playerRef.current = existing.player;
        setStatus(existing.status || 'ready');
        setDeviceId(existing.deviceId || null);
        setError(existing.error || null);
      }
      return;
    }

    initAttemptedRef.current = true;

    const okToInit = await canInitialize();
    if (!okToInit) {
      warn('Initialization deferred: prerequisites not met');
      return;
    }

    setStatus('loading');
    try {
      await loadSpotifySDK();
    } catch (e) {
      setStatus('error');
      setError('SDK load failed');
      errLog('SDK load failed', e);
      return;
    }

    if (window[PLAYER_KEY]?.player) {
      // Another hook finished init already
      const reuse = window[PLAYER_KEY];
      playerRef.current = reuse.player;
      setStatus(reuse.status || 'ready');
      setDeviceId(reuse.deviceId || null);
      setError(reuse.error || null);
      log('Reusing existing player singleton');
      return;
    }

    if (!window.Spotify || !window.Spotify.Player) {
      setStatus('error');
      setError('Spotify.Player missing after load');
      errLog('Spotify namespace missing');
      return;
    }

    setStatus('initializing');
    const initialToken = await getAccessToken?.();

    const player = new window.Spotify.Player({
      name,
      volume,
      getOAuthToken: async (cb) => {
        try {
          const refreshed = await getAccessToken?.();
            cb(refreshed || initialToken);
        } catch {
            cb(initialToken);
        }
      }
    });

    // Listeners
    player.addListener('ready', ({ device_id }) => {
      log('Ready - Device ID:', device_id);
      playerRef.current = player;
      setDeviceId(device_id);
      setStatus('ready');
      setError(null);
      window[PLAYER_KEY] = {
        player,
        deviceId: device_id,
        status: 'ready',
        error: null
      };
      if (autoTransfer && !autoTransferredRef.current) {
        autoTransferredRef.current = true;
        transferPlayback();
      }
    });

    player.addListener('not_ready', ({ device_id }) => {
      warn('Device went offline', device_id);
      if (deviceId === device_id) {
        setDeviceId(null);
        if (window[PLAYER_KEY]) {
          window[PLAYER_KEY].deviceId = null;
        }
      }
      setStatus('initializing');
    });

    player.addListener('initialization_error', ({ message }) => {
      errLog('initialization_error', message);
      setError(message);
      setStatus('error');
      window[PLAYER_KEY] = {
        player, deviceId: null, status: 'error', error: message
      };
    });

    player.addListener('authentication_error', ({ message }) => {
      errLog('authentication_error', message);
      setError(message || 'Authentication failed');
      setStatus('error');
      window[PLAYER_KEY] = {
        player, deviceId: null, status: 'error', error: message
      };
    });

    player.addListener('account_error', ({ message }) => {
      errLog('account_error', message);
      setError(message);
      setStatus('error');
      window[PLAYER_KEY] = {
        player, deviceId: null, status: 'error', error: message
      };
    });

    player.addListener('playback_error', ({ message }) => {
      warn('playback_error', message);
      setError(message);
    });

    const connected = await player.connect();
    if (!connected) {
      setStatus('error');
      setError('Could not connect player');
      window[PLAYER_KEY] = {
        player, deviceId: null, status: 'error', error: 'connect failed'
      };
      return;
    }

    playerRef.current = player;
    window[PLAYER_KEY] = {
      player,
      deviceId: null,
      status: 'initializing',
      error: null
    };
  }, [
    autoTransfer,
    canInitialize,
    deviceId,
    getAccessToken,
    name,
    transferPlayback,
    volume
  ]);

  // Attempt init (and retry if blocked prerequisites become ready)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await initPlayer();
    })();
    return () => { cancelled = true; };
  }, [initPlayer, reconnectTokenRef.current, hasStreamingScopes]);

  // Public API helpers
  const reconnect = useCallback(async () => {
    warn('Manual reconnect requested');
    disconnect();
    reconnectTokenRef.current += 1; // triggers init effect
  }, [disconnect]);

  // Keep window singleton state updated on changes
  useEffect(() => {
    const singleton = window[PLAYER_KEY];
    if (singleton) {
      singleton.status = status;
      singleton.error = error;
      if (deviceId) singleton.deviceId = deviceId;
    }
  }, [status, error, deviceId]);

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