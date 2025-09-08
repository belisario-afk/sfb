import { useState, useEffect, useRef, useCallback } from 'react';
import { stopAll } from '../lib/audioManager.js';
import { playBattleSegment } from '../lib/fullPlaybackController.js';
import { PLAYBACK_MODE } from '../config/playbackConfig.js';
import useSpotifyPlayer from './useSpotifyPlayer.js';
import { loadStoredTokens } from '../lib/spotify.js';

/**
 * Battle Engine supporting FULL or PREVIEW playback modes.
 * FULL mode uses Web Playback SDK (premium) else falls back to preview_url.
 */
const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;

export default function useBattleEngine() {
  const [queue, setQueue] = useState([]);
  const [currentBattle, setCurrentBattle] = useState(null);
  const timerRef = useRef(null);

  // Integrate player (even if PREVIEW mode we can ignore)
  const spotifyPlayer = useSpotifyPlayer(SPOTIFY_CLIENT_ID);

  const addTrack = (track) => {
    if (!track) return;
    setQueue(q => [...q, { ...track, _noPreview: !track.preview_url }]);
  };

  const tryStartBattle = useCallback(() => {
    setCurrentBattle(prev => {
      if (prev && prev.stage !== 'finished') return prev;
      return null;
    });

    setQueue(q => {
      if (q.length < 2) return q;
      const [a, b, ...rest] = q;
      setCurrentBattle({
        a,
        b,
        stage: 'intro',
        startedAt: Date.now(),
        votes: { a: new Set(), b: new Set() },
        round1Leader: null,
        winner: null,
        paused: false
      });
      return rest;
    });
  }, []);

  const playStageSegment = useCallback((battle, nextStage) => {
    const clientId = SPOTIFY_CLIENT_ID;
    if (!clientId) {
      console.warn('[Battle] Missing VITE_SPOTIFY_CLIENT_ID env var.');
    }
    const tokens = loadStoredTokens(); // used to decide if we can attempt full
    const attemptFull = !!tokens && PLAYBACK_MODE === 'FULL';

    let track = null;
    let sideLabel = '';
    if (nextStage === 'round1A') {
      track = battle.a; sideLabel = 'A';
    } else if (nextStage === 'round1B') {
      track = battle.b; sideLabel = 'B';
    } else if (nextStage === 'round2A') {
      if (battle.round1Leader === 'a') { track = battle.a; sideLabel = 'A'; }
      else { track = battle.b; sideLabel = 'B'; }
    } else if (nextStage === 'round2B') {
      if (battle.round1Leader === 'a') { track = battle.b; sideLabel = 'B'; }
      else { track = battle.a; sideLabel = 'A'; }
    }

    if (!track) return;

    playBattleSegment({
      clientId,
      track,
      stage: nextStage,
      sideLabel,
      spotifyPlayer,
      onFallback: () => {
        // optional logging or badge
      }
    });
  }, [spotifyPlayer]);

  const proceed = useCallback(() => {
    setCurrentBattle(b => {
      if (!b || b.paused) return b;
      const totalVotesA = b.votes.a.size;
      const totalVotesB = b.votes.b.size;
      const next = { ...b };

      switch (b.stage) {
        case 'intro':
          next.stage = 'round1A';
          playStageSegment(b, 'round1A');
          break;
        case 'round1A':
          next.stage = 'round1B';
          playStageSegment(b, 'round1B');
          break;
        case 'round1B':
          next.round1Leader = totalVotesA >= totalVotesB ? 'a' : 'b';
          next.stage = 'round2A';
          playStageSegment(next, 'round2A');
          break;
        case 'round2A':
          next.stage = 'round2B';
            playStageSegment(b, 'round2B');
          break;
        case 'round2B':
          next.stage = 'finished';
          next.winner = totalVotesA >= totalVotesB ? 'a' : 'b';
          stopAll();
          break;
        default:
          break;
      }
      return next;
    });
  }, [playStageSegment]);

  // Timers
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!currentBattle || currentBattle.paused) return;

    let delay = 2000;
    if (['round1A','round1B'].includes(currentBattle.stage)) delay = 10000;
    else if (['round2A','round2B'].includes(currentBattle.stage)) delay = 20000;
    else if (currentBattle.stage === 'finished') delay = 4000;

    timerRef.current = setTimeout(() => {
      if (currentBattle.stage === 'finished') {
        tryStartBattle();
      } else {
        proceed();
      }
    }, delay);

    return () => clearTimeout(timerRef.current);
  }, [currentBattle, proceed, tryStartBattle]);

  const vote = (choice, username) => {
    setCurrentBattle(b => {
      if (!b) return b;
      if (!['intro','round1A','round1B','round2A','round2B'].includes(b.stage)) return b;
      const next = {
        ...b,
        votes: { a: new Set(b.votes.a), b: new Set(b.votes.b) }
      };
      if (choice === 'a') next.votes.a.add(username.toLowerCase());
      if (choice === 'b') next.votes.b.add(username.toLowerCase());
      return next;
    });
  };

  return {
    queue,
    addTrack,
    currentBattle,
    tryStartBattle,
    vote,
    forceNextStage: () => proceed(),
    togglePause: () => {
      setCurrentBattle(b => b ? { ...b, paused: !b.paused } : b);
    },
    addTrackList: (list) => list.forEach(addTrack),
    spotifyPlayer
  };
}