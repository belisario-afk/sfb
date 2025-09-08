import { useState, useEffect, useRef, useCallback } from 'react';
import { playPreview, stopAll } from '../lib/audioManager.js';

/**
 * Manages queue, current battle states, timing & votes.
 * Updated to skip tracks without preview_url automatically.
 */
export default function useBattleEngine() {
  const [queue, setQueue] = useState([]);
  const [currentBattle, setCurrentBattle] = useState(null);
  const timerRef = useRef(null);

  const addTrack = (track) => {
    if (!track) return;
    // Mark missing preview
    const annotated = {
      ...track,
      _noPreview: !track.preview_url
    };
    setQueue(q => [...q, annotated]);
  };

  const sanitizeForBattle = (t) => {
    if (!t) return null;
    return t._noPreview ? null : t;
  };

  const tryStartBattle = useCallback(() => {
    setCurrentBattle(prev => {
      if (prev && prev.stage !== 'finished') return prev;
      return null;
    });
    setQueue(q => {
      if (q.length < 2) return q;
      // Pull until we have two with previews or run out
      let working = [...q];
      let candidateA = null;
      let candidateB = null;
      while (working.length > 0 && (!candidateA || !candidateB)) {
        const next = working.shift();
        if (!next._noPreview) {
          if (!candidateA) candidateA = next;
          else if (!candidateB) candidateB = next;
        } else {
          console.warn('[Battle] Skipping queued track with no preview:', next.name);
        }
      }
      if (!candidateA || !candidateB) {
        // Put back any we didn't use (skip those taken)
        const remaining = working;
        setTimeout(() => {
          // If we only found one valid track, keep it in queue front
          if (candidateA && !candidateB) {
            setQueue(old => [candidateA, ...remaining]);
          } else {
            setQueue(remaining);
          }
        }, 0);
        return q; // abort start
      }

      setCurrentBattle({
        a: candidateA,
        b: candidateB,
        stage: 'intro',
        startedAt: Date.now(),
        votes: { a: new Set(), b: new Set() },
        round1Leader: null,
        winner: null,
        paused: false
      });

      // Rebuild queue without used items + skipped no-preview ones
      const newQueue = working;
      return newQueue;
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
          console.warn('[Battle] Cannot play track (no preview):', track?.name);
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