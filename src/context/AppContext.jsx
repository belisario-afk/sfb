import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import useBattleEngine from '../hooks/useBattleEngine.js';
import useChat from '../hooks/useChat.js';
import useSpotifyWebPlayer from '../hooks/useSpotifyWebPlayer.js';
import { startSpotifyAuth, exchangeCodeForToken, ensureFreshToken, loadStoredTokens, searchTopTrackByQuery, getTrackById, hasRequiredScopes, REQUIRED_SCOPES } from '../lib/spotify.js';
import { playPreview } from '../lib/audioManager.js';
import { PLAYBACK_MODE, isFullPlayback } from '../config/playbackConfig.js';
import { DEFAULT_FX_ENABLED, DEFAULT_REDUCED_MOTION } from '../config/uiConfig.js';

const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

// Extract clean search query from a !battle message
function extractBattleQuery(rawMessage) {
  if (!rawMessage) return null;
  let s = String(rawMessage).replace(/\s+/g, ' ').trim();

  const m = s.match(/^\s*!battle\s+(.+)$/i);
  if (!m) return null;
  s = m[1];

  // Remove URLs if any slipped through
  s = s.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim();

  // Remove common emoji ranges to reduce search noise
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();

  // Normalize “Title by Artist” or “Title - Artist”
  const byMatch = s.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    s = `${byMatch[1].trim()} ${byMatch[2].trim()}`;
  } else {
    const dashMatch = s.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (dashMatch) {
      s = `${dashMatch[1].trim()} ${dashMatch[2].trim()}`;
    }
  }

  // Strip surrounding quotes
  s = s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();

  if (s.length > 120) s = s.slice(0, 120);
  return s || null;
}

