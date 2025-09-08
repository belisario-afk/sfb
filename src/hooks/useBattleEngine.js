import { useState, useEffect, useRef, useCallback } from 'react';
import { playPreview, stopAll } from '../lib/audioManager.js';

/**
 * Manages queue, current battle states, timing & votes.
 */
export default function useBattleEngine() {
  const [queue, setQueue] = useState([]);
  const [currentBattle, setCurrentBattle] = useState(null);
  const timerRef = useRef(null);

  const addTrack = (track) => {
    setQueue(q => [...q, track]);
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
        a, b,
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

  // Core stage progression
  const proceed = useCallback(() => {
    setCurrentBattle(b => {
      if (!b) return b;
      if (b.paused) return b;
      const next = { ...b };
      const totalVotesA = b.votes.a.size;
      const totalVotesB = b.votes.b.size;
      switch (b.stage) {
        case 'intro':
          next.stage = 'round1A';
          playPreview('A', b.a.preview_url, 10);
          break;
        case 'round1A':
          next.stage = 'round1B';
          playPreview('B', b.b.preview_url, 10);
          break;
        case 'round1B':
          next.round1Leader = totalVotesA >= totalVotesB ? 'a' : 'b';
          if (next.round1Leader === 'a') {
            next.stage = 'round2A';
            playPreview('A', b.a.preview_url, 20);
          } else {
            next.stage = 'round2A';
            playPreview('B', b.b.preview_url, 20);
          }
          break;
        case 'round2A':
          // whichever didn't play now plays second
          if (b.round1Leader === 'a') {
            next.stage = 'round2B';
            playPreview('B', b.b.preview_url, 20);
          } else {
            next.stage = 'round2B';
            playPreview('A', b.a.preview_url, 20);
          }
          break;
        case 'round2B':
          next.stage = 'finished';
          next.winner = totalVotesA >= totalVotesB ? 'a' : 'b';
          stopAll();
          break;
        case 'finished':
        default:
          break;
      }
      return next;
    });
  }, []);

  // Timer logic for automatic stage transitions
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!currentBattle) return;
    if (currentBattle.paused) return;

    let delay = 2000; // intro
    if (currentBattle.stage === 'round1A' || currentBattle.stage === 'round1B') delay = 10000;
    else if (currentBattle.stage === 'round2A' || currentBattle.stage === 'round2B') delay = 20000;
    else if (currentBattle.stage === 'finished') {
      delay = 4000;
    }

    timerRef.current = setTimeout(() => {
      if (currentBattle.stage === 'finished') {
        // chain into next if queue ready
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
      const next = { ...b, votes: { a: new Set(b.votes.a), b: new Set(b.votes.b) } };
      if (choice === 'a') next.votes.a.add(username.toLowerCase());
      if (choice === 'b') next.votes.b.add(username.toLowerCase());
      return next;
    });
  };

  const forceNextStage = () => proceed();

  const togglePause = () => {
    setCurrentBattle(b => {
      if (!b) return b;
      const next = { ...b, paused: !b.paused };
      if (next.paused) {
        clearTimeout(timerRef.current);
      } else {
        // resume logic: just proceed sooner
        proceed();
      }
      return next;
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