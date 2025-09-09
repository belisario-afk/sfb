import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef
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

  // Auth helpers
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

  // Spotify player
  const spotifyWebPlayer = useSpotifyWebPlayer({
    getAccessToken,
    hasStreamingScopes,
    name: 'SongSmackdown Player',
    volume: 0.8,
    autoTransfer: true
  });

  // Battle engine
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
    voteRemaining,
    promoteRequesterLatest
  } = battleEngine;

  useEffect(() => {
    if (isFullPlayback() && spotifyWebPlayer.player) {
      setEngineSpotifyPlayer?.(spotifyWebPlayer.player);
    }
  }, [spotifyWebPlayer.player, setEngineSpotifyPlayer]);

  // Chat hook wired to relay with TikTok username
  const chat = useChat({ mode: chatMode, relayUrl, tiktokUsername });

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

  /* ---------- Hype + Gift mapping ---------- */
  const [hype, setHype] = useState({ a: 0, b: 0 });
  const [hypePulse, setHypePulse] = useState({ a: 0, b: 0 }); // increments to trigger CSS pulse
  const votesByUserRef = useRef(new Map()); // userId -> 'a' | 'b'
  const battleRef = useRef(null);
  useEffect(() => { battleRef.current = battle; }, [battle]);

  // Gift banner state for big promotions
  const [giftBanner, setGiftBanner] = useState(null); // { username, amount, ts }

  // Reset hype and per-battle votes tracking when a new battle starts
  useEffect(() => {
    if (!battle) return;
    setHype({ a: 0, b: 0 });
    setHypePulse({ a: 0, b: 0 });
    votesByUserRef.current = new Map();
  }, [battle?.id]);

  const addHype = useCallback((side, amount) => {
    if (side !== 'a' && side !== 'b') return;
    setHype(prev => {
      const next = { ...prev };
      next[side] = Math.max(0, Math.min(9999, (next[side] || 0) + amount));
      return next;
    });
    setHypePulse(prev => ({ ...prev, [side]: (prev[side] || 0) + 1 }));
  }, []);

  function resolveGiftSideFromVote(msg) {
    const uid = msg?.userId || msg?.username || msg?.displayName;
    if (!uid) return null;
    return votesByUserRef.current.get(uid) || null;
  }

  function getGiftCoins(msg) {
    if (!msg) return 0;
    const data = msg.data || {};
    return Number(
      msg.value ??
      msg.coins ??
      msg.diamondCount ??
      data.diamondCount ??
      data.diamond_count ??
      0
    ) || 0;
  }

  function getGiftName(msg) {
    const data = msg?.data || {};
    return (msg?.giftName || data.giftName || data.gift_name || '').toString();
  }

  function isGiftRepeatEnd(msg) {
    const data = msg?.data || {};
    const v = (msg?.repeatEnd ?? data.repeatEnd);
    if (typeof v === 'boolean') return v;
    return true;
  }

  function resolveLeaderSide() {
    const b = battleRef.current;
    if (!b) return null;
    const a = b?.voteTotals?.a || 0;
    const bb = b?.voteTotals?.b || 0;
    if (a === bb) return null;
    return a > bb ? 'a' : 'b';
  }

  function handleGiftMessage(msg) {
    const coins = getGiftCoins(msg);
    if (!coins) return;
    if (!isGiftRepeatEnd(msg)) return;

    const giftName = getGiftName(msg).toLowerCase();

    // Mega rule: Money Gun OR coins >= 500 -> promote requester's song to front
    const isMoneyGun = giftName.includes('money gun') || giftName.includes('moneygun');
    const isMega = coins >= 500 || isMoneyGun;

    // Medium/Small hype effects (kept from earlier behavior)
    const isMedium = coins >= 20 && coins <= 99;
    const isSmall = coins > 0 && coins < 20;

    // If mega, promote requester's queued song
    if (isMega) {
      const requester = {
        id: msg.userId || '',
        username: msg.username || '',
        name: msg.displayName || msg.username || '',
        avatar: msg.avatarUrl || ''
      };
      const moved = promoteRequesterLatest(requester);
      if (moved) {
        setGiftBanner({
          username: requester.name || requester.username || 'Viewer',
          amount: coins,
          ts: Date.now()
        });
        // auto-clear banner after 5s
        setTimeout(() => setGiftBanner(null), 5000);
        console.log('[Gift][PROMOTE]', coins, 'coins by', requester.username || requester.name);
      } else {
        console.log('[Gift][PROMOTE] No queued request to promote for', requester.username || requester.name);
      }
      // Mega gifts do not alter hype in this step (rule not requested), but could if desired.
      return;
    }

    // Small/Medium: affect hype and pulses
    if (isSmall || isMedium) {
      let side = resolveGiftSideFromVote(msg);
      if (!side) {
        const b = battleRef.current;
        const inVoting = b?.stage?.startsWith?.('vote');
        if (inVoting) {
          side = resolveLeaderSide();
        }
      }
      if (side) {
        addHype(side, isMedium ? 2 : 1);
      } else {
        setHypePulse(prev => ({ a: prev.a + 1, b: prev.b + 1 }));
      }
      console.log('[Gift]', coins, 'coins ->', side || 'neutral', '(small/medium)');
    }
  }

  /* ---------- Chat commands from TikTok relay ---------- */
  const recentAddsRef = useRef(new Map()); // trackId -> ts
  const PER_USER_BATTLE_COOLDOWN_MS = 5000;
  const lastBattleCmdAt = useRef(new Map()); // userId -> ts

  useEffect(() => {
    if (!chat?.subscribe) return;
    const handler = async (msg) => {
      // Gift events
      if (msg?.type === 'gift' || msg?.event === 'gift' || msg?.kind === 'gift' || msg?.data?.event === 'gift') {
        handleGiftMessage(msg);
        return;
      }

      const raw = (msg?.text || '').trim();
      if (!raw) return;
      const lower = raw.toLowerCase();

      if (lower.startsWith('!vote ')) {
        const side = lower.split(/\s+/)[1];
        if (side === 'a' || side === 'b') {
          const voterId = msg.userId || msg.username || msg.displayName || 'anon';
          if (!votesByUserRef.current.has(voterId)) {
            votesByUserRef.current.set(voterId, side);
            vote(side, voterId);
            console.log('[ChatCmd] vote', side, 'from', voterId);
          }
        }
        return;
      } else if (lower.startsWith('!battle ')) {
        const requesterId = msg.userId || msg.username || msg.displayName || '';
        const now = Date.now();
        const last = lastBattleCmdAt.current.get(requesterId) || 0;
        if (now - last < PER_USER_BATTLE_COOLDOWN_MS) return;
        lastBattleCmdAt.current.set(requesterId, now);

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
          const trackId = top.id || top.uri || '';
          const now = Date.now();
          // dedupe recent adds (8s window)
          const lastTs = recentAddsRef.current.get(trackId) || 0;
          if (now - lastTs < 8000) return;
          recentAddsRef.current.set(trackId, now);

          const enriched = {
            ...top,
            _requestedBy: requester || null
          };

          // Avoid duplicates already in queue
          const inQueue = (battleEngine.queue || []).some(t => (t.id && t.id === enriched.id) || (t.uri && t.uri === enriched.uri));
          if (inQueue) return;

          addTrack(enriched);
          console.log('[AddTrack] Added:', enriched.name, '—', (enriched.artists || []).map(a => a.name).join(', '));
        } else {
          console.log('[AddTrack] No results for:', query);
        }
      } catch (e) {
        console.warn('[AddTrack] Search failed for:', query, e?.message || e);
      }
    },
    [authState, addTrack, battleEngine.queue]
  );

  const addTrackById = useCallback(
    async (id, requester) => {
      if (!authState?.accessToken) return;
      const t = await getTrackById(authState.accessToken, id);
      if (!t) return;
      const inQueue = (battleEngine.queue || []).some(x => (x.id && x.id === t.id) || (x.uri && x.uri === t.uri));
      if (inQueue) return;
      addTrack({ ...t, _requestedBy: requester || null });
    },
    [authState, addTrack, battleEngine.queue]
  );

  const addDemoPair = useCallback(() => {
    addTrackList([
      { id: 'demo-track-a', name: 'Demo Track A', artists: [{ name: 'Demo Artist' }], album: { images: [] }, uri: 'spotify:track:0udZHhCi7p1YzMlvI4fXoK', preview_url: null, duration_ms: 180000, _requestedBy: { name: 'DemoUserA', avatar: '' } },
      { id: 'demo-track-b', name: 'Demo Track B', artists: [{ name: 'Demo Artist' }], album: { images: [] }, uri: 'spotify:track:1301WleyT98MSxVHPZCA6M', preview_url: null, duration_ms: 200000, _requestedBy: { name: 'DemoUserB', avatar: '' } }
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
    vote,
    forceNextStage,
    togglePause,
    addTrack,
    addTrackList,
    addTrackById,
    addTopTrackByQuery,
    addDemoPair,
    previewTrack,

    // Player
    spotifyPlayer,
    voteRemaining,

    // Hype
    hype,
    hypePulse,

    // Gift Banner
    giftBanner,

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