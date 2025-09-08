/**
 * useSpotifyWebPlayer (Singleton)
 * - Stores deviceId in localStorage for external recovery attempts.
 * - Provides transferPlayback & reconnect utilities.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSpotifySDK } from '../lib/spotifySdkLoader.js';

const log = (...args) => console.log('[SpotifyWebPlayer]', ...args);
const warn = (...args) => console.warn('[SpotifyWebPlayer]', ...args);
const errorLog = (...args) => console.error('[SpotifyWebPlayer]', ...args);

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

  const canInitialize = useCallback(async () => {
    const token = await getAccessToken?.();
    if (!token) {
      setStatus('blocked');
      setError('No access token');
      return false;
    }
    if (!hasStreamingScopes) {
      setStatus('blocked');
      setError('Missing streaming scopes');
      return false;
    }
    return true;
  }, [getAccessToken, hasStreamingScopes]);

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

    const ready = await canInitialize();
    if (!ready) {
      warn('Init postponed: prereqs not met.');
      return;
    }

    setStatus('loading');
    try {
      await loadSpotifySDK();
    } catch (e) {
      setStatus('error');
      setError('SDK load failed');
      errorLog('SDK load failed', e);
      return;
    }

    if (window[PLAYER_KEY]?.player) {
      const reuse = window[PLAYER_KEY];
      playerRef.current = reuse.player;
      setStatus(reuse.status || 'ready');
      setDeviceId(reuse.deviceId || null);
      setError(reuse.error || null);
      log('Reusing player singleton');
      return;
    }

    if (!window.Spotify || !window.Spotify.Player) {
      setStatus('error');
      setError('Spotify.Player missing');
      errorLog('Spotify namespace missing');
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

    player.addListener('ready', ({ device_id }) => {
      log('Ready - Device ID:', device_id);
      playerRef.current = player;
      setDeviceId(device_id);
      localStorage.setItem('spotify_device_id', device_id);
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
      warn('Device offline', device_id);
      if (deviceId === device_id) setDeviceId(null);
      setStatus('initializing');
    });

    player.addListener('initialization_error', ({ message }) => {
      errorLog('initialization_error', message);
      setError(message);
      setStatus('error');
    });
    player.addListener('authentication_error', ({ message }) => {
      errorLog('authentication_error', message);
      setError(message || 'Auth failed');
      setStatus('error');
    });
    player.addListener('account_error', ({ message }) => {
      errorLog('account_error', message);
      setError(message);
      setStatus('error');
    });
    player.addListener('playback_error', ({ message }) => {
      warn('playback_error', message);
      setError(message);
    });

    const connected = await player.connect();
    if (!connected) {
      setStatus('error');
      setError('Connect failed');
      window[PLAYER_KEY] = {
        player, deviceId: null, status: 'error', error: 'connect failed'
      };
      return;
    }

    playerRef.current = player;
    window[PLAYER_KEY] = { player, deviceId: null, status: 'initializing', error: null };
  }, [autoTransfer, canInitialize, deviceId, getAccessToken, name, transferPlayback, volume]);

  const disconnect = useCallback(() => {
    try { playerRef.current?.disconnect(); } catch {}
    window[PLAYER_KEY] = null;
    playerRef.current = null;
    setDeviceId(null);
    setStatus('idle');
    setError(null);
    autoTransferredRef.current = false;
    initAttemptedRef.current = false;
  }, []);

  const reconnect = useCallback(async () => {
    disconnect();
    reconnectTokenRef.current += 1;
  }, [disconnect]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await initPlayer();
    })();
    return () => { cancelled = true; };
  }, [initPlayer, reconnectTokenRef.current, hasStreamingScopes]);

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