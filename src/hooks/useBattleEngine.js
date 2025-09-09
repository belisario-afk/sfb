import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PLAYBACK_MODE,
  ROUND1_SEGMENT_MS,
  ROUND2_SEGMENT_MS,
  VOTE_WINDOW_MS,
  TRANSITION_BUFFER,
  STAGE_GAP_MS,
  BATTLE_AUTOSTART_NEXT_DELAY,
  VOTING_RULE,
  WINNER_ANIMATION_MS,
  VICTORY_PLAY_OFFSET_MS,
  VICTORY_MIN_PLAY_MS
} from '../config/playbackConfig.js';
import { playPreview, stopAllPreviews } from '../lib/audioManager.js';
import { playTick } from '../lib/voteTickAudio.js';

const LOG = '[BattleEngine]';
let battleCounter = 0;

const VOTE_STAGES = new Set(['vote1', 'vote2']);

export default function useBattleEngine(spotifyClientId) {
  const [queue, setQueue] = useState([]);
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  const [currentBattle, setCurrentBattle] = useState(null);
  const [spotifyPlayer, setSpotifyPlayer] = useState(null);

  const [voteRemaining, setVoteRemaining] = useState(0);

  const timersRef = useRef({
    main: null,
    raf: null,
    voteInterval: null,
    winnerTimer: null,
    victoryTimer: null,
    nextTimer: null
  });
  const stageVersionRef = useRef(0); // guards against stale timers
  const playbackRetryRef = useRef({ key: null }); // track -> single retry guard

  /* ---------- Queue Management ---------- */
  const addTrack = useCallback((track) => {
    if (!track) return;
    if (!track.uri && track.id) track.uri = 'spotify:track:' + track.id;
    setQueue(q => {
      const exists = q.some(t => (t.id && track.id && t.id === track.id) || (t.uri && track.uri && t.uri === track.uri));
      if (exists) return q;
      return [...q, track];
    });
  }, []);

  const addTrackList = useCallback((tracks) => {
    setQueue(q => {
      const setIds = new Set(q.map(t => t.id || t.uri || ''));
      const add = [];
      for (const t0 of tracks) {
        const t = { ...t0 };
        if (!t.uri && t.id) t.uri = 'spotify:track:' + t.id;
        const id = t.id || (t.uri || '');
        if (!setIds.has(id)) {
          setIds.add(id);
          add.push(t);
        }
      }
      return [...q, ...add];
    });
  }, []);

  // Promote latest song in queue for a requester to the very front (index 0)
  const promoteRequesterLatest = useCallback((user) => {
    if (!user) return false;
    const userId = user.id || user.userId || '';
    const username = user.username || user.name || '';
    let promoted = false;
    setQueue(q => {
      if (!q.length) return q;
      // Find most recent index that matches requester
      let idx = -1;
      for (let i = q.length - 1; i >= 0; i--) {
        const rb = q[i]?._requestedBy || {};
        const idMatch = userId && rb.id && rb.id === userId;
        const nameMatch = username && (rb.username === username || rb.name === username);
        if (idMatch || nameMatch) { idx = i; break; }
      }
      if (idx <= 0) { // -1 not found or already at front
        promoted = idx === 0;
        return q;
      }
      const copy = q.slice();
      const [track] = copy.splice(idx, 1);
      copy.unshift(track);
      promoted = true;
      return copy;
    });
    return promoted;
  }, []);

  /* ---------- Battle Initialization ---------- */
  const initBattle = useCallback(() => {
    if (queueRef.current.length < 2) return null;
    const [a, b, ...rest] = queueRef.current;
    setQueue(rest);
    const battle = {
      id: ++battleCounter,
      a,
      b,
      stage: 'intro',
      stageStartedAt: Date.now(),
      startedAt: Date.now(),
      paused: false,
      votesWindows: [
        { a: new Set(), b: new Set() },
        { a: new Set(), b: new Set() }
      ],
      voteTotals: { a: 0, b: 0 },
      winner: null,
      voteWindow: null,
      voteEndsAt: null
    };
    setCurrentBattle(battle);
    return battle;
  }, []);

  const tryStartBattle = useCallback(() => {
    if (currentBattle && currentBattle.stage !== 'finished') {
      console.warn(LOG, 'Battle in progress.');
      return;
    }
    if (queueRef.current.length < 2) {
      console.warn(LOG, 'Not enough tracks in queue to start next battle.');
      return;
    }
    const b = initBattle();
    if (b) {
      scheduleStage('r1A_play');
    }
  }, [currentBattle, initBattle]);

  const nextBattle = tryStartBattle;

  /* ---------- Voting Logic ---------- */
  const vote = useCallback((choice, userId = 'anon') => {
    if (choice !== 'a' && choice !== 'b') return;
    setCurrentBattle(prev => {
      if (!prev) return prev;
      if (!VOTE_STAGES.has(prev.stage)) return prev;
      const windowIndex = prev.stage === 'vote1' ? 0 : 1;

      if (VOTING_RULE === 'SINGLE_PER_BATTLE') {
        const already =
          prev.votesWindows[0].a.has(userId) ||
          prev.votesWindows[0].b.has(userId) ||
          prev.votesWindows[1].a.has(userId) ||
          prev.votesWindows[1].b.has(userId);
        if (already) return prev;
      } else {
        const win = prev.votesWindows[windowIndex];
        if (win.a.has(userId) || win.b.has(userId)) return prev;
      }

      const newWindows = [
        { a: new Set(prev.votesWindows[0].a), b: new Set(prev.votesWindows[0].b) },
        { a: new Set(prev.votesWindows[1].a), b: new Set(prev.votesWindows[1].b) }
      ];
      if (choice === 'a') newWindows[windowIndex].a.add(userId);
      else newWindows[windowIndex].b.add(userId);

      const totalA = newWindows[0].a.size + newWindows[1].a.size;
      const totalB = newWindows[0].b.size + newWindows[1].b.size; // FIXED

      return {
        ...prev,
        votesWindows: newWindows,
        voteTotals: { a: totalA, b: totalB }
      };
    });
  }, []);

  /* ---------- Controls ---------- */
  const togglePause = useCallback(() => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      const paused = !prev.paused;
      if (paused) {
        clearAllTimers();
        // Pause everywhere
        if (PLAYBACK_MODE === 'FULL') {
          try { spotifyPlayer?.pause?.(); } catch {}
          pauseSpotifyPlayback(); // Web API pause
        } else {
          stopAllPreviews();
        }
      } else {
        scheduleStage(prev.stage, true);
      }
      return { ...prev, paused };
    });
  }, [spotifyPlayer]);

  const forceNextStage = useCallback(() => {
    clearAllTimers();
    advanceStage();
  }, []);

  /* ---------- Helpers: Spotify Web API pause ---------- */
  function getStoredAccessToken() {
    try {
      const raw = localStorage.getItem('spotifyTokens');
      if (!raw) return null;
      return JSON.parse(raw).accessToken || null;
    } catch { return null; }
  }
  async function pauseSpotifyPlayback() {
    const token = getStoredAccessToken();
    if (!token) return;
    try {
      await fetch('https://api.spotify.com/v1/me/player/pause', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token }
      });
    } catch (e) {
      console.warn(LOG, 'Pause API error', e);
    }
  }

  /* ---------- Stage Handling with Version Guard ---------- */
  function advanceStage() {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      let next;
      switch (prev.stage) {
        case 'intro':        next = 'r1A_play'; break;
        case 'r1A_play':     next = 'r1B_play'; break;
        case 'r1B_play':     next = 'vote1'; break;
        case 'vote1':        next = 'r2A_play'; break;
        case 'r2A_play':     next = 'r2B_play'; break;
        case 'r2B_play':     next = 'vote2'; break;
        case 'vote2':        next = 'winner'; break;
        case 'winner':       next = 'victory_play'; break;
        case 'victory_play': next = 'finished'; break;
        default:             next = 'finished';
      }
      scheduleStage(next);
      return prev;
    });
  }

  function recomputeTotals(battle) {
    const aCount = (battle.votesWindows?.[0]?.a?.size || 0) + (battle.votesWindows?.[1]?.a?.size || 0);
    const bCount = (battle.votesWindows?.[0]?.b?.size || 0) + (battle.votesWindows?.[1]?.b?.size || 0);
    return { a: aCount, b: bCount };
  }

  function scheduleStage(nextStage, _isResume = false) {
    stageVersionRef.current += 1;
    const thisVersion = stageVersionRef.current;
    clearPlaybackTimers();

    // Stop any preview before starting a new segment to prevent overlap/repeats
    if (PLAYBACK_MODE !== 'FULL') {
      stopAllPreviews();
    }

    setCurrentBattle(prev => {
      const b = prev;
      if (!b) return prev;
      let updated = { ...b, stage: nextStage, stageStartedAt: Date.now() };

      if (nextStage === 'finished') {
        console.log(LOG, 'Battle finished', updated.voteTotals, 'Winner:', updated.winner);
        setVoteRemaining(0);
        if (BATTLE_AUTOSTART_NEXT_DELAY > 0) {
          timersRef.current.nextTimer = setTimeout(() => {
            if (thisVersion !== stageVersionRef.current) return;
            if (queueRef.current.length >= 2) {
              tryStartBattle();
            } else {
              console.warn(LOG, 'Auto-start skipped: queue has fewer than 2 tracks.');
            }
          }, BATTLE_AUTOSTART_NEXT_DELAY);
        }
        return updated;
      }

      if (nextStage === 'winner') {
        if (PLAYBACK_MODE === 'FULL') {
          try { spotifyPlayer?.pause?.(); } catch {}
          pauseSpotifyPlayback();
        } else {
          stopAllPreviews();
        }
        const finalTotals = recomputeTotals(b);
        const finalWinner = computeWinner({ ...b, voteTotals: finalTotals });

        updated = {
          ...b,
          stage: 'winner',
          stageStartedAt: Date.now(),
          voteTotals: finalTotals,
          winner: finalWinner,
          voteWindow: null,
          voteEndsAt: null
        };
        setVoteRemaining(0);

        if (timersRef.current.winnerTimer) clearTimeout(timersRef.current.winnerTimer);
        timersRef.current.winnerTimer = setTimeout(() => {
          if (thisVersion === stageVersionRef.current) {
            advanceStage(); // -> victory_play
          }
        }, WINNER_ANIMATION_MS);

        return updated;
      }

      if (nextStage === 'victory_play') {
        if (!b.winner) {
          setTimeout(() => {
            if (thisVersion === stageVersionRef.current) advanceStage();
          }, 50);
        } else {
          const side = b.winner; // 'a' or 'b'
          const track = b[side];
          const durationTotal = Number(track?.duration_ms) || 180_000;
          let offsetMs = VICTORY_PLAY_OFFSET_MS;
          if (offsetMs >= durationTotal) {
            offsetMs = Math.max(0, durationTotal - VICTORY_MIN_PLAY_MS);
          }
          const remainingMs = Math.max(VICTORY_MIN_PLAY_MS, durationTotal - offsetMs);

          if (PLAYBACK_MODE === 'FULL') {
            playSpotifySegment(track, offsetMs);
          } else {
            const seconds = Math.min(10, Math.max(5, remainingMs / 1000));
            if (track?.preview_url) {
              playPreview('VICTORY', track.preview_url, seconds);
            }
          }

          if (timersRef.current.victoryTimer) clearTimeout(timersRef.current.victoryTimer);
          timersRef.current.victoryTimer = setTimeout(() => {
            if (thisVersion === stageVersionRef.current) {
              advanceStage(); // -> finished
            }
          }, remainingMs);
        }
        return updated;
      }

      if (VOTE_STAGES.has(nextStage)) {
        updated = enterVoteStage(updated, nextStage, thisVersion);
      } else {
        startPlaybackStage(nextStage, updated, thisVersion);
      }

      return updated;
    });
  }

  function computeWinner(battle) {
    const { a, b } = battle.voteTotals;
    if (a === b) return null;
    return a > b ? 'a' : 'b';
  }

  function enterVoteStage(battle, stage, version) {
    if (PLAYBACK_MODE === 'FULL') {
      try { spotifyPlayer?.pause?.(); } catch {}
      pauseSpotifyPlayback();
    } else {
      stopAllPreviews();
    }
    const windowIndex = stage === 'vote1' ? 0 : 1;
    const voteEndsAt = Date.now() + VOTE_WINDOW_MS;
    const updated = { ...battle, voteWindow: windowIndex + 1, voteEndsAt };
    setVoteRemaining(VOTE_WINDOW_MS);

    if (timersRef.current.voteInterval) {
      clearInterval(timersRef.current.voteInterval);
      timersRef.current.voteInterval = null;
    }
    timersRef.current.voteInterval = setInterval(() => {
      if (version !== stageVersionRef.current) return;
      const remaining = voteEndsAt - Date.now();
      if (remaining <= 0) {
        setVoteRemaining(0);
        clearInterval(timersRef.current.voteInterval);
        timersRef.current.voteInterval = null;
        setTimeout(() => {
          if (version === stageVersionRef.current) advanceStage();
        }, 120);
      } else {
        playTick();
        setVoteRemaining(remaining);
      }
    }, 1000);

    return updated;
  }

  function startPlaybackStage(stage, battle, version) {
    const segment = resolveSegment(stage);
    if (!segment) return;
    const track = battle[segment.side];
    if (!track) return;
    if (battle.paused) return;

    if (PLAYBACK_MODE === 'FULL') {
      playSpotifySegment(track, segment.offsetMs);
    } else {
      // Ensure any previous preview is stopped before starting a new one
      stopAllPreviews();
      playPreviewSegment(track, segment.side, segment.offsetMs, segment.durationMs);
    }
    scheduleSegmentEnd(segment.durationMs, version);
  }

  function resolveSegment(stage) {
    switch (stage) {
      case 'r1A_play': return { side: 'a', offsetMs: 0,                 durationMs: ROUND1_SEGMENT_MS };
      case 'r1B_play': return { side: 'b', offsetMs: 0,                 durationMs: ROUND1_SEGMENT_MS };
      case 'r2A_play': return { side: 'a', offsetMs: ROUND1_SEGMENT_MS, durationMs: ROUND2_SEGMENT_MS };
      case 'r2B_play': return { side: 'b', offsetMs: ROUND1_SEGMENT_MS, durationMs: ROUND2_SEGMENT_MS };
      default: return null;
    }
  }

  function scheduleSegmentEnd(durationMs, version) {
    const target = performance.now() + durationMs;
    const early = Math.max(0, durationMs - TRANSITION_BUFFER);
    timersRef.current.main = setTimeout(function spin() {
      if (version !== stageVersionRef.current) return; // stale
      if (performance.now() >= target - 5) {
        if (STAGE_GAP_MS > 0) {
          setTimeout(() => {
            if (version === stageVersionRef.current) advanceStage();
          }, STAGE_GAP_MS);
        } else {
          advanceStage();
        }
      } else {
        timersRef.current.raf = requestAnimationFrame(spin);
      }
    }, early);
  }

  async function playSpotifySegment(track, offsetMs) {
    const raw = localStorage.getItem('spotifyTokens');
    if (!raw) return;
    let token;
    try { token = JSON.parse(raw).accessToken; } catch {}
    if (!token || !track.uri) return;

    const deviceId = localStorage.getItem('spotify_device_id') || null;

    const doPlay = async () => fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uris: [track.uri],
        position_ms: offsetMs
      })
    });

    try {
      const res = await doPlay();
      if (!res.ok) {
        // Handle 404/403 by trying a transfer once
        if ((res.status === 404 || res.status === 403) && deviceId) {
          const retryKey = (track.id || track.uri) + ':' + offsetMs;
          if (playbackRetryRef.current.key !== retryKey) {
            playbackRetryRef.current.key = retryKey;
            console.warn(LOG, 'Playback 404/403, attempting device transfer & retry...');
            await transferToDevice(token, deviceId);
            await new Promise(r => setTimeout(r, 400));
            const res2 = await doPlay();
            if (!res2.ok) {
              console.warn(LOG, 'Retry failed', res2.status);
            }
          } else {
            console.warn(LOG, 'Already retried this segment; giving up.');
          }
        } else {
          console.warn(LOG, 'Playback request failed', res.status);
        }
      }
    } catch (e) {
      console.warn(LOG, 'Full playback error', e);
    }
  }

  async function transferToDevice(token, deviceId) {
    try {
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ device_ids: [deviceId], play: false })
      });
    } catch (e) {
      console.warn(LOG, 'Device transfer failed', e);
    }
  }

  function playPreviewSegment(track, side, offsetMs, durationMs) {
    if (!track.preview_url) return;
    const seconds = Math.max(0.5, Math.min(durationMs, 30_000 - offsetMs) / 1000);
    playPreview(`SEG-${side}`, track.preview_url, seconds);
  }

  /* ---------- Cleanup ---------- */
  function clearPlaybackTimers() {
    if (timersRef.current.main) clearTimeout(timersRef.current.main);
    if (timersRef.current.raf) cancelAnimationFrame(timersRef.current.raf);
    if (timersRef.current.winnerTimer) clearTimeout(timersRef.current.winnerTimer);
    if (timersRef.current.victoryTimer) clearTimeout(timersRef.current.victoryTimer);
    if (timersRef.current.nextTimer) clearTimeout(timersRef.current.nextTimer);
    timersRef.current.main = null;
    timersRef.current.raf = null;
    timersRef.current.winnerTimer = null;
    timersRef.current.victoryTimer = null;
    timersRef.current.nextTimer = null;
  }

  function clearAllTimers() {
    clearPlaybackTimers();
    if (timersRef.current.voteInterval) {
      clearInterval(timersRef.current.voteInterval);
      timersRef.current.voteInterval = null;
    }
  }

  useEffect(() => clearAllTimers, []);

  return {
    queue,
    addTrack,
    addTrackList,
    currentBattle,
    tryStartBattle,
    nextBattle,
    vote,
    forceNextStage,
    togglePause,
    spotifyPlayer,
    setSpotifyPlayer,
    voteRemaining,
    promoteRequesterLatest // exposed for mega gifts
  };
}