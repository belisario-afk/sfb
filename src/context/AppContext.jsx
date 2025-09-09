import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
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
import { PLAYBACK_MODE, isFullPlayback } from '../config/playbackConfig.js';
import {
  SIDE_COLORS,
  GIFT_TIME_PER_COIN_MS,
  OVERTIME_GIFT_THRESHOLD,
  OVERTIME_ON_NEAR_TIE_ONLY,
  GOLDEN_HOUR_THRESHOLD,
  GOLDEN_HOUR_MS,
  GOLDEN_HOUR_COOLDOWN_MS
} from '../config/playbackConfig.js';
import { DEFAULT_FX_ENABLED, DEFAULT_REDUCED_MOTION } from '../config/uiConfig.js';
import { playPreview } from '../lib/audioManager.js';

const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

function extractBattleQuery(rawMessage) {
  if (!rawMessage) return null;
  let s = String(rawMessage).replace(/\s+/g, ' ').trim();
  const m = s.match(/^\s*!battle\s+(.+)$/i);
  if (!m) return null;
  s = m[1];
  s = s.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
  const byMatch = s.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) s = `${byMatch[1].trim()} ${byMatch[2].trim()}`;
  else {
    const dashMatch = s.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (dashMatch) s = `${dashMatch[1].trim()} ${dashMatch[2].trim()}`;
  }
  s = s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
  if (s.length > 120) s = s.slice(0, 120);
  return s || null;
}

