import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PLAYBACK_MODE,
  ROUND1_SEGMENT_MS,
  ROUND2_SEGMENT_MS,
  VOTE_WINDOW_MS,
  TRANSITION_BUFFER,
  STAGE_GAP_MS,
  BATTLE_AUTOSTART_NEXT_DELAY,
  VOTING_RULE
} from '../config/playbackConfig.js';
import { playPreview, stopAllPreviews } from '../lib/audioManager.js';
import { playTick } from '../lib/voteTickAudio.js';

/**
 * New Stage Flow:
 *  intro
 *  r1A_play   (A 0–20s)
 *  r1B_play   (B 0–20s)
 *  vote1      (10s) – voting enabled
 *  r2A_play   (A 20–40s)
 *  r2B_play   (B 20–40s)
 *  vote2      (10s) – voting enabled
 *  finished
 *
 * Voting Accumulation:
 * battle.votesWindows = [
 *   { a:Set<userId>, b:Set<userId> }, // window 1
 *   { a:Set<userId>, b:Set<userId> }  // window 2
 * ]
 * voteTotals = { a:number, b:number } = sum of both windows (plus any rule-based logic)
 *
 * VOTING_RULE:
 *  - 'PER_WINDOW': user may vote once in each window
 *  - 'SINGLE_PER_BATTLE': user may only vote in the first window they participate
 */

const LOG = '[BattleEngine]';
let battleCounter = 0;

const VOTE_STAGES = new Set(['vote1', 'vote2']);

