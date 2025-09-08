import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback
} from 'react';

import useBattleEngine from '../hooks/useBattleEngine.js';
import useChat from '../hooks/useChat.js';
import useSpotifyWebPlayer from '../hooks/useSpotifyWebPlayer.js';

import {
  startSpotifyAuth,
  exchangeCodeForToken,
  ensureFreshToken,
  loadStoredTokens,
  searchTopTrackByQuery,
  getTrackById,
  hasRequiredScopes,
  REQUIRED_SCOPES
} from '../lib/spotify.js';

import { playPreview } from '../lib/audioManager.js';
import { PLAYBACK_MODE, isFullPlayback } from '../config/playbackConfig.js';
import { DEFAULT_FX_ENABLED, DEFAULT_REDUCED_MOTION } from '../config/uiConfig.js';

const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

/* --------- Helper: parse !battle messages into a clean search query --------- */
function extractBattleQuery(rawMessage) {
  if (!rawMessage) return null;
  // Normalize whitespace and remove control chars
  let s = String(rawMessage).replace(/\s+/g, ' ').trim();

  // Ensure it starts with !battle (case-insensitive)
  const m = s.match(/^\s*!battle\s+(.+)$/i);
  if (!m) return null;
  s = m[1];

  // Remove URLs if any slipped through
  s = s.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim();

  // Remove emojis and other symbols that can confuse search (keep letters, numbers, common punctuation)
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();

  // Common patterns: "Title - Artist", "Title by Artist"
  const byMatch = s.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    const title = byMatch[1].trim();
    const artist = byMatch[2].trim();
    s = `${title} ${artist}`;
  } else {
    const dashMatch = s.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (dashMatch) {
      const title = dashMatch[1].trim();
      const artist = dashMatch[2].trim();
      s = `${title} ${artist}`;
    }
  }

  // Strip surrounding quotes if present
  s = s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();

  // Limit length for sanity
  if (s.length > 120) s = s.slice(0, 120);

  return s || null;
}