export function AppProvider({ children }) {
  // Spotify auth
  const [spotifyClientId, setSpotifyClientIdState] = useState(
    localStorage.getItem('customSpotifyClientId') ||
    import.meta.env.VITE_SPOTIFY_CLIENT_ID ||
    ''
  );
  const [authState, setAuthState] = useState(loadStoredTokens());
  const [authError, setAuthError] = useState(null);
  const [authChecking, setAuthChecking] = useState(false);

  // Chat / Relay
  const [chatMode, setChatMode] = useState(localStorage.getItem('chatMode') || 'simulation');
  const [relayUrl, setRelayUrl] = useState(localStorage.getItem('relayUrl') || '');
  const [tiktokUsername, setTiktokUsername] = useState(localStorage.getItem('tiktokUsername') || '');

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

  // Modal state (expose to App.jsx)
  const [modalOpen, setModalOpen] = useState(false);

  // Hype, Gifts, MVP, Golden Hour
  const [hype, setHype] = useState(0); // 0..1
  const [goldenHourUntil, setGoldenHourUntil] = useState(0);
  const [goldenHourLastStart, setGoldenHourLastStart] = useState(0);
  const isGoldenHour = goldenHourUntil > Date.now();

  const [badges, setBadges] = useState([]); // gift badges queue
  const [mvpMap, setMvpMap] = useState(new Map()); // userId -> points

  useEffect(() => {
    const id = setInterval(() => {
      setHype(h => Math.max(0, h - 0.02)); // decay ~2% per tick
    }, 400);
    return () => clearInterval(id);
  }, []);

  // Spotify Web Player
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
    name: 'SongSmackdown Player',
    volume: 0.8,
    autoTransfer: true
  });

  const battleEngine = useBattleEngine();
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
    voteRemaining,
    extendCurrentVoteBy,
    requestOvertime
  } = battleEngine;

  useEffect(() => {
    if (isFullPlayback() && spotifyWebPlayer.player) {
      setEngineSpotifyPlayer?.(spotifyWebPlayer.player);
    }
  }, [spotifyWebPlayer.player, setEngineSpotifyPlayer]);

  // Chat hook
  const chat = useChat({ mode: chatMode, relayUrl, tiktokUsername });

  // Persist helpers
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

  // Battle helper: add top track
  const addTopTrackByQuery = useCallback(
    async (query, requester) => {
      if (!authState?.accessToken) {
        console.warn('[AddTrack] Need Spotify auth for search. Ignoring:', query);
        return;
      }
      try {
        const top = await searchTopTrackByQuery(authState.accessToken, query);
        if (top) {
          addTrack({ ...top, _requestedBy: requester || null });
          console.log('[AddTrack] Added:', top.name, '—', (top.artists || []).map(a => a.name).join(', '));
        }
      } catch (e) {
        console.warn('[AddTrack] Search failed for:', query, e?.message || e);
      }
    },
    [authState, addTrack]
  );

  // Gift handling
  const pushBadge = useCallback((badge) => {
    const id = Math.random().toString(36).slice(2);
    const b = { id, ...badge };
    setBadges(list => [...list, b]);
    const ttl = Math.max(2000, badge.ttl || 6000);
    setTimeout(() => {
      setBadges(list => list.filter(x => x.id !== id));
    }, ttl);
  }, []);

  const bumpHype = useCallback((coins) => {
    setHype(h => Math.min(1, h + Math.max(0.02, coins / 300)));
  }, []);

  const handleGift = useCallback((msg) => {
    const coins = Number(msg?.value || 0);
    if (!coins) return;

    // Extend current vote window by coin value
    extendCurrentVoteBy(coins * GIFT_TIME_PER_COIN_MS);

    // Overtime trigger for big gifts
    if (coins >= OVERTIME_GIFT_THRESHOLD) {
      if (!OVERTIME_ON_NEAR_TIE_ONLY || isNearTie()) {
        requestOvertime();
      }
    }

    // Golden Hour trigger for mega gifts (respect cooldown)
    if (coins >= GOLDEN_HOUR_THRESHOLD) {
      const now = Date.now();
      if (now - goldenHourLastStart > GOLDEN_HOUR_COOLDOWN_MS || goldenHourUntil < now) {
        setGoldenHourLastStart(now);
      }
      setGoldenHourUntil(now + GOLDEN_HOUR_MS);
    }

    // MVP points: 1 point per coin
    const uid = msg.userId || msg.username || msg.displayName || 'anon';
    setMvpMap(prev => {
      const m = new Map(prev);
      m.set(uid, (m.get(uid) || 0) + coins);
      return m;
    });

    bumpHype(coins);

    pushBadge({
      avatar: msg.avatarUrl,
      name: msg.displayName || msg.username || 'Viewer',
      label: coins >= GOLDEN_HOUR_THRESHOLD ? 'Golden Hour' :
             coins >= OVERTIME_GIFT_THRESHOLD ? 'Overtime Boost' :
             'Gift Boost',
      value: coins,
      ttl: coins >= GOLDEN_HOUR_THRESHOLD ? 10000 : coins >= OVERTIME_GIFT_THRESHOLD ? 8000 : 6000
    });
  }, [
    extendCurrentVoteBy,
    requestOvertime,
    bumpHype,
    pushBadge,
    goldenHourUntil,
    goldenHourLastStart
  ]);

  function isNearTie() {
    const a = battle?.voteTotals?.a || 0;
    const b = battle?.voteTotals?.b || 0;
    return Math.abs(a - b) <= 1;
  }

  // Chat commands and gifts
  useEffect(() => {
    if (!chat?.subscribe) return;
    const handler = async (msg) => {
      const type = (msg?.type || '').toLowerCase();
      if (type === 'gift') {
        handleGift(msg);
        return;
      }

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
  }, [chat, vote, addTopTrackByQuery, handleGift, battle?.stage]);

  // MVP reset at the start of a battle
  useEffect(() => {
    if (!battle) return;
    if (battle.stage === 'intro') {
      setMvpMap(new Map());
    }
  }, [battle?.id, battle?.stage]);

  // Derived UI helpers
  const leader = useMemo(() => {
    if (!battle?.voteTotals) return null;
    const { a, b } = battle.voteTotals;
    if (a === b) return null;
    return a > b ? 'a' : 'b';
  }, [battle?.voteTotals]);

  const value = {
    // Auth
    authState, authError, authChecking,
    hasScopes, requiredScopes: REQUIRED_SCOPES,
    beginSpotifyAuth,
    logoutSpotify: () => {
      localStorage.removeItem('spotifyTokens');
      localStorage.removeItem('spotify_code_verifier');
      setAuthState(null);
      setAuthError(null);
    },

    // Spotify
    spotifyClientId,
    setSpotifyClientId: (cid) => {
      const t = cid.trim();
      setSpotifyClientIdState(t);
      localStorage.setItem('customSpotifyClientId', t);
    },

    // Chat / Relay
    chatMode, setChatMode: (mode) => { localStorage.setItem('chatMode', mode); setChatMode(mode); },
    relayUrl, setRelayUrl: normalizeRelay,
    tiktokUsername, setTiktokUsername: (name) => {
      const t = (name || '').trim(); localStorage.setItem('tiktokUsername', t); setTiktokUsername(t);
    },
    chat,

    // Battle
    queue, battle, tryStartBattle,
    vote, forceNextStage, togglePause,
    addTrack, addTrackList, addTopTrackByQuery,

    // Gift + Hype + MVP
    handleGift,
    badges,
    hype,
    isGoldenHour,
    leader,
    mvpMap,

    // Player
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

    // Modal state for App.jsx
    modalOpen,
    setModalOpen,

    // Visual prefs
    visualFxEnabled,
    reducedMotion,
    toggleVisualFx: () => {
      setVisualFxEnabled(v => {
        const nv = !v; localStorage.setItem('visualFxEnabled', nv); return nv;
      });
    },
    toggleReducedMotion: () => {
      setReducedMotion(v => {
        const nv = !v; localStorage.setItem('reducedMotion', nv); return nv;
      });
    }
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}