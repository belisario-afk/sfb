import { useEffect, useRef, useState, useCallback } from 'react';
import { ensureFreshToken } from '../lib/spotify.js';
import { PLAYBACK_MODE } from '../config/playbackConfig.js';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

export default function useSpotifyPlayer(clientId) {
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [error, setError] = useState(null);
  const playerRef = useRef(null);

  // Load SDK script once
  useEffect(() => {
    if (PLAYBACK_MODE !== 'FULL') return;
    if (document.getElementById('spotify-sdk')) return;
    const script = document.createElement('script');
    script.id = 'spotify-sdk';
    script.src = SDK_URL;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Initialize player
  useEffect(() => {
    if (PLAYBACK_MODE !== 'FULL') return;
    const clientIdEnv = clientId;

    function init() {
      if (!window.Spotify) {
        setTimeout(init, 200);
        return;
      }
      const player = new window.Spotify.Player({
        name: 'SFB Battle Player',
        getOAuthToken: async cb => {
          try {
            const tokens = await ensureFreshToken(clientIdEnv);
            if (tokens?.accessToken) cb(tokens.accessToken);
          } catch (e) {
            console.warn('[SpotifyPlayer] token fetch error', e);
          }
        },
        volume: 0.8
      });

      player.addListener('ready', ({ device_id }) => {
        console.log('[SpotifyPlayer] Player ready. Device ID:', device_id);
        setDeviceId(device_id);
        setReady(true);
      });
      player.addListener('not_ready', ({ device_id }) => {
        console.warn('[SpotifyPlayer] Player not ready', device_id);
        setReady(false);
      });
      player.addListener('initialization_error', ({ message }) => {
        console.error('[SpotifyPlayer] init error', message);
        setError(message);
      });
      player.addListener('authentication_error', ({ message }) => {
        console.error('[SpotifyPlayer] auth error', message);
        setError(message);
      });
      player.addListener('account_error', ({ message }) => {
        console.error('[SpotifyPlayer] account error (Premium required?)', message);
        setError(message);
      });
      player.addListener('playback_error', ({ message }) => {
        console.error('[SpotifyPlayer] playback error', message);
        setError(message);
      });

      player.connect();
      playerRef.current = player;
    }

    init();
    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
      }
    };
  }, [clientId]);

  const startTrackSegment = useCallback(async (accessToken, trackUri, deviceId, durationMs, onDone) => {
    if (!trackUri || !deviceId) return;
    try {
      // Start playback at 0
      const r = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris: [trackUri], position_ms: 0 })
      });
      if (!r.ok) {
        console.warn('[SpotifyPlayer] play request failed', r.status);
        onDone && onDone(false);
        return;
      }
      setTimeout(async () => {
        if (onDone) onDone(true);
        // Pause after segment (if enforcing)
        // (We always pause; battle engine handles next stage)
        await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).catch(()=>{});
      }, durationMs);
    } catch (e) {
      console.error('[SpotifyPlayer] segment error', e);
      onDone && onDone(false);
    }
  }, []);

  return {
    ready,
    deviceId,
    error,
    startTrackSegment
  };
}