export function AppProvider({ children }) {
  const [spotifyClientId, setSpotifyClientIdState] = useState(
    localStorage.getItem('customSpotifyClientId') ||
      import.meta.env.VITE_SPOTIFY_CLIENT_ID ||
      ''
  );

  const [authState, setAuthState] = useState(loadStoredTokens());
  const [authError, setAuthError] = useState(null);
  const [authChecking, setAuthChecking] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);

  // Chat / Relay
  const [chatMode, setChatMode] = useState(localStorage.getItem('chatMode') || 'simulation');
  const [relayUrl, setRelayUrl] = useState(
    localStorage.getItem('relayUrl') || ''
  );
  const [tiktokUsername, setTiktokUsername] = useState(
    localStorage.getItem('tiktokUsername') || ''
  );

  // Visual preferences
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

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
  }, [reducedMotion]);

  const toggleVisualFx = useCallback(() => {
    setVisualFxEnabled(v => {
      const nv = !v;
      localStorage.setItem('visualFxEnabled', nv);
      return nv;
    });
  }, []);
  const toggleReducedMotion = useCallback(() => {
    setReducedMotion(v => {
      const nv = !v;
      localStorage.setItem('reducedMotion', nv);
      return nv;
    });
  }, []);

  const getAccessToken = useCallback(async () => {
    if (!spotifyClientId) return null;
    try {
      const fresh = await ensureFreshToken(spotifyClientId);
      return fresh?.accessToken;
    } catch {
      try {
        const raw = localStorage.getItem('spotifyTokens');
        if (raw) return JSON.parse(raw).accessToken;
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
    if (isFullPlayback() && spotifyWebPlayer.player) {
      setEngineSpotifyPlayer?.(spotifyWebPlayer.player);
    }
  }, [spotifyWebPlayer.player, setEngineSpotifyPlayer]);

  // Chat hook wired to relay with TikTok username
  const chat = useChat({
    mode: chatMode,
    relayUrl,
    tiktokUsername
  });

  const normalizeRelay = useCallback((val) => {
    let v = (val || '').trim();
    if (v && !v.endsWith('/ws')) {
      if (!v.endsWith('/')) v += '/';
      v += 'ws';
    }
    localStorage.setItem('relayUrl', v);
    setRelayUrl(v);
  }, []);

  const updateClientId = useCallback((cid) => {
    const t = cid.trim();
    setSpotifyClientIdState(t);
    localStorage.setItem('customSpotifyClientId', t);
  }, []);

  const setChatModePersist = useCallback((mode) => {
    localStorage.setItem('chatMode', mode);
    setChatMode(mode);
  }, []);

  const setTiktokUsernamePersist = useCallback((name) => {
    const t = (name || '').trim();
    localStorage.setItem('tiktokUsername', t);
    setTiktokUsername(t);
  }, []);

  const logoutSpotify = useCallback(() => {
    localStorage.removeItem('spotifyTokens');
    localStorage.removeItem('spotify_code_verifier');
    setAuthState(null);
    setAuthError(null);
  }, []);

  const beginSpotifyAuth = useCallback(() => {
    if (!spotifyClientId) {
      setAuthError('No Spotify Client ID set.');
      return;
    }
    startSpotifyAuth(spotifyClientId);
  }, [spotifyClientId]);

  // PKCE exchange
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
          const clean =
            window.location.origin +
            window.location.pathname +
            window.location.hash;
          window.history.replaceState({}, '', clean);
        } catch (e) {
          setAuthError(e.message);
        } finally {
          setAuthChecking(false);
        }
      })();
    }
  }, [spotifyClientId]);

  // Token refresh loop
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
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [spotifyClientId]);

  // Chat commands from TikTok relay
  useEffect(() => {
    if (!chat?.subscribe) return;
    const handler = async (msg) => {
      const raw = (msg?.text || '').trim();
      if (!raw) return;
      const lower = raw.toLowerCase();

      if (lower.startsWith('!vote ')) {
        const side = lower.split(/\s+/)[1];
        if (side === 'a' || side === 'b') {
          const voterId = msg.userId || msg.username || msg.displayName || 'anon';
          vote(side, voterId);
          console.log('[ChatCmd] vote', side, 'from', voterId);
        }
        return;
      } else if (lower.startsWith('!battle ')) {
        const q = extractBattleQuery(raw);
        const requester = {
          id: msg.userId || '',
          username: msg.username || '',
          name: msg.displayName || msg.username || '',
          avatar: msg.avatarUrl || ''
        };
        console.log('[ChatCmd] battle query parsed:', q, 'from', requester.username || requester.name);
        if (q) await addTopTrackByQuery(q, requester);
      }
    };
    const unsub = chat.subscribe(handler);
    return () => unsub && unsub();
  }, [chat, vote, addTrack]);

  const addTopTrackByQuery = useCallback(
    async (query, requester) => {
      if (!authState?.accessToken) {
        console.warn('[AddTrack] Need Spotify auth for search. Ignoring:', query);
        return;
      }
      try {
        const top = await searchTopTrackByQuery(authState.accessToken, query);
        if (top) {
          // Attach requester metadata so Arena/Queue can show it
          const enriched = {
            ...top,
            _requestedBy: requester || null
          };
          addTrack(enriched);
          console.log('[AddTrack] Added:', enriched.name, '—', (enriched.artists || []).map(a => a.name).join(', '));
        } else {
          console.log('[AddTrack] No results for:', query);
        }
      } catch (e) {
        console.warn('[AddTrack] Search failed for:', query, e?.message || e);
      }
    },
    [authState, addTrack]
  );

  const addTrackById = useCallback(
    async (id, requester) => {
      if (!authState?.accessToken) return;
      const t = await getTrackById(authState.accessToken, id);
      if (t) addTrack({ ...t, _requestedBy: requester || null });
    },
    [authState, addTrack]
  );

  const addDemoPair = useCallback(() => {
    addTrackList([
      { id: 'demo-track-a', name: 'Demo Track A', artists: [{ name: 'Demo Artist' }], album: { images: [] }, uri: 'spotify:track:0udZHhCi7p1YzMlvI4fXoK', preview_url: null, _requestedBy: { name: 'DemoUserA' } },
      { id: 'demo-track-b', name: 'Demo Track B', artists: [{ name: 'Demo Artist' }], album: { images: [] }, uri: 'spotify:track:1301WleyT98MSxVHPZCA6M', preview_url: null, _requestedBy: { name: 'DemoUserB' } }
    ]);
  }, [addTrackList]);

  const previewTrack = useCallback((track, seconds = 10) => {
    if (track?.preview_url) {
      playPreview('TEST', track.preview_url, seconds);
    } else {
      console.log('[Preview] No preview_url for', track?.name);
    }
  }, []);

  const spotifyPlayer = {
    mode: PLAYBACK_MODE,
    ready: spotifyWebPlayer.ready,
    status: spotifyWebPlayer.status,
    deviceId: spotifyWebPlayer.deviceId,
    error: spotifyWebPlayer.error,
    transferPlayback: spotifyWebPlayer.transferPlayback,
    reconnect: spotifyWebPlayer.reconnect,
    hasStreamingScope: hasStreamingScopes
  };

  // Provide tryStartBattle AND a safe nextBattle alias to avoid "is not a function"
  const safeNextBattle = useCallback(() => {
    if (typeof tryStartBattle === 'function') return tryStartBattle();
    console.warn('[AppContext] tryStartBattle is not available');
  }, [tryStartBattle]);

  const value = {
    // Auth
    authState,
    authError,
    authChecking,
    hasScopes,
    requiredScopes: REQUIRED_SCOPES,
    beginSpotifyAuth,
    logoutSpotify,

    // Spotify
    spotifyClientId,
    setSpotifyClientId: updateClientId,

    // Chat / Relay
    chatMode,
    setChatMode: setChatModePersist,
    relayUrl,
    setRelayUrl: normalizeRelay,
    tiktokUsername,
    setTiktokUsername: setTiktokUsernamePersist,
    chat,

    // Battle
    queue,
    battle,
    tryStartBattle,
    nextBattle: safeNextBattle,
    vote,
    forceNextStage,
    togglePause,
    addTrack,
    addTrackList,
    addTrackById,
    addTopTrackByQuery,
    addDemoPair,
    previewTrack,

    // UI / modal
    modalOpen,
    setModalOpen,

    // Player
    spotifyPlayer,
    voteRemaining,

    // Visual prefs
    visualFxEnabled,
    reducedMotion,
    toggleVisualFx,
    toggleReducedMotion
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}