export default function useBattleEngine(spotifyClientId) {
  const [queue, setQueue] = useState([]);
  const [currentBattle, setCurrentBattle] = useState(null);
  const [spotifyPlayer, setSpotifyPlayer] = useState(null);

  // Vote countdown state
  const [voteRemaining, setVoteRemaining] = useState(0);

  const timersRef = useRef({ main: null, raf: null, voteInterval: null });
  const pendingStageRef = useRef(null);

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

      // Voting windows
      votesWindows: [
        { a: new Set(), b: new Set() },  // vote1
        { a: new Set(), b: new Set() }   // vote2
      ],
      voteTotals: { a: 0, b: 0 },
      winner: null,

      voteWindow: null,
      voteEndsAt: null
    };
    setCurrentBattle(battle);
    return battle;
  }, [queue]);

  const tryStartBattle = useCallback(() => {
    if (currentBattle && currentBattle.stage !== 'finished') {
      console.warn(LOG, 'Battle still in progress.');
      return;
    }
    const b = initBattle();
    if (b) {
      scheduleStage('r1A_play', b);
    }
  }, [currentBattle, initBattle]);

  const nextBattle = tryStartBattle;

  /* ---------- Voting Logic ---------- */
  const vote = useCallback((choice, userId = 'anon') => {
    if (choice !== 'a' && choice !== 'b') return;
    setCurrentBattle(prev => {
      if (!prev) return prev;
      if (!VOTE_STAGES.has(prev.stage)) return prev; // only allow in vote stages
      const windowIndex = prev.stage === 'vote1' ? 0 : 1;

      // Check single-per-battle rule
      if (VOTING_RULE === 'SINGLE_PER_BATTLE') {
        // If user already appears in either window sets, ignore
        const alreadyVoted =
          prev.votesWindows[0].a.has(userId) ||
          prev.votesWindows[0].b.has(userId) ||
          prev.votesWindows[1].a.has(userId) ||
          prev.votesWindows[1].b.has(userId);
        if (alreadyVoted) return prev;
      } else {
        // PER_WINDOW: only block if user already voted this specific window
        const win = prev.votesWindows[windowIndex];
        if (win.a.has(userId) || win.b.has(userId)) return prev;
      }

      const newWindows = [
        {
          a: new Set(prev.votesWindows[0].a),
          b: new Set(prev.votesWindows[0].b)
        },
        {
          a: new Set(prev.votesWindows[1].a),
          b: new Set(prev.votesWindows[1].b)
        }
      ];

      if (choice === 'a') newWindows[windowIndex].a.add(userId);
      else newWindows[windowIndex].b.add(userId);

      // Recalculate totals (sum both windows)
      const totalA =
        newWindows[0].a.size + newWindows[1].a.size;
      const totalB =
        newWindows[0].b.size + newWindows[1].b.size;

      return {
        ...prev,
        votesWindows: newWindows,
        voteTotals: { a: totalA, b: totalB }
      };
    });
  }, []);

  /* ---------- Public Controls ---------- */
  const togglePause = useCallback(() => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      const paused = !prev.paused;
      if (paused) {
        clearTimersAll();
        if (PLAYBACK_MODE === 'FULL') {
          try { spotifyPlayer?.pause(); } catch {}
        } else {
          stopAllPreviews();
        }
      } else {
        // Resume current stage from start (simpler)
        scheduleStage(prev.stage, prev, true);
      }
      return { ...prev, paused };
    });
  }, [spotifyPlayer]);

  const forceNextStage = useCallback(() => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      clearTimersAll();
      advanceStage(prev);
      return prev;
    });
  }, []);

  /* ---------- Stage Management ---------- */

  function advanceStage(snapshot) {
    setCurrentBattle(prev => {
      const b = snapshot || prev;
      if (!b) return prev;

      let next;
      switch (b.stage) {
        case 'intro':     next = 'r1A_play'; break;
        case 'r1A_play':  next = 'r1B_play'; break;
        case 'r1B_play':  next = 'vote1'; break;
        case 'vote1':     next = 'r2A_play'; break;
        case 'r2A_play':  next = 'r2B_play'; break;
        case 'r2B_play':  next = 'vote2'; break;
        case 'vote2':     next = 'finished'; break;
        default:          next = 'finished';
      }

      scheduleStage(next, b);
      return b;
    });
  }

  function scheduleStage(nextStage, battleArg, isRestart = false) {
    clearTimersPlayback();
    setCurrentBattle(prev => {
      const b = battleArg || prev;
      if (!b) return prev;

      let updated = {
        ...b,
        stage: nextStage,
        stageStartedAt: Date.now()
      };

      if (nextStage === 'finished') {
        updated.winner = computeWinner(updated);
        console.log(LOG, 'Battle finished. Totals:', updated.voteTotals, 'Winner:', updated.winner);
        if (BATTLE_AUTOSTART_NEXT_DELAY > 0) {
          timersRef.current.main = setTimeout(() => {
            tryStartBattle();
          }, BATTLE_AUTOSTART_NEXT_DELAY);
        }
        setVoteRemaining(0);
        clearTimersAll();
        setCurrentBattle(updated);
        return updated;
      }

      if (VOTE_STAGES.has(nextStage)) {
        updated = enterVoteStage(updated, nextStage);
      } else {
        // playback stage
        startPlaybackSegment(nextStage, updated);
      }

      setCurrentBattle(updated);
      return updated;
    });
  }

  function enterVoteStage(battle, stage) {
    // Pause playback if in full mode
    if (PLAYBACK_MODE === 'FULL') {
      try { spotifyPlayer?.pause?.(); } catch {}
    } else {
      stopAllPreviews();
    }
    const windowIndex = stage === 'vote1' ? 0 : 1;
    const voteEndsAt = Date.now() + VOTE_WINDOW_MS;
    const updated = {
      ...battle,
      voteWindow: windowIndex + 1,
      voteEndsAt
    };
    setVoteRemaining(VOTE_WINDOW_MS);

    // Start countdown interval
    if (timersRef.current.voteInterval) {
      clearInterval(timersRef.current.voteInterval);
    }
    timersRef.current.voteInterval = setInterval(() => {
      setVoteRemaining(rem => {
        const newRem = voteEndsAt - Date.now();
        if (newRem <= 0) {
          clearInterval(timersRef.current.voteInterval);
          timersRef.current.voteInterval = null;
          // Advance after small buffer to allow UI animate out
          setTimeout(() => advanceStage(updated), 150);
          return 0;
        } else {
          // Play tick each elapsed second boundary
          const sec = Math.ceil(newRem / 1000);
          // Use tick on every call when remainder crosses integer boundary
          playTick();
          return newRem;
        }
      });
    }, 1000);

    return updated;
  }

  function computeWinner(battle) {
    const { a, b } = battle.voteTotals;
    if (a === b) return null;
    return a > b ? 'a' : 'b';
  }

  function startPlaybackSegment(stage, battle) {
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

    scheduleSegmentEnd(segment, battle);
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

  function scheduleSegmentEnd(segment, battle) {
    const target = performance.now() + segment.durationMs;
    pendingStageRef.current = { stage: battle.stage, end: target };

    const early = Math.max(0, segment.durationMs - TRANSITION_BUFFER);
    timersRef.current.main = setTimeout(() => {
      const spin = () => {
        if (performance.now() >= target - 5) {
          if (STAGE_GAP_MS > 0) {
            setTimeout(() => advanceStage(battle), STAGE_GAP_MS);
          } else {
            advanceStage(battle);
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
    try {
      await fetch('https://api.spotify.com/v1/me/player/play', {
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
    } catch (e) {
      console.warn(LOG, 'Full playback failed, fallback preview maybe', e);
    }
  }

  function playPreviewSegment(track, side, offsetMs, durationMs) {
    if (!track.preview_url) return;
    const seconds = Math.max(0.5, Math.min(durationMs, 30_000 - offsetMs) / 1000);
    playPreview(`SEG-${side}`, track.preview_url, seconds);
  }

  /* ---------- Cleanup Helpers ---------- */
  const clearTimersPlayback = () => {
    if (timersRef.current.main) clearTimeout(timersRef.current.main);
    if (timersRef.current.raf) cancelAnimationFrame(timersRef.current.raf);
    timersRef.current.main = null;
    timersRef.current.raf = null;
  };

  function clearTimersAll() {
    clearTimersPlayback();
    if (timersRef.current.voteInterval) {
      clearInterval(timersRef.current.voteInterval);
      timersRef.current.voteInterval = null;
    }
  }

  useEffect(() => clearTimersAll, []);

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
    voteRemaining // for UI countdown
  };
}