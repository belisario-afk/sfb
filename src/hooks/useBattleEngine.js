import { useState, useEffect, useRef, useCallback } from 'react';
import { playPreview, stopAll } from '../lib/audioManager.js';

/**
 * Battle Engine
 * This version DOES NOT skip tracks without preview_url.
 * If a track has no preview, its stage will just be silent while votes can still happen.
 */
export default function useBattleEngine() {
  const [queue, setQueue] = useState([]);
  const [currentBattle, setCurrentBattle] = useState(null);
  const timerRef = useRef(null);

  const addTrack = (track) => {
    if (!track) return;
    const annotated = {
      ...track,
      _noPreview: !track.preview_url
    };
    setQueue(q => [...q, annotated]);
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

  const proceed = useCallback(() => {
    setCurrentBattle(b => {
      if (!b) return b;
      if (b.paused) return b;

      const next = { ...b };
      const totalVotesA = b.votes.a.size;
      const totalVotesB = b.votes.b.size;

      const playIfPreview = (label, track, dur) => {
        if (!track?.preview_url) {
          console.warn('[Battle] No preview for track:', track?.name);
          return;
        }
        playPreview(label, track.preview_url, dur);
      };

      switch (b.stage) {
        case 'intro':
          next.stage = 'round1A';
          playIfPreview('A', b.a, 10);
          break;
        case 'round1A':
          next.stage = 'round1B';
          playIfPreview('B', b.b, 10);
          break;
        case 'round1B':
          next.round1Leader = totalVotesA >= totalVotesB ? 'a' : 'b';
          next.stage = 'round2A';
          if (next.round1Leader === 'a') {
            playIfPreview('A', b.a, 20);
          } else {
            playIfPreview('B', b.b, 20);
          }
          break;
        case 'round2A':
          next.stage = 'round2B';
          if (b.round1Leader === 'a') {
            playIfPreview('B', b.b, 20);
          } else {
            playIfPreview('A', b.a, 20);
          }
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
  }, []);

  // Automatic stage timing
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!currentBattle) return;
    if (currentBattle.paused) return;

    let delay = 2000;
    if (currentBattle.stage === 'round1A' || currentBattle.stage === 'round1B') delay = 10000;
    else if (currentBattle.stage === 'round2A' || currentBattle.stage === 'round2B') delay = 20000;
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
    const key = choice === 'a' ? 'a' : choice === 'b' ? 'b' : null;
    if (!key) return;
    setCurrentBattle(b => {
      if (!b) return b;
      if (!['intro','round1A','round1B','round2A','round2B'].includes(b.stage)) return b;
      const next = {
        ...b,
        votes: {
          a: new Set(b.votes.a),
            b: new Set(b.votes.b)
        }
      };
      next.votes[key].add(username.toLowerCase());
      return next;
    });
  };

  const forceNextStage = () => proceed();

  const togglePause = () => {
    setCurrentBattle(b => {
      if (!b) return b;
      return { ...b, paused: !b.paused };
    });
  };

  return {
    queue,
    addTrack,
    currentBattle,
    tryStartBattle,
    vote,
    forceNextStage,
    togglePause,
    addTrackList: (list) => setQueue(q => [...q, ...list])
  };
}