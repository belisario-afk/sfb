import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SEGMENT_DURATIONS,
  TRANSITION_BUFFER,
  STAGE_GAP_MS,
  BATTLE_AUTOSTART_NEXT_DELAY,
  PLAYBACK_MODE,
  ALLOW_LIVE_VOTING_DURING_ALL_STAGES
} from '../config/playbackConfig.js';
import { playPreview, stopAllPreviews } from '../lib/audioManager.js';

/**
 * Battle Stage Flow:
 *  intro
 *  round1A  (Track A 0–10s)
 *  round1B  (Track B 0–10s)
 *  decideLeader (pick leader based on votes so far; tie -> random)
 *  round2First   (Leader resumes 10–30s)
 *  round2Second  (Other track resumes 10–30s)
 *  finished
 *
 * VOTING (Updated):
 *  - Votes accumulate for the entire battle (NOT reset each stage).
 *  - One vote per unique userId per battle (first vote locks their choice).
 *  - voteCounts / votes sets persist through all stages until finished.
 *  - On new battle start, votes reset (fresh structure).
 */

const LOG = '[BattleEngine]';
let battleCounter = 0;

export default function useBattleEngine(spotifyClientId) {
  const [queue, setQueue] = useState([]);
  const [currentBattle, setCurrentBattle] = useState(null);
  const [spotifyPlayer, setSpotifyPlayer] = useState(null);

  const timersRef = useRef({ main: null, raf: null });
  const pendingStageRef = useRef(null);

  /* -------------------- Queue Management -------------------- */
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

  /* -------------------- Battle Init -------------------- */
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

      // Voting / accumulation
      votes: { a: new Set(), b: new Set() },  // legacy compatibility
      voterMap: new Map(),                    // userId -> 'a' | 'b'
      voteCounts: { a: 0, b: 0 },

      leader: null,
      winner: null,
      paused: false
    };
    setCurrentBattle(battle);
    return battle;
  }, [queue]);

  /* -------------------- Public Controls -------------------- */
  const tryStartBattle = useCallback(() => {
    if (currentBattle && currentBattle.stage !== 'finished') {
      console.warn(LOG, 'Cannot start new battle yet.');
      return;
    }
    const b = initBattle();
    if (b) {
      console.log(LOG, 'Battle started', b.id);
      scheduleStage('round1A', b);
    }
  }, [currentBattle, initBattle]);

  const nextBattle = tryStartBattle;

  const togglePause = useCallback(() => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      const paused = !prev.paused;
      if (paused) {
        clearTimers();
        if (PLAYBACK_MODE === 'FULL') {
          try { spotifyPlayer?.pause(); } catch {}
        } else {
          stopAllPreviews();
        }
      } else {
        // Resume by re-scheduling current stage from start (simpler)
        scheduleStage(prev.stage, prev, true);
      }
      return { ...prev, paused };
    });
  }, [spotifyPlayer]);

  const forceNextStage = useCallback(() => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      clearTimers();
      advanceStage(prev);
      return prev;
    });
  }, []);

  /* -------------------- Voting (Accumulative) -------------------- */
  const vote = useCallback((choice, userId = 'anon') => {
    if (choice !== 'a' && choice !== 'b') return;
    setCurrentBattle(prev => {
      if (!prev) return prev;
      if (prev.stage === 'finished') return prev;
      // If we do NOT want voting during all stages except final:
      if (!ALLOW_LIVE_VOTING_DURING_ALL_STAGES &&
          !['round1A','round1B','round2First','round2Second'].includes(prev.stage)) {
        return prev;
      }
      if (prev.voterMap.has(userId)) {
        // Already voted this battle: ignore
        return prev;
      }
      // Register new vote
      const votesA = new Set(prev.votes.a);
      const votesB = new Set(prev.votes.b);
      if (choice === 'a') votesA.add(userId); else votesB.add(userId);

      const voterMap = new Map(prev.voterMap);
      voterMap.set(userId, choice);

      const voteCounts = {
        a: prev.voteCounts.a + (choice === 'a' ? 1 : 0),
        b: prev.voteCounts.b + (choice === 'b' ? 1 : 0)
      };

      return {
        ...prev,
        votes: { a: votesA, b: votesB },
        voterMap,
        voteCounts
      };
    });
  }, []);

  /* -------------------- Stage Computations -------------------- */
  function computeLeader(battle) {
    const { a, b } = battle.voteCounts;
    if (a === b) {
      // Tie -> random
      return Math.random() < 0.5 ? 'a' : 'b';
    }
    return a > b ? 'a' : 'b';
  }

  function computeWinner(battle) {
    const { a, b } = battle.voteCounts;
    if (a === b) return null; // tie (caller could implement tie-break)
    return a > b ? 'a' : 'b';
  }

  function stageToSegment(stage, battle) {
    const r1 = SEGMENT_DURATIONS.round1;
    const r2 = SEGMENT_DURATIONS.round2;
    switch (stage) {
      case 'round1A': return { side: 'a', offsetMs: 0, durationMs: r1 };
      case 'round1B': return { side: 'b', offsetMs: 0, durationMs: r1 };
      case 'round2First': return { side: battle.leader, offsetMs: r1, durationMs: r2 };
      case 'round2Second': return { side: battle.leader === 'a' ? 'b' : 'a', offsetMs: r1, durationMs: r2 };
      default: return null;
    }
  }

  /* -------------------- Stage Advance & Scheduling -------------------- */
  function advanceStage(snapshot) {
    setCurrentBattle(prev => {
      const b = snapshot || prev;
      if (!b) return prev;
      let next;
      switch (b.stage) {
        case 'intro': next = 'round1A'; break;
        case 'round1A': next = 'round1B'; break;
        case 'round1B': next = 'decideLeader'; break;
        case 'decideLeader': next = 'round2First'; break;
        case 'round2First': next = 'round2Second'; break;
        case 'round2Second': next = 'finished'; break;
        default: next = 'finished';
      }
      scheduleStage(next, b);
      return b;
    });
  }

  function scheduleStage(nextStage, battleArg, isRestart = false) {
    clearTimers();
    setCurrentBattle(prev => {
      const b = battleArg || prev;
      if (!b) return prev;
      let updated = { ...b, stage: nextStage, stageStartedAt: Date.now() };

      if (nextStage === 'decideLeader') {
        updated.leader = computeLeader(updated);
      }

      if (nextStage === 'finished') {
        updated.winner = computeWinner(updated);
        console.log(LOG, 'Battle finished. Votes:', updated.voteCounts, 'Winner:', updated.winner);
        if (BATTLE_AUTOSTART_NEXT_DELAY > 0) {
          timersRef.current.main = setTimeout(() => {
            tryStartBattle();
          }, BATTLE_AUTOSTART_NEXT_DELAY);
        }
        setCurrentBattle(updated);
        return updated;
      }

      const segment = stageToSegment(nextStage, updated);
      if (segment) {
        startSegment(segment, updated);
        scheduleSegmentEnd(segment, updated);
      } else {
        // intro / decideLeader quick transitions
        const delay = nextStage === 'decideLeader' ? 400 : 700;
        timersRef.current.main = setTimeout(() => advanceStage(updated), delay);
      }

      setCurrentBattle(updated);
      return updated;
    });
  }

  function scheduleSegmentEnd(segment, battle) {
    const target = performance.now() + segment.durationMs;
    pendingStageRef.current = { stage: battle.stage, end: target };

    const early = Math.max(0, (segment.durationMs - TRANSITION_BUFFER));
    timersRef.current.main = setTimeout(() => {
      const spin = () => {
        if (performance.now() >= target - 6) {
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

  function hasFullPlaybackEnv() {
    return PLAYBACK_MODE === 'FULL';
  }

  async function startSegment(segment, battle) {
    if (battle.paused) return;
    const track = battle[segment.side];
    if (!track) return;
    if (hasFullPlaybackEnv()) {
      await playSpotifySegment(track, segment.offsetMs);
    } else {
      playPreviewSegment(track, segment.side, segment.offsetMs, segment.durationMs);
    }
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
      console.warn(LOG, 'Full playback failed, consider preview fallback', e);
    }
  }

  function playPreviewSegment(track, side, offsetMs, durationMs) {
    if (!track.preview_url) return;
    const seconds = Math.max(0.5, Math.min(durationMs, 30_000 - offsetMs) / 1000);
    playPreview(`SEG-${side}`, track.preview_url, seconds);
  }

  /* -------------------- Timer Cleanup -------------------- */
  const clearTimers = () => {
    if (timersRef.current.main) clearTimeout(timersRef.current.main);
    if (timersRef.current.raf) cancelAnimationFrame(timersRef.current.raf);
    timersRef.current.main = null;
    timersRef.current.raf = null;
    pendingStageRef.current = null;
  };

  useEffect(() => clearTimers, []);

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
    setSpotifyPlayer
  };
}