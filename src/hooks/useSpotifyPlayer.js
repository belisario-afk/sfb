import { useEffect, useRef, useState, useCallback } from 'react';
import { ensureFreshToken, loadStoredTokens, hasRequiredScopes, REQUIRED_SCOPES } from '../lib/spotify.js';
import { PLAYBACK_MODE } from '../config/playbackConfig.js';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

export default function useSpotifyPlayer(clientId) {
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [error, setError] = useState(null);
  const playerRef = useRef(null);
  const initializingRef = useRef(false);

  // Token scope validation
  useEffect(() => {
    if (PLAYBACK_MODE !== 'FULL') return;
    const tok = loadStoredTokens();
    if (tok && !hasRequiredScopes(tok)) {
      setError('missing_scopes');
    }
  }, []);

  // Load SDK & set global callback
  useEffect(() => {
    if (PLAYBACK_MODE !== 'FULL') return;
    if (!clientId) {
      setError('missing_client_id');
      return;
    }

    if (!window.onSpotifyWebPlaybackSDKReady) {
      window.onSpotifyWebPlaybackSDKReady = () => {
        initPlayer();
      };
    }

    if (!document.getElementById('spotify-sdk')) {
      const script = document.createElement('script');
      script.id = 'spotify-sdk';
      script.src = SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    } else if (window.Spotify && !playerRef.current) {
      // Script already present and loaded
      initPlayer();
    }

    function initPlayer() {
      if (initializingRef.current || playerRef.current) return;
      const tok = loadStoredTokens();
      if (!tok) {
        console.log('[SpotifyPlayer] No tokens yet; will initialize after login.');
        return;
      }
      if (!hasRequiredScopes(tok)) {
        console.warn('[SpotifyPlayer] Missing required scopes. Needed:', REQUIRED_SCOPES.join(', '));
        setError('missing_scopes');
        return;
      }
      if (!window.Spotify) {
        console.warn('[SpotifyPlayer] Spotify object not ready.');
        return;
      }
      initializingRef.current = true;

      const player = new window.Spotify.Player({
        name: 'SFB Battle Player',
        getOAuthToken: async cb => {
          try {
            const fresh = await ensureFreshToken(clientId);
            if (fresh?.accessToken) cb(fresh.accessToken);
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
        if (message && message.toLowerCase().includes('scope')) {
          setError('missing_scopes');
        } else {
          setError(message);
        }
      });
      player.addListener('account_error', ({ message }) => {
        console.error('[SpotifyPlayer] account error', message);
        setError(message);
      });
      player.addListener('playback_error', ({ message }) => {
        console.error('[SpotifyPlayer] playback error', message);
        setError(message);
      });

      player.connect().then(success => {
        if (!success) {
          console.warn('[SpotifyPlayer] connect() returned false');
        }
      });

      playerRef.current = player;
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
      }
    };
  }, [clientId]);

  const startTrackSegment = useCallback(async (accessToken, trackUri, deviceId, durationMs, onDone) => {
    if (!trackUri || !deviceId) {
      onDone && onDone(false);
      return;
    }
    try {
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
      if (durationMs > 0) {
        setTimeout(async () => {
          try {
            await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
          } catch {}
          onDone && onDone(true);
        }, durationMs);
      } else {
        onDone && onDone(true);
      }
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