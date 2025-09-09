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
  OVERTIME_MS,
  VOTE_EXTENSION_CAP_MS
} from '../config/playbackConfig.js';
import { playPreview, stopAllPreviews } from '../lib/audioManager.js';
import { playTick } from '../lib/voteTickAudio.js';

const LOG = '[BattleEngine]';
let battleCounter = 0;

const VOTE_STAGES = new Set(['vote1', 'vote2', 'overtime']);

export default function useBattleEngine() {
  const [queue, setQueue] = useState([]);
  const [currentBattle, setCurrentBattle] = useState(null);
  const [spotifyPlayer, setSpotifyPlayer] = useState(null);
  const [voteRemaining, setVoteRemaining] = useState(0);

  const timersRef = useRef({
    main: null,
    raf: null,
    voteInterval: null,
    winnerTimer: null,
    nextTimer: null
  });
  const playbackRetryRef = useRef({ key: null });

  /* ---------- Queue Management ---------- */
  const addTrack = useCallback((track) => {
    if (!track) return;
    if (!track.uri && track.id) track.uri = 'spotify:track:' + track.id;
    setQueue(q => [...q, track]);
  }, []);

  const addTrackList = useCallback((tracks) => {
    setQueue(q => [
      ...q,
      ...tracks.map(t => {
        if (!t.uri && t.id) t.uri = 'spotify:track:' + t.id;
        return t;
      })
    ]);
  }, []);

  /* ---------- Battle Initialization ---------- */
  const initBattle = useCallback(() => {
    if (queue.length < 2) return null;
    const [a, b, ...rest] = queue;
    setQueue(rest);
    const battle = {
      id: ++battleCounter,
      a,
      b,
      stage: 'intro',
      stageStartedAt: Date.now(),
      startedAt: Date.now(),
      paused: false,
      // window is an array of { a: Set, b: Set }
      votesWindows: [
        { a: new Set(), b: new Set() },
        { a: new Set(), b: new Set() }
      ],
      voteTotals: { a: 0, b: 0 },
      winner: null,
      voteWindowIndex: null,  // 0,1,2...
      voteEndsAt: null,
      overtimeRequested: false
    };
    setCurrentBattle(battle);
    return battle;
  }, [queue]);

  const tryStartBattle = useCallback(() => {
    if (currentBattle && currentBattle.stage !== 'finished') {
      console.warn(LOG, 'Battle in progress.');
      return;
    }
    const b = initBattle();
    if (b) {
      scheduleStage('r1A_play');
    }
  }, [currentBattle, initBattle]);

  const nextBattle = tryStartBattle;

  /* ---------- Voting Logic ---------- */
  const recomputeTotals = useCallback((battle) => {
    if (!battle?.votesWindows?.length) return { a: 0, b: 0 };
    let a = 0, b = 0;
    for (const w of battle.votesWindows) {
      a += w.a.size;
      b += w.b.size;
    }
    return { a, b };
  }, []);

  const vote = useCallback((choice, userId = 'anon') => {
    if (choice !== 'a' && choice !== 'b') return;
    setCurrentBattle(prev => {
      if (!prev) return prev;
      if (!VOTE_STAGES.has(prev.stage)) return prev;

      const idx =
        prev.stage === 'vote1' ? 0 :
        prev.stage === 'vote2' ? 1 :
        prev.stage === 'overtime' ? 2 :
        null;
      if (idx == null) return prev;

      // Ensure overtime window exists when stage is 'overtime'
      const windows = [...prev.votesWindows];
      if (idx === 2 && windows.length < 3) {
        windows.push({ a: new Set(), b: new Set() });
      }

      // SINGLE_PER_BATTLE: ignore if user already voted in any window
      if (VOTING_RULE === 'SINGLE_PER_BATTLE') {
        for (const w of windows) {
          if (w.a.has(userId) || w.b.has(userId)) return prev;
        }
      } else {
        // PER_WINDOW: ignore if already voted in this window
        const w = windows[idx];
        if (w.a.has(userId) || w.b.has(userId)) return prev;
      }

      // Add vote
      const newWindows = windows.map((w, i) => ({
        a: new Set(w.a),
        b: new Set(w.b)
      }));
      if (choice === 'a') newWindows[idx].a.add(userId);
      else newWindows[idx].b.add(userId);

      const totals = recomputeTotals({ votesWindows: newWindows });
      return {
        ...prev,
        votesWindows: newWindows,
        voteTotals: totals
      };
    });
  }, [recomputeTotals]);

  /* ---------- Gift-driven time extension and overtime ---------- */
  const extendCurrentVoteBy = useCallback((ms) => {
    if (!ms || ms <= 0) return;
    setCurrentBattle(prev => {
      if (!prev) return prev;
      if (!VOTE_STAGES.has(prev.stage)) return prev;
      const now = Date.now();

      // Cap: base window + cap
      const hardCap = prev.stageStartedAt + VOTE_WINDOW_MS + VOTE_EXTENSION_CAP_MS;
      const newEnds = Math.min(hardCap, (prev.voteEndsAt || now) + ms);
      const newRemaining = Math.max(0, newEnds - now);

      return {
        ...prev,
        voteEndsAt: newEnds
      };
    });
  }, []);

  const requestOvertime = useCallback(() => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      if (prev.overtimeRequested) return prev;
      return { ...prev, overtimeRequested: true };
    });
  }, []);

  /* ---------- Controls ---------- */
  const togglePause = useCallback(() => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      const paused = !prev.paused;
      if (paused) {
        clearAllTimers();
        if (PLAYBACK_MODE === 'FULL') {
          try { spotifyPlayer?.pause?.(); } catch {}
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

  /* ---------- Stage Handling (no snapshots) ---------- */
  function advanceStage() {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      let next;
      switch (prev.stage) {
        case 'intro':     next = 'r1A_play'; break;
        case 'r1A_play':  next = 'r1B_play'; break;
        case 'r1B_play':  next = 'vote1'; break;
        case 'vote1':     next = 'r2A_play'; break;
        case 'r2A_play':  next = 'r2B_play'; break;
        case 'r2B_play':  next = 'vote2'; break;
        case 'vote2':     next = prev.overtimeRequested ? 'overtime' : 'winner'; break;
        case 'overtime':  next = 'winner'; break;
        case 'winner':    next = 'finished'; break;
        default:          next = 'finished';
      }
      scheduleStage(next);
      return prev;
    });
  }

  function scheduleStage(nextStage, _isResume = false) {
    clearPlaybackTimers();
    setCurrentBattle(prev => {
      const b = prev;
      if (!b) return prev;
      let updated = { ...b, stage: nextStage, stageStartedAt: Date.now() };

      if (nextStage === 'finished') {
        console.log(LOG, 'Battle finished', updated.voteTotals, 'Winner:', updated.winner);
        // Auto-start next battle after a delay (if configured)
        if (BATTLE_AUTOSTART_NEXT_DELAY > 0) {
          timersRef.current.nextTimer = setTimeout(() => {
            tryStartBattle();
          }, BATTLE_AUTOSTART_NEXT_DELAY);
        }
        return updated;
      }

      if (nextStage === 'winner') {
        // Pause playback and compute final totals/winner from the latest state
        if (PLAYBACK_MODE === 'FULL') {
          try { spotifyPlayer?.pause?.(); } catch {}
        } else {
          stopAllPreviews();
        }
        const totals = recomputeTotals(b);
        const winner = computeWinner(totals);

        updated = {
          ...b,
          stage: 'winner',
          stageStartedAt: Date.now(),
          voteTotals: totals,
          winner,
          voteWindowIndex: null,
          voteEndsAt: null
        };

        // Show winner animation, then transition to finished
        if (timersRef.current.winnerTimer) {
          clearTimeout(timersRef.current.winnerTimer);
          timersRef.current.winnerTimer = null;
        }
        timersRef.current.winnerTimer = setTimeout(() => {
          advanceStage(); // goes to 'finished'
        }, WINNER_ANIMATION_MS);

        return updated;
      }

      if (VOTE_STAGES.has(nextStage)) {
        updated = enterVoteStage(updated, nextStage);
      } else {
        startPlaybackStage(nextStage, updated);
      }

      return updated;
    });
  }

  function computeWinner(totals) {
    if (!totals) return null;
    const { a, b } = totals;
    if (a === b) return null;
    return a > b ? 'a' : 'b';
  }

  function enterVoteStage(battle, stage) {
    if (PLAYBACK_MODE === 'FULL') {
      try { spotifyPlayer?.pause?.(); } catch {}
    } else {
      stopAllPreviews();
    }

    let idx = stage === 'vote1' ? 0 : stage === 'vote2' ? 1 : 2;

    // Ensure overtime window exists
    const windows = [...battle.votesWindows];
    if (idx === 2 && windows.length < 3) {
      windows.push({ a: new Set(), b: new Set() });
    }

    const voteEndsAt = Date.now() + (stage === 'overtime' ? OVERTIME_MS : VOTE_WINDOW_MS);
    const updated = {
      ...battle,
      votesWindows: windows,
      voteWindowIndex: idx,
      voteEndsAt
    };
    setVoteRemaining(stage === 'overtime' ? OVERTIME_MS : VOTE_WINDOW_MS);

    if (timersRef.current.voteInterval) {
      clearInterval(timersRef.current.voteInterval);
      timersRef.current.voteInterval = null;
    }
    timersRef.current.voteInterval = setInterval(() => {
      const remaining = updated.voteEndsAt - Date.now();
      if (remaining <= 0) {
        setVoteRemaining(0);
        clearInterval(timersRef.current.voteInterval);
        timersRef.current.voteInterval = null;
        setTimeout(() => advanceStage(), 120);
      } else {
        playTick();
        setVoteRemaining(remaining);
      }
    }, 1000);

    return updated;
  }

  function startPlaybackStage(stage, battle) {
    const segment = resolveSegment(stage);
    if (!segment) return;
    const track = battle[segment.side];
    if (!track) return;
    if (battle.paused) return;

    if (PLAYBACK_MODE === 'FULL') {
      playSpotifySegment(track, segment.offsetMs);
    } else {
      playPreviewSegment(track, segment.side, segment.offsetMs, segment.durationMs);
    }
    scheduleSegmentEnd(segment);
  }

  function resolveSegment(stage) {
    switch (stage) {
      case 'r1A_play': return { side: 'a', offsetMs: 0, durationMs: ROUND1_SEGMENT_MS };
      case 'r1B_play': return { side: 'b', offsetMs: 0, durationMs: ROUND1_SEGMENT_MS };
      case 'r2A_play': return { side: 'a', offsetMs: ROUND1_SEGMENT_MS, durationMs: ROUND2_SEGMENT_MS };
      case 'r2B_play': return { side: 'b', offsetMs: ROUND1_SEGMENT_MS, durationMs: ROUND2_SEGMENT_MS };
      default: return null;
    }
  }

  function scheduleSegmentEnd(segment) {
    const target = performance.now() + segment.durationMs;
    const early = Math.max(0, segment.durationMs - TRANSITION_BUFFER);
    timersRef.current.main = setTimeout(() => {
      const spin = () => {
        if (performance.now() >= target - 5) {
          if (STAGE_GAP_MS > 0) {
            setTimeout(() => advanceStage(), STAGE_GAP_MS);
          } else {
            advanceStage();
          }
        } else {
          timersRef.current.raf = requestAnimationFrame(spin);
        }
      };
      spin();
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
        if ((res.status === 404 || res.status === 403) && deviceId) {
          const retryKey = track.id + ':' + offsetMs;
          if (playbackRetryRef.current.key !== retryKey) {
            playbackRetryRef.current.key = retryKey;
            console.warn(LOG, 'Playback 404/403, attempting device transfer & retry...');
            await transferToDevice(token, deviceId);
            await new Promise(r => setTimeout(r, 400));
            await doPlay();
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
    if (timersRef.current.nextTimer) clearTimeout(timersRef.current.nextTimer);
    timersRef.current.main = null;
    timersRef.current.raf = null;
    timersRef.current.winnerTimer = null;
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
    // gift-driven controls:
    extendCurrentVoteBy,
    requestOvertime
  };
}