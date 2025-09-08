import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SEGMENT_DURATIONS,
  TRANSITION_BUFFER,
  STAGE_GAP_MS,
  BATTLE_AUTOSTART_NEXT_DELAY,
  PLAYBACK_MODE,
  ALLOW_LIVE_VOTING_DURING_ALL_STAGES
} from '../config/playbackConfig.js';
import { playPreview } from '../lib/audioManager.js';

/**
 * Battle state machine stages:
 *  intro
 *  round1A
 *  round1B
 *  decideLeader
 *  round2First   (leader continues from 10s)
 *  round2Second  (other continues from 10s)
 *  finished
 *
 * Battle object shape:
 * {
 *   id,
 *   a, b (track objects),
 *   stage,
 *   leader, winner,
 *   votes: { a:Set<string>, b:Set<string> },
 *   startedAt, stageStartedAt,
 *   segments: [{key, trackSide, offsetMs, durationMs}],
 *   paused,
 *   ...
 * }
 */

let battleCounter = 0;

export default function useBattleEngine(spotifyClientId) {
  const [queue, setQueue] = useState([]);
  const [currentBattle, setCurrentBattle] = useState(null);
  const [spotifyPlayer, setSpotifyPlayer] = useState(null); // assume elsewhere you set it; kept for API parity
  const timersRef = useRef({ stage: null, drift: null });
  const rAFRef = useRef(null);

  // Simple public add
  const addTrack = useCallback((track) => {
    setQueue(q => [...q, track]);
  }, []);

  const addTrackList = useCallback((tracks) => {
    setQueue(q => [...q, ...tracks]);
  }, []);

  const clearTimers = () => {
    const { stage, drift } = timersRef.current;
    if (stage) clearTimeout(stage);
    if (drift) clearTimeout(drift);
    if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
    timersRef.current.stage = null;
    timersRef.current.drift = null;
  };

  const initBattle = useCallback(() => {
    if (queue.length < 2) return null;
    const [a, b, ...rest] = queue;
    setQueue(rest);
    const id = ++battleCounter;
    const battle = {
      id,
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

  const togglePause = useCallback(() => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      const paused = !prev.paused;
      if (paused) {
        clearTimers();
        if (PLAYBACK_MODE === 'FULL') {
          try { spotifyPlayer?.pause?.(); } catch {}
        } else {
          stopPreviewPlayback();
        }
      } else {
        // Resume same stage from scratch (simpler) or resume remaining time?
        // Simplest: restart current stage from its start; advanced resume is possible.
        restartStage(prev);
      }
      return { ...prev, paused };
    });
  }, [spotifyPlayer]);

  function stopPreviewPlayback() {
    if (previewAudioA.current) { previewAudioA.current.pause(); }
    if (previewAudioB.current) { previewAudioB.current.pause(); }
  }

  // Preview Audio Elements (for PREVIEW mode smoother control & manual seeking)
  const previewAudioA = useRef(null);
  const previewAudioB = useRef(null);

  // Ensure audio elements exist (PREVIEW)
  useEffect(() => {
    if (PLAYBACK_MODE !== 'PREVIEW') return;
    if (!previewAudioA.current) {
      previewAudioA.current = new Audio();
    }
    if (!previewAudioB.current) {
      previewAudioB.current = new Audio();
    }
  }, []);

  // Voting
  const vote = useCallback((choice, userId = 'anon') => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      if (!ALLOW_LIVE_VOTING_DURING_ALL_STAGES && prev.stage === 'finished') return prev;
      if (choice !== 'a' && choice !== 'b') return prev;
      const exists = prev.votes[choice].has(userId);
      if (exists) return prev;
      const nextVotes = {
        a: new Set(prev.votes.a),
        b: new Set(prev.votes.b)
      };
      nextVotes[choice].add(userId);
      return { ...prev, votes: nextVotes };
    });
  }, []);

  // PUBLIC: Start next battle
  const tryStartBattle = useCallback(() => {
    if (currentBattle) {
      // Already have one; start next only if finished
      if (currentBattle.stage !== 'finished') return;
    }
    const battle = initBattle();
    if (battle) {
      scheduleStage('round1A', battle);
    }
  }, [currentBattle, initBattle]);

  const nextBattle = tryStartBattle;

  // Force stage skip (dev utility)
  const forceNextStage = useCallback(() => {
    setCurrentBattle(prev => {
      if (!prev) return prev;
      clearTimers();
      advanceStage(prev);
      return prev;
    });
  }, []);

  function restartStage(battle) {
    // restart current stage from beginning
    scheduleStage(battle.stage, battle, true);
  }

  function computeLeader(battle) {
    const aVotes = battle.votes.a.size;
    const bVotes = battle.votes.b.size;
    if (aVotes === bVotes) {
      // tie-break random
      return Math.random() < 0.5 ? 'a' : 'b';
    }
    return aVotes > bVotes ? 'a' : 'b';
  }

  function computeWinner(battle) {
    // After full 30s each (we allow all votes)
    const aVotes = battle.votes.a.size;
    const bVotes = battle.votes.b.size;
    if (aVotes === bVotes) return null; // tie (you can handle tie-break)
    return aVotes > bVotes ? 'a' : 'b';
  }

  function buildSegmentParams(stage, battle) {
    // Returns { track, side, offsetMs, durationMs } or null
    if (!battle) return null;
    const r1 = SEGMENT_DURATIONS.round1;
    const r2 = SEGMENT_DURATIONS.round2;
    switch (stage) {
      case 'round1A':
        return { track: battle.a, side: 'a', offsetMs: 0, durationMs: r1 };
      case 'round1B':
        return { track: battle.b, side: 'b', offsetMs: 0, durationMs: r1 };
      case 'round2First': {
        const side = battle.leader;
        const track = battle[side];
        return { track, side, offsetMs: SEGMENT_DURATIONS.round1, durationMs: r2 };
      }
      case 'round2Second': {
        const side = battle.leader === 'a' ? 'b' : 'a';
        const track = battle[side];
        return { track, side, offsetMs: SEGMENT_DURATIONS.round1, durationMs: r2 };
      }
      default:
        return null;
    }
  }

  function scheduleStage(nextStage, battleArg, isRestart = false) {
    clearTimers();
    setCurrentBattle(prev => {
      const battle = battleArg || prev;
      if (!battle) return prev;
      const now = Date.now();
      let updated = { ...battle, stage: nextStage, stageStartedAt: now };

      // Special transitions
      if (nextStage === 'decideLeader') {
        updated.leader = computeLeader(updated);
      }
      if (nextStage === 'finished') {
        updated.winner = computeWinner(updated);
        // auto-schedule next battle
        if (BATTLE_AUTOSTART_NEXT_DELAY > 0) {
          timersRef.current.stage = setTimeout(() => {
            tryStartBattle();
          }, BATTLE_AUTOSTART_NEXT_DELAY);
        }
        setCurrentBattle(updated);
        return updated;
      }

      // Playback for segment stages
      const segment = buildSegmentParams(nextStage, updated);
      if (segment) {
        startSegmentPlayback(segment, updated);
        const endTarget = performance.now() + segment.durationMs;
        preciseStageTimeout(endTarget, () => {
          advanceStage(updated);
        });
      } else {
        // Non playback stage (intro/decideLeader)
        const autoAdvanceDelay = nextStage === 'decideLeader' ? 250 : 500;
        timersRef.current.stage = setTimeout(() => advanceStage(updated), autoAdvanceDelay);
      }
      setCurrentBattle(updated);
      return updated;
    });
  }

  function advanceStage(battleSnapshot) {
    setCurrentBattle(prev => {
      const battle = battleSnapshot || prev;
      if (!battle) return prev;
      let next;
      switch (battle.stage) {
        case 'intro':
          next = 'round1A'; break;
        case 'round1A':
          next = 'round1B'; break;
        case 'round1B':
          next = 'decideLeader'; break;
        case 'decideLeader':
          next = 'round2First'; break;
        case 'round2First':
          next = 'round2Second'; break;
        case 'round2Second':
          next = 'finished'; break;
        default:
          next = 'finished';
      }
      scheduleStage(next, battle);
      return battle;
    });
  }

  function preciseStageTimeout(targetPerfTime, cb) {
    // Schedule early then use rAF fine spin
    const early = Math.max(0, (targetPerfTime - performance.now()) - TRANSITION_BUFFER);
    timersRef.current.stage = setTimeout(() => {
      function spin() {
        if (performance.now() >= targetPerfTime - 5) {
          cb();
        } else {
          rAFRef.current = requestAnimationFrame(spin);
        }
      }
      spin();
    }, early);
  }

  function startSegmentPlayback(segment, battle) {
    if (battle.paused) return;
    if (!segment.track) return;
    if (PLAYBACK_MODE === 'FULL') {
      playSpotifySegment(segment);
    } else {
      playPreviewSegment(segment);
    }
  }

  async function playSpotifySegment({ track, offsetMs }) {
    // Expect spotifyPlayer externally managed in context
    try {
      // Fire and forget seek then play
      // (If track already loaded you can just seek; else call _playNew)
      await playOrLoadSpotify(track, offsetMs);
    } catch (e) {
      console.warn('[BattleEngine Spotify] segment playback error', e);
    }
  }

  async function playOrLoadSpotify(track, offsetMs) {
    if (!spotifyPlayer || !track?.uri) return;
    // We assume a helper not provided: implement inline
    // 1. Use Web API 'play' to set context to that track with start position
    const tokenRaw = localStorage.getItem('spotifyTokens');
    let accessToken = null;
    try { accessToken = JSON.parse(tokenRaw || 'null')?.accessToken; } catch {}
    if (!accessToken) return;

    // Use /me/player/play with uris single item
    await fetch('https://api.spotify.com/v1/me/player/play', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uris: [track.uri],
        position_ms: offsetMs
      })
    });
  }

  function playPreviewSegment({ track, offsetMs, durationMs, side }) {
    // Use dedicated audio elements for A/B so we can resume at offsets
    const el = side === 'a' ? previewAudioA.current : previewAudioB.current;
    if (!el) return;
    el.pause();
    if (!track.preview_url) {
      // fallback to a short beep or silence
      playPreview('SEG-' + side, track.preview_url || '', durationMs / 1000);
      return;
    }
    if (el.src !== track.preview_url) {
      el.src = track.preview_url;
      el.load();
    }
    el.currentTime = offsetMs / 1000;
    // small promise catch
    el.play().catch(()=>{});
    // Ensure other track is paused
    const other = side === 'a' ? previewAudioB.current : previewAudioA.current;
    if (other) other.pause();
  }

  // CLEANUP on unmount
  useEffect(() => clearTimers, []);

  return {
    queue,
    addTrack,
    addTrackList,
    currentBattle,
    tryStartBattle,
    vote,
    forceNextStage,
    togglePause,
    spotifyPlayer
  };
}