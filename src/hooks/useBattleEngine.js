import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SEGMENT_DURATIONS,
  TRANSITION_BUFFER,
  STAGE_GAP_MS,
  BATTLE_AUTOSTART_NEXT_DELAY,
  PLAYBACK_MODE,
  ALLOW_LIVE_VOTING_DURING_ALL_STAGES,
  MAX_SCHED_DRIFT
} from '../config/playbackConfig.js';
import { playPreview, stopAllPreviews } from '../lib/audioManager.js';

let battleCounter = 0;
const LOG = '[BattleEngine]';

export default function useBattleEngine(spotifyClientId) {
  const [queue, setQueue] = useState([]);
  const [currentBattle, setCurrentBattle] = useState(null);
  const [spotifyPlayer, setSpotifyPlayer] = useState(null);

  const timersRef = useRef({ main: null, raf: null });
  const pendingStageRef = useRef(null);

  const addTrack = useCallback((track) => {
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

  const clearTimers = () => {
    if (timersRef.current.main) clearTimeout(timersRef.current.main);
    if (timersRef.current.raf) cancelAnimationFrame(timersRef.current.raf);
    timersRef.current.main = null;
    timersRef.current.raf = null;
    pendingStageRef.current = null;
  };

  const initBattle = useCallback(() => {
    if (queue.length < 2) return null;
    const [a, b, ...rest] = queue;
    setQueue(rest);
    const battle = {
      id: ++battleCounter,
      a,
      b,
      stage: 'intro',
      votes: { a: new Set(), b: new Set() },
      startedAt: Date.now(),
      stageStartedAt: Date.now(),
      leader: null,
      winner: null,
      paused: false
    };
    setCurrentBattle(battle);
    return battle;
  }, [queue]);

  const vote = useCallback((choice, userId = 'anon') => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      if (!ALLOW_LIVE_VOTING_DURING_ALL_STAGES && prev.stage === 'finished') return prev;
      if (choice !== 'a' && choice !== 'b') return prev;
      if (prev.votes[choice].has(userId)) return prev;
      const votes = {
        a: new Set(prev.votes.a),
        b: new Set(prev.votes.b)
      };
      votes[choice].add(userId);
      return { ...prev, votes };
    });
  }, []);

  const tryStartBattle = useCallback(() => {
    if (currentBattle && currentBattle.stage !== 'finished') {
      console.warn(LOG, 'Cannot start new battle: current active.');
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

  function computeLeader(b) {
    const av = b.votes.a.size;
    const bv = b.votes.b.size;
    if (av === bv) return Math.random() < 0.5 ? 'a' : 'b';
    return av > bv ? 'a' : 'b';
  }

  function computeWinner(b) {
    const av = b.votes.a.size;
    const bv = b.votes.b.size;
    if (av === bv) return null;
    return av > bv ? 'a' : 'b';
  }

  function stageToSegment(stage, b) {
    const r1 = SEGMENT_DURATIONS.round1;
    const r2 = SEGMENT_DURATIONS.round2;
    switch (stage) {
      case 'round1A': return { side: 'a', offsetMs: 0, durationMs: r1 };
      case 'round1B': return { side: 'b', offsetMs: 0, durationMs: r1 };
      case 'round2First': return { side: b.leader, offsetMs: r1, durationMs: r2 };
      case 'round2Second': return { side: b.leader === 'a' ? 'b' : 'a', offsetMs: r1, durationMs: r2 };
      default: return null;
    }
  }

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
        console.log(LOG, 'Battle finished. Winner:', updated.winner);
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
        // intro or decideLeader
        const delay = nextStage === 'decideLeader' ? 300 : 600;
        timersRef.current.main = setTimeout(() => advanceStage(updated), delay);
      }

      setCurrentBattle(updated);
      return updated;
    });
  }

  function scheduleSegmentEnd(segment, battle) {
    const targetPerf = performance.now() + segment.durationMs;
    pendingStageRef.current = { stage: battle.stage, end: targetPerf };

    const early = Math.max(0, (segment.durationMs - TRANSITION_BUFFER));
    timersRef.current.main = setTimeout(() => {
      const spin = () => {
        const now = performance.now();
        if (now >= targetPerf - 6) {
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

  function hasFullEnv() {
    return PLAYBACK_MODE === 'FULL';
  }

  async function startSegment(segment, battle) {
    if (battle.paused) return;
    const track = battle[segment.side];
    if (!track) return;

    if (hasFullEnv()) {
      await playSpotifySegment(track, segment.offsetMs);
    } else {
      playPreviewSegment(track, segment.side, segment.offsetMs, segment.durationMs);
    }
  }

  async function playSpotifySegment(track, offsetMs) {
    const tokensRaw = localStorage.getItem('spotifyTokens');
    if (!tokensRaw) {
      console.warn(LOG, 'No tokens for FULL playback, fallback preview');
      playPreviewSegment(track, 'a', offsetMs, SEGMENT_DURATIONS.round1);
      return;
    }
    let token;
    try { token = JSON.parse(tokensRaw).accessToken; } catch {}
    if (!token) {
      console.warn(LOG, 'Invalid token JSON, fallback preview');
      playPreviewSegment(track, 'a', offsetMs, SEGMENT_DURATIONS.round1);
      return;
    }
    if (!track.uri) {
      console.warn(LOG, 'Missing track.uri for full playback', track);
      return;
    }
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
      console.log(LOG, 'FULL play', track.name, 'offset', offsetMs);
    } catch (e) {
      console.warn(LOG, 'FULL play failed', e);
      if (track.preview_url) {
        playPreviewSegment(track, 'a', offsetMs, SEGMENT_DURATIONS.round1);
      }
    }
  }

  function playPreviewSegment(track, side, offsetMs, durationMs) {
    if (!track.preview_url) return;
    const seconds = Math.max(0.5, Math.min(durationMs, 30_000 - offsetMs) / 1000);
    playPreview(`SEG-${side}`, track.preview_url, seconds);
  }

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