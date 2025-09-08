// (Only changes vs previous version: exposes voteRemaining from engine, removed leader concepts)
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

const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

function parseQueryParams() {
  const p = new URLSearchParams(window.location.search);
  const o = {};
  for (const [k, v] of p.entries()) o[k] = v;
  return o;
}

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

  const getAccessToken = useCallback(async () => {
    if (!spotifyClientId) return null;
    try {
      const fresh = await ensureFreshToken(spotifyClientId);
      return fresh?.accessToken;
    } catch {
      const raw = localStorage.getItem('spotifyTokens');
      if (raw) {
        try { return JSON.parse(raw).accessToken; } catch {}
      }
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
    const t = cid.trim();
    setSpotifyClientIdState(t);
    localStorage.setItem('customSpotifyClientId', t);
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
        console.warn('[Auth] refresh error', e);
      }
      t = setTimeout(loop, 60000);
    }
    loop();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [spotifyClientId]);

  // Chat commands
  useEffect(() => {
    if (!chat?.subscribe) return;
    const handler = (msg) => {
      const raw = (msg?.text || '').trim();
      const lower = raw.toLowerCase();
      if (lower.startsWith('!vote ')) {
        const side = lower.split(/\s+/)[1];
        if (side === 'a' || side === 'b') vote(side, msg.user || 'anon');
      } else if (lower.startsWith('!battle ')) {
        const q = raw.slice('!battle '.length).trim();
        if (q) addTopTrackByQuery(q);
      }
    };
    const unsub = chat.subscribe(handler);
    return () => unsub && unsub();
  }, [chat, vote, addTrack]);

  const addTopTrackByQuery = useCallback(
    async (query) => {
      if (!authState?.accessToken) {
        console.warn('[AddTrack] Need Spotify auth for search.');
        return;
      }
      const top = await searchTopTrackByQuery(authState.accessToken, query);
      if (top) {
        addTrack(top);
        console.log('[AddTrack] Added:', top.name);
      } else {
        console.log('[AddTrack] No results for:', query);
      }
    },
    [authState, addTrack]
  );

  const addTrackById = useCallback(
    async (id) => {
      if (!authState?.accessToken) return;
      const t = await getTrackById(authState.accessToken, id);
      if (t) addTrack(t);
    },
    [authState, addTrack]
  );

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

  const value = {
    authState,
    authError,
    authChecking,
    hasScopes,
    requiredScopes: REQUIRED_SCOPES,
    beginSpotifyAuth,
    logoutSpotify,

    spotifyClientId,
    setSpotifyClientId: updateClientId,

    chatMode,
    setChatMode,
    relayUrl,
    setRelayUrl: normalizeRelay,
    chat,

    queue,
    battle,
    tryStartBattle,
    nextBattle: tryStartBattle,
    vote,
    forceNextStage,
    togglePause,
    addTrack,
    addTrackList,
    addTrackById,
    addTopTrackByQuery,
    addDemoPair,
    previewTrack,

    modalOpen,
    setModalOpen,

    spotifyPlayer,
    voteRemaining
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}