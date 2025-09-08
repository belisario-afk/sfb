import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback
} from 'react';
import useBattleEngine from '../hooks/useBattleEngine.js';
import useChat from '../hooks/useChat.js';
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

const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

function parseQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

// Simple demo track placeholders (URIs included so FULL playback can attempt)
function buildDemoTracks() {
  return [
    {
      id: 'demo-track-a',
      name: 'Demo Track A',
      artists: [{ name: 'Demo Artist' }],
      album: { images: [] },
      uri: 'spotify:track:0udZHhCi7p1YzMlvI4fXoK',
      preview_url: null
    },
    {
      id: 'demo-track-b',
      name: 'Demo Track B',
      artists: [{ name: 'Demo Artist' }],
      album: { images: [] },
      uri: 'spotify:track:1301WleyT98MSxVHPZCA6M',
      preview_url: null
    }
  ];
}

export function AppProvider({ children }) {
  // Spotify Client ID (user-saved overrides env)
  const [spotifyClientId, setSpotifyClientIdState] = useState(
    localStorage.getItem('customSpotifyClientId') ||
    import.meta.env.VITE_SPOTIFY_CLIENT_ID ||
    ''
  );

  const [authState, setAuthState] = useState(loadStoredTokens());
  const [authError, setAuthError] = useState(null);
  const [authChecking, setAuthChecking] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [chatMode, setChatMode] = useState('simulation');
  const [relayUrl, setRelayUrl] = useState(
    localStorage.getItem('relayUrl') || 'wss://sfb-qrzl.onrender.com/ws'
  );

  const battleEngine = useBattleEngine(
    spotifyClientId ||
    localStorage.getItem('customSpotifyClientId') ||
    import.meta.env.VITE_SPOTIFY_CLIENT_ID ||
    ''
  );

  const {
    queue,
    addTrack,
    currentBattle: battle,
    tryStartBattle,
    vote,
    forceNextStage,
    togglePause,
    addTrackList,
    spotifyPlayer
  } = battleEngine;

  const chat = useChat({ mode: chatMode, relayUrl });

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
    const trimmed = cid.trim();
    setSpotifyClientIdState(trimmed);
    localStorage.setItem('customSpotifyClientId', trimmed);
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

  // Handle PKCE code exchange on load
  useEffect(() => {
    const { code, error } = parseQueryParams();
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
          const newUrl = window.location.origin + window.location.pathname + window.location.hash;
          window.history.replaceState({}, '', newUrl);
        } catch (e) {
          setAuthError(e.message);
        } finally {
          setAuthChecking(false);
        }
      })();
    }
  }, [spotifyClientId]);

  // Refresh token loop
  useEffect(() => {
    let cancelled = false;
    let t;
    async function loop() {
      if (!spotifyClientId) {
        t = setTimeout(loop, 60000);
        return;
      }
      try {
        const fresh = await ensureFreshToken(spotifyClientId);
        if (!cancelled && fresh) setAuthState(fresh);
      } catch (e) {
        console.warn('[Auth] refresh error', e);
      }
      t = setTimeout(loop, 60000);
    }
    loop();
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [spotifyClientId]);

  // Chat commands
  useEffect(() => {
    if (!chat) return;
    const handler = (msg) => {
      const text = msg?.text || '';
      const lower = text.toLowerCase().trim();
      if (lower.startsWith('!vote ')) {
        const choice = lower.split(/\s+/)[1];
        if (choice === 'a' || choice === 'b') {
          vote(choice, msg.user || 'anon');
        }
      } else if (lower.startsWith('!battle ')) {
        const query = text.slice('!battle '.length).trim();
        if (query) addTopTrackByQuery(query);
      }
    };
    chat.subscribe(handler);
    return () => chat.unsubscribe(handler);
  }, [chat, vote, addTrack]);

  const addTopTrackByQuery = useCallback(async (query) => {
    if (!authState?.accessToken) {
      console.warn('[AddTrack] Need Spotify auth for search.');
      return;
    }
    const top = await searchTopTrackByQuery(authState.accessToken, query);
    if (top) {
      addTrack(top);
      console.log('[AddTrack] Added top track:', top.name);
    } else {
      console.log('[AddTrack] No results for:', query);
    }
  }, [authState, addTrack]);

  const addTrackById = useCallback(async (id) => {
    if (!authState?.accessToken) return;
    const t = await getTrackById(authState.accessToken, id);
    if (t) addTrack(t);
  }, [authState, addTrack]);

  const addDemoPair = useCallback(() => {
    addTrackList(buildDemoTracks());
  }, [addTrackList]);

  const previewTrack = useCallback((track, seconds = 10) => {
    if (track?.preview_url) {
      playPreview('TEST', track.preview_url, seconds);
    } else {
      console.log('[Preview] No preview_url for', track?.name);
    }
  }, []);

  const hasScopes = hasRequiredScopes(authState);

  const value = {
    // Auth
    authState,
    authError,
    authChecking,
    hasScopes,
    requiredScopes: REQUIRED_SCOPES,
    beginSpotifyAuth,
    logoutSpotify,

    // Client ID
    spotifyClientId,
    setSpotifyClientId: updateClientId,

    // Chat
    chatMode,
    setChatMode,
    relayUrl,
    setRelayUrl: normalizeRelay,
    chat,

    // Battle
    queue,
    battle,
    tryStartBattle,
    nextBattle: tryStartBattle, // alias for existing UI
    vote,
    forceNextStage,
    togglePause,
    addTrack,
    addTrackList,
    addTrackById,
    addTopTrackByQuery,
    addDemoPair,
    previewTrack,

    // UI
    modalOpen,
    setModalOpen,

    // Spotify Player (FULL mode)
    spotifyPlayer
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}