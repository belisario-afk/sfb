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
  const [spotifyPlayer, setSpotifyPlayer] = useState(null); // externally settable if needed

  const timersRef = useRef({ main: null, raf: null });
  const pendingStageRef = useRef(null);

  // Allow external injection of spotifyPlayer if you have a hook (optional)
  // Expose setter if needed outside:
  // useEffect(() => { setSpotifyPlayer(window.__SPOTIFY_PLAYER) }, []);

  const addTrack = useCallback((track) => {
    // Ensure we have a URI for FULL mode
    if (!track.uri && track.id) {
      track.uri = 'spotify:track:' + track.id;
    }
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
      console.warn(LOG, 'Cannot start new battle: current not finished.');
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
        console.log(LOG, 'Resuming stage', prev.stage);
        scheduleStage(prev.stage, prev, true);
      }
      return { ...prev, paused };
    });
  }, [spotifyPlayer]);

  const forceNextStage = useCallback(() => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      console.log(LOG, 'Force next stage from', prev.stage);
      clearTimers();
      advanceStage(prev);
      return prev;
    });
  }, []);

  // Stage logic
  function computeLeader(battle) {
    const av = battle.votes.a.size;
    const bv = battle.votes.b.size;
    if (av === bv) {
      return Math.random() < 0.5 ? 'a' : 'b';
    }
    return av > bv ? 'a' : 'b';
  }

  function computeWinner(battle) {
    const av = battle.votes.a.size;
    const bv = battle.votes.b.size;
    if (av === bv) return null;
    return av > bv ? 'a' : 'b';
  }

  function stageToSegment(stage, battle) {
    const r1 = SEGMENT_DURATIONS.round1;
    const r2 = SEGMENT_DURATIONS.round2;
    switch (stage) {
      case 'round1A': return { side: 'a', offsetMs: 0, durationMs: r1 };
      case 'round1B': return { side: 'b', offsetMs: 0, durationMs: r1 };
      case 'round2First': {
        const side = battle.leader;
        return { side, offsetMs: r1, durationMs: r2 };
      }
      case 'round2Second': {
        const side = battle.leader === 'a' ? 'b' : 'a';
        return { side, offsetMs: SEGMENT_DURATIONS.round1, durationMs: r2 };
      }
      default: return null;
    }
  }

  function advanceStage(battleSnapshot) {
    setCurrentBattle(prev => {
      const b = battleSnapshot || prev;
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
        // intro or decideLeader quick auto-advance
        const delay = nextStage === 'decideLeader' ? 300 : 600;
        timersRef.current.main = setTimeout(() => advanceStage(updated), delay);
      }

      setCurrentBattle(updated);
      return updated;
    });
  }

  function scheduleSegmentEnd(segment, battle) {
    const targetPerf = performance.now() + segment.durationMs;
    pendingStageRef.current = {
      stage: battle.stage,
      end: targetPerf
    };

    const earlyMs = Math.max(
      0,
      (segment.durationMs - TRANSITION_BUFFER)
    );

    timersRef.current.main = setTimeout(() => {
      // Fine spin with rAF to reduce drift
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
    }, earlyMs);
  }

  function haveFullPlaybackPrereqs() {
    if (PLAYBACK_MODE !== 'FULL') return false;
    // You can add more robust checks (token, scopes) if needed
    return true;
  }

  async function startSegment(segment, battle) {
    if (battle.paused) return;
    const isFull = haveFullPlaybackPrereqs();

    const track = battle[segment.side];
    if (!track) return;

    if (isFull) {
      await playFull(track, segment.offsetMs);
    } else {
      playPreviewSegment(track, segment.side, segment.offsetMs, segment.durationMs);
    }
  }

  async function playFull(track, offsetMs) {
    // Use /me/player/play with explicit position_ms
    const tokenRaw = localStorage.getItem('spotifyTokens');
    let accessToken = null;
    try { accessToken = JSON.parse(tokenRaw || 'null')?.accessToken; } catch {}
    if (!accessToken) {
      console.warn(LOG, 'No access token for FULL playback; fallback to preview');
      return;
    }
    if (!track.uri) {
      console.warn(LOG, 'Track missing uri (cannot full play):', track.name);
      return;
    }
    // Optionally: ensure device is active (transfer) before playing
    try {
      await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [track.uri],
          position_ms: offsetMs
        })
      });
      // no await after: we trust Spotify to start playback
      console.log(LOG, 'FULL segment start', { name: track.name, offsetMs });
    } catch (e) {
      console.warn(LOG, 'FULL playback failed; fallback preview', e);
      if (track.preview_url) {
        playPreview('FB-' + track.id.slice(0, 4), track.preview_url, SEGMENT_DURATIONS.round1 / 1000);
      }
    }
  }

  function playPreviewSegment(track, side, offsetMs, durationMs) {
    if (!track.preview_url) {
      // Skip silently - we do not want to spam logs
      return;
    }
    const secondsRemaining = Math.max(0, Math.min(durationMs, 30_000 - offsetMs) / 1000);
    if (secondsRemaining <= 0.2) return;
    // We approximate: start at offset by manipulating currentTime via new Audio object is expensive,
    // so just start from 0 if offsetMs is small; for 10s resume we can't reliably jump w/out manual element mgmt.
    playPreview(`SEG-${side}`, track.preview_url, secondsRemaining);
  }

  // Clean up on unmount
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
    setSpotifyPlayer // export setter if you need to inject the player externally
  };
}