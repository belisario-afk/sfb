import { useState, useEffect, useRef, useCallback } from 'react';
import { playPreview, stopAll } from '../lib/audioManager.js';

/**
 * Battle Engine (keeps tracks even without preview_url)
 */
export default function useBattleEngine() {
  const [queue, setQueue] = useState([]);
  const [currentBattle, setCurrentBattle] = useState(null);
  const timerRef = useRef(null);

  const addTrack = (track) => {
    if (!track) return;
    const annotated = { ...track, _noPreview: !track.preview_url };
    setQueue(q => [...q, annotated]);
    console.log('[Battle] Added track', track.name, 'preview?', !!track.preview_url);
  };

  const tryStartBattle = useCallback(() => {
    setCurrentBattle(prev => {
      if (prev && prev.stage !== 'finished') return prev;
      return null;
    });

    setQueue(q => {
      if (q.length < 2) return q;
      const [a, b, ...rest] = q;
      console.log('[Battle] Starting battle:', a.name, 'vs', b.name);
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

  const attemptPlay = (label, track, dur) => {
    console.log('[Battle] Attempt play', label, track?.name, 'preview?', !!track?.preview_url);
    if (!track?.preview_url) return;
    playPreview(label, track.preview_url, dur);
  };

  const proceed = useCallback(() => {
    setCurrentBattle(b => {
      if (!b || b.paused) return b;
      const next = { ...b };
      const totalVotesA = b.votes.a.size;
      const totalVotesB = b.votes.b.size;

      switch (b.stage) {
        case 'intro':
          next.stage = 'round1A';
          attemptPlay('A', b.a, 10);
          break;
        case 'round1A':
          next.stage = 'round1B';
          attemptPlay('B', b.b, 10);
          break;
        case 'round1B':
          next.round1Leader = totalVotesA >= totalVotesB ? 'a' : 'b';
          next.stage = 'round2A';
          if (next.round1Leader === 'a') attemptPlay('A', b.a, 20);
          else attemptPlay('B', b.b, 20);
          break;
        case 'round2A':
          next.stage = 'round2B';
          if (b.round1Leader === 'a') attemptPlay('B', b.b, 20);
          else attemptPlay('A', b.a, 20);
          break;
        case 'round2B':
          next.stage = 'finished';
          next.winner = totalVotesA >= totalVotesB ? 'a' : 'b';
          stopAll();
          console.log('[Battle] Battle finished. Winner:', next.winner);
          break;
        default:
          break;
      }
      return next;
    });
  }, []);

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
    addTrackList: (list) => setQueue(q => [...q, ...list])
  };
}