export function AppProvider({ children }) {
  const [spotifyClientId, setSpotifyClientId] = useState(
    localStorage.getItem('customSpotifyClientId') ||
      import.meta.env.VITE_SPOTIFY_CLIENT_ID ||
      ''
  );
  const [authState, setAuthState] = useState(loadStoredTokens());
  const [authError, setAuthError] = useState(null);
  const [authChecking, setAuthChecking] = useState(false);

  const [chatMode, setChatMode] = useState(localStorage.getItem('chatMode') || 'simulation');
  const [relayUrl, setRelayUrl] = useState(localStorage.getItem('relayUrl') || '');
  const [tiktokUsername, setTiktokUsername] = useState(localStorage.getItem('tiktokUsername') || '');

  const [modalOpen, setModalOpen] = useState(false);

  const [visualFxEnabled, setVisualFxEnabled] = useState(
    (() => {
      const stored = localStorage.getItem('visualFxEnabled');
      return stored === null ? DEFAULT_FX_ENABLED : stored === 'true';
    })()
  );
  const [reducedMotion, setReducedMotion] = useState(
    (() => {
      const stored = localStorage.getItem('reducedMotion');
      if (stored !== null) return stored === 'true';
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
      return DEFAULT_REDUCED_MOTION;
    })()
  );

  const toggleVisualFx = useCallback(() => {
    setVisualFxEnabled(v => {
      const nv = !v;
      localStorage.setItem('visualFxEnabled', nv ? 'true' : 'false');
      return nv;
    });
  }, []);
  const toggleReducedMotion = useCallback(() => {
    setReducedMotion(v => {
      const nv = !v;
      localStorage.setItem('reducedMotion', nv ? 'true' : 'false');
      return nv;
    });
  }, []);

  const getAccessToken = useCallback(async () => {
    if (!spotifyClientId) return null;
    try {
      const fresh = await ensureFreshToken(spotifyClientId);
      return fresh?.accessToken || null;
    } catch {
      try {
        const raw = localStorage.getItem('spotifyTokens');
        if (raw) return JSON.parse(raw).accessToken || null;
      } catch {}
      return null;
    }
  }, [spotifyClientId]);

  const hasScopes = hasRequiredScopes(authState);
  const grantedScopes = authState?.scope ? authState.scope.split(/\s+/) : [];
  const hasStreamingScopes =
    grantedScopes.includes('streaming') &&
    grantedScopes.includes('user-modify-playback-state') &&
    grantedScopes.includes('user-read-playback-state');

  const spotifyWebPlayer = useSpotifyWebPlayer({
    getAccessToken,
    hasStreamingScopes,
    name: 'Battle Arena Player',
    volume: 0.8,
    autoTransfer: true
  });

  const battleEngine = useBattleEngine(
    spotifyClientId ||
      localStorage.getItem('customSpotifyClientId') ||
      import.meta.env.VITE_SPOTIFY_CLIENT_ID ||
      ''
  );

  const {
    queue,
    addTrack,
    addTrackList,
    currentBattle: battle,
    tryStartBattle,
    vote,
    forceNextStage,
    togglePause,
    setSpotifyPlayer: setEngineSpotifyPlayer,
    voteRemaining
  } = battleEngine;

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
  }, [reducedMotion]);

  useEffect(() => {
    if (isFullPlayback() && spotifyWebPlayer.player) {
      setEngineSpotifyPlayer?.(spotifyWebPlayer.player);
    }
  }, [spotifyWebPlayer.player, setEngineSpotifyPlayer]);

  // Relay
  const chat = useChat({
    mode: chatMode,
    relayUrl,
    tiktokUsername
  });

  // Handle chat commands
  useEffect(() => {
    if (!chat?.subscribe) return;
    const handler = async (msg) => {
      const raw = (msg?.text || '').trim();
      if (!raw) return;

      const lower = raw.toLowerCase();

      // Votes (only counted during vote stage by the engine)
      if (lower.startsWith('!vote ')) {
        const side = lower.split(/\s+/)[1];
        if (side === 'a' || side === 'b') {
          const voterId = msg.userId || msg.username || msg.displayName || 'anon';
          vote(side, voterId);
          console.log('[ChatCmd] vote', side, 'from', voterId);
        }
        return;
      }

      // Battle request
      if (lower.startsWith('!battle ')) {
        const q = extractBattleQuery(raw);
        console.log('[ChatCmd] battle query parsed:', q, 'from', msg.username || msg.displayName);
        if (!q) return;
        await addTopTrackByQuery(q);
      }
    };
    const unsub = chat.subscribe(handler);
    return () => unsub && unsub();
  }, [chat, vote, addTrack]);

  // Spotify search -> add top track
  const addTopTrackByQuery = useCallback(
    async (query) => {
      const token = authState?.accessToken;
      if (!token) {
        console.warn('[AddTrack] No Spotify auth; cannot search:', query);
        return;
      }
      try {
        const top = await searchTopTrackByQuery(token, query);
        if (top) {
          addTrack(top);
          console.log('[AddTrack] Added:', top.name, '—', top.artists?.map(a => a.name).join(', '));
        } else {
          console.log('[AddTrack] No results for:', query);
        }
      } catch (e) {
        console.warn('[AddTrack] Search failed for:', query, e?.message || e);
      }
    },
    [authState, addTrack]
  );

  // Persist helpers
  const setChatModePersist = useCallback((mode) => {
    localStorage.setItem('chatMode', mode);
    setChatMode(mode);
  }, []);
  const setRelayUrlPersist = useCallback((val) => {
    let v = (val || '').trim();
    if (v && !v.endsWith('/ws')) {
      if (!v.endsWith('/')) v += '/';
      v += 'ws';
    }
    localStorage.setItem('relayUrl', v);
    setRelayUrl(v);
  }, []);
  const setTiktokUsernamePersist = useCallback((name) => {
    const t = (name || '').trim();
    localStorage.setItem('tiktokUsername', t);
    setTiktokUsername(t);
  }, []);
  const updateClientId = useCallback((cid) => {
    const t = cid.trim();
    setSpotifyClientId(t);
    localStorage.setItem('customSpotifyClientId', t);
  }, []);

  const beginSpotifyAuth = useCallback(() => {
    if (!spotifyClientId) {
      setAuthError('No Spotify Client ID set.');
      return;
    }
    startSpotifyAuth(spotifyClientId);
  }, [spotifyClientId]);
  const logoutSpotify = useCallback(() => {
    localStorage.removeItem('spotifyTokens');
    localStorage.removeItem('spotify_code_verifier');
    setAuthState(null);
    setAuthError(null);
  }, []);

  // PKCE exchange on redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    if (error) {
      setAuthError(error);
      return;
    }
    if (code && spotifyClientId) {
      (async () => {
        try {
          setAuthChecking(true);
          const tokens = await exchangeCodeForToken(code, spotifyClientId);
          setAuthState(tokens);
          setAuthError(null);
          const clean = window.location.origin + window.location.pathname + window.location.hash;
          window.history.replaceState({}, '', clean);
        } catch (e) {
          setAuthError(e.message);
        } finally {
          setAuthChecking(false);
        }
      })();
    }
  }, [spotifyClientId]);

  // Background token refresh
  useEffect(() => {
    let stop = false;
    let t;
    async function loop() {
      if (!spotifyClientId) {
        t = setTimeout(loop, 60000);
        return;
      }
      try {
        const fresh = await ensureFreshToken(spotifyClientId);
        if (!stop && fresh) setAuthState(fresh);
      } catch (e) {
        console.warn('[Auth] refresh error', e?.message || e);
      }
      t = setTimeout(loop, 60000);
    }
    loop();
    return () => { stop = true; clearTimeout(t); };
  }, [spotifyClientId]);

  const value = {
    // Auth
    authState, authError, authChecking, hasScopes, requiredScopes: REQUIRED_SCOPES,
    beginSpotifyAuth, logoutSpotify,

    // Spotify
    spotifyClientId, setSpotifyClientId: updateClientId,

    // Chat / Relay
    chatMode, setChatMode: setChatModePersist,
    relayUrl, setRelayUrl: setRelayUrlPersist,
    tiktokUsername, setTiktokUsername: setTiktokUsernamePersist,
    chat,

    // Battle
    queue, battle, tryStartBattle, vote, forceNextStage, togglePause,
    addTrack, addTrackList, getTrackById,

    // UI
    modalOpen, setModalOpen,

    // Player info
    spotifyPlayer: {
      mode: PLAYBACK_MODE,
      ready: spotifyWebPlayer.ready,
      status: spotifyWebPlayer.status,
      deviceId: spotifyWebPlayer.deviceId,
      error: spotifyWebPlayer.error,
      transferPlayback: spotifyWebPlayer.transferPlayback,
      reconnect: spotifyWebPlayer.reconnect,
      hasStreamingScope: hasStreamingScopes
    },

    voteRemaining,
    visualFxEnabled, reducedMotion, toggleVisualFx, toggleReducedMotion